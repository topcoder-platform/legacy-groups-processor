/**
 * Processor Service
 */

const _ = require('lodash');
const joi = require('joi');
const logger = require('../common/logger');
const helper = require('../common/helper');
const moment = require('moment');

/**
 * Prepare Informix statement
 * @param {Object} connection the Informix connection
 * @param {String} sql the sql
 * @return {Object} Informix statement
 */
async function prepare(connection, sql) {
  const stmt = await connection.prepareAsync(sql);
  return Promise.promisifyAll(stmt);
}

/**
 * Check duplicate group
 * @param {Number} id the group id
 * @param {String} name the group name
 * @param {Object} connection the Informix connection
 */
async function checkGroupExist(name) {
  const mySqlPool = await helper.getAuroraConnection();

  logger.debug(`Checking for existence of Group = ${name}`);
  try {
    const [rows, fields] = await mySqlPool.query('SELECT * FROM `group` WHERE `name` = ?', [name]);
    logger.debug(rows);
    logger.debug(fields);
    // if (results.length > 0) {
    throw new Error(`The group name ${name} is already used`);
    // }
    // logger.debug(`Group not found with name = ${name}`);
  } catch (error) {
    logger.error(error);
    throw error;
  }
}

/**
 * Process create group message
 * @param {Object} message the kafka message
 */
async function createGroup(message) {
  //get informix db connection
  logger.debug('Getting informix session');
  const informixSession = await helper.getInformixConnection();
  logger.debug('informix session acquired');

  //get neo4j db connection
  logger.debug('Getting neo4j session');
  const neoSession = await helper.getNeoSession();
  logger.debug('neo4j session acquired');

  //get aurora db connection
  logger.debug('Getting auroradb session');
  const mySqlSession = await helper.getAuroraConnection();
  const mySqlConn = await mySqlSession.getConnection();
  logger.debug('auroradb session acquired');

  try {
    // Check if group with same name exist or not
    await checkGroupExist(message.payload.name);

    const timestamp = moment(Date.parse(message.timestamp)).format('YYYY-MM-DD HH:mm:ss');
    const rawPayload = {
      name: _.get(message, 'payload.name'),
      description: _.get(message, 'payload.description'),
      private_group: _.get(message, 'payload.privateGroup') ? true : false,
      self_register: _.get(message, 'payload.selfRegister') ? true : false,
      createdBy: Number(_.get(message, 'payload.createdBy')),
      modifiedBy: Number(_.get(message, 'payload.createdBy')),
      createdAt: timestamp,
      modifiedAt: timestamp
    };
    logger.debug(`rawpayload = ${JSON.stringify(rawPayload)}`);

    // Insert data back to `Aurora DB`
    logger.debug('Creating group in Authorization DB');
    // await mySqlSession.getConnection().beginTransaction();
    await mySqlConn.query('START TRANSACTION');
    logger.debug('AuroraDB Transaction Started');
    const results = await mySqlConn.query('INSERT INTO `group` SET ?', rawPayload);
    const groupLegacyId = results.insertId;
    logger.debug(`Group has been created with id = ${groupLegacyId} in Authorization DB`);

    logger.debug(`Updating Neo4J DB with ${groupLegacyId}`);
    // Update `legacyGroupId` back to Neo4J
    await neoSession.run(`MATCH (g:Group {id: {id}}) SET g.oldId={oldId} RETURN g`, {
      id: message.payload.id,
      oldId: groupLegacyId
    });

    logger.debug(`Creating record in SecurityGroups`);
    // Create a record in `securitygroups` table of Infromix DB
    await informixSession.beginTransactionAsync();

    const params = {
      group_id: groupLegacyId,
      description: rawPayload.name,
      created_user_id: rawPayload.createdBy,
      challenge_group_ind: 1
    };
    const normalizedPayload = _.omitBy(params, _.isUndefined);
    const fields = Object.keys(normalizedPayload);
    const values = _.fill(Array(fields.length), '?');

    const createGroupStmt = await prepare(
      informixSession,
      `insert into security_groups_test (${fields.join(', ')}) values (${values.join(', ')})`
    );

    await createGroupStmt.executeAsync(Object.values(normalizedPayload));
    await informixSession.commitTransactionAsync();
    await mySqlConn.query('COMMIT');
  } catch (error) {
    logger.error(error);
    await informixSession.rollbackTransactionAsync();
    await mySqlConn.query('ROLLBACK');
  } finally {
    neoSession.close();
    await informixSession.closeAsync();
    await mySqlConn.release();
  }
}

createGroup.schema = {
  message: joi
    .object()
    .keys({
      topic: joi.string().required(),
      originator: joi.string().required(),
      timestamp: joi.date().required(),
      'mime-type': joi.string().required(),
      payload: joi
        .object()
        .keys({
          id: joi
            .string()
            .uuid()
            .required(),
          name: joi
            .string()
            .min(2)
            .max(50)
            .required(),
          description: joi.string().max(500),
          domain: joi.string().max(100),
          privateGroup: joi.boolean().required(),
          selfRegister: joi.boolean().required(),
          createdBy: joi.string(),
          createdAt: joi.date()
        })
        .required()
    })
    .required()
};

/**
 * Process update group message
 * @param {Object} message the kafka message
 */
async function updateGroup(message) {
  //get informix db connection
  const informixSession = helper.getInformixConnection();

  try {
    // Check if group with same name exist or not
    await checkGroupExist(message.payload.name);

    // prepare the statement for updating the group data
    const rawPayload = {
      name: _.get(message, 'payload.name'),
      id: _.get(message, 'payload.oldId'),
      description: _.get(message, 'payload.description'),
      private_group: _.get(message, 'payload.privateGroup') ? 'true' : 'false',
      self_register: _.get(message, 'payload.selfRegister') ? 'true' : 'false',
      modifiedBy: _.get(message, 'payload.updatedBy')
    };

    // Update data back to `Autorization DB`
    let mySqlSession = helper.getAuroraConnection();
    mySqlSession.query(
      `UPDATE Authorization.group SET name = "${rawPayload.name}", description = "${
        rawPayload.description
      }", private_group = ${rawPayload.private_group}, self_register = ${rawPayload.self_register}, modifiedBy = ${
        rawPayload.modifiedBy
      }, modifiedAt = current_timestamp WHERE id = ${rawPayload.id}`,
      function(error) {
        if (error) throw error;
        logger.debug(`Group has been updated`);
      }
    );

    // Update a record in `securitygroups` table of Infromix DB
    await informixSession.beginTransactionAsync();

    const params = {
      group_id: rawPayload.id,
      description: rawPayload.name,
      created_user_id: rawPayload.createdBy,
      challenge_group_ind: 1
    };
    const normalizedPayload = _.omitBy(params, _.isUndefined);
    const keys = Object.keys(normalizedPayload);
    const fields = keys.map(key => `${key} = ?`).join(', ');

    const updateGroupStmt = await prepare(
      informixSession,
      `update security_groups_test set ${fields} where group_id = ${params.group_id}`
    );

    await updateGroupStmt.executeAsync(Object.values(normalizedPayload));
    await informixSession.commitTransactionAsync();
  } catch (error) {
    logger.error(error);
    await informixSession.rollbackTransactionAsync();
  } finally {
    await informixSession.closeAsync();
  }
}

updateGroup.schema = {
  message: joi
    .object()
    .keys({
      topic: joi.string().required(),
      originator: joi.string().required(),
      timestamp: joi.date().required(),
      'mime-type': joi.string().required(),
      payload: joi
        .object()
        .keys({
          oldId: joi
            .number()
            .integer()
            .required(),
          name: joi
            .string()
            .min(2)
            .max(50)
            .required(),
          description: joi.string().max(500),
          domain: joi.string().max(100),
          privateGroup: joi.boolean().required(),
          selfRegister: joi.boolean().required(),
          updatedBy: joi.string()
        })
        .required()
    })
    .required()
};

/**
 * Process delete group message
 * @param {Object} message the kafka message
 */
async function deleteGroup(message) {
  //get informix db connection
  const informixSession = helper.getInformixConnection();

  try {
    // Check if group with same name exist or not
    await checkGroupExist(message.payload.name);

    // Delete group from `Autorization DB`
    let mySqlSession = helper.getAuroraConnection();
    mySqlSession.query(`DELETE FROM Authorization.group WHERE id = "${message.payload.oldId}"`, function(error) {
      if (error) throw error;
    });

    const deleteGroupStmt = await prepare(informixSession, 'delete from security_groups_test where id = ?');
    await deleteGroupStmt.executeAsync([message.payload.oldId]);
    await informixSession.commitTransactionAsync();
  } catch (error) {
    logger.error(error);
    await informixSession.rollbackTransactionAsync();
  } finally {
    await informixSession.closeAsync();
  }
}

deleteGroup.schema = {
  message: joi
    .object()
    .keys({
      topic: joi.string().required(),
      originator: joi.string().required(),
      timestamp: joi.date().required(),
      'mime-type': joi.string().required(),
      payload: joi
        .object()
        .keys({
          oldId: joi
            .number()
            .integer()
            .required()
        })
        .required()
    })
    .required()
};

/**
 * TODO - Implement this function
 * Add members to the group
 * @param {Object} message the kafka message
 */
async function addMembersToGroup(message) {
  //get informix db connection
  // const informixSession = helper.getInformixConnection();
  // try {
  //   // Check if group with same name exist or not
  //   await checkGroupExist(message.payload.name);
  //   // Delete group from `Autorization DB`
  //   let mySqlSession = helper.getAuroraConnection();
  //   mySqlSession.query(`DELETE FROM Authorization.group WHERE id = "${message.payload.oldId}"`, function(error) {
  //     if (error) throw error;
  //   });
  //   const deleteGroupStmt = await prepare(informixSession, 'delete from security_groups_test where id = ?');
  //   await deleteGroupStmt.executeAsync([message.payload.oldId]);
  //   await informixSession.commitTransactionAsync();
  // } catch (error) {
  //   logger.error(error);
  //   await informixSession.rollbackTransactionAsync();
  // } finally {
  //   await informixSession.closeAsync();
  // }
}

module.exports = {
  createGroup,
  updateGroup,
  deleteGroup,
  addMembersToGroup
};

logger.buildService(module.exports);
