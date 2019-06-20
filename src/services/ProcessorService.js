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
    const [rows] = await mySqlPool.query('SELECT * FROM `group` WHERE `name` = ?', [name]);
    logger.debug(`${rows.length} records found for group name = ${name}`);
    return rows.length;
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
    const count = await checkGroupExist(message.payload.name);
    if (count > 0) {
      throw new Error(`Group with name ${message.payload.name} is already exist`);
    }

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

    logger.debug('Creating group in Authorization DB');
    await mySqlConn.query('START TRANSACTION');
    logger.debug('AuroraDB Transaction Started');

    const [results] = await mySqlConn.query('INSERT INTO `group` SET ?', rawPayload);
    const groupLegacyId = results.insertId;
    logger.debug(`Group has been created with id = ${groupLegacyId} in Authorization DB`);

    logger.debug(`Updating Neo4J DB with ${groupLegacyId}`);
    await neoSession.run(`MATCH (g:Group {id: {id}}) SET g.oldId={oldId} RETURN g`, {
      id: message.payload.id,
      oldId: String(groupLegacyId)
    });

    logger.debug(`Creating record in SecurityGroups`);
    await informixSession.beginTransactionAsync();

    const params = {
      group_id: groupLegacyId,
      description: rawPayload.name,
      create_user_id: rawPayload.createdBy,
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
    logger.debug('Records have been created in DBs');
  } catch (error) {
    logger.error(error);
    await informixSession.rollbackTransactionAsync();
    await mySqlConn.query('ROLLBACK');
    logger.debug('Rollback Transaction');
  } finally {
    neoSession.close();
    await informixSession.closeAsync();
    await mySqlConn.release();
    logger.debug('DB connection closed');
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
  logger.debug('Getting informix session');
  const informixSession = await helper.getInformixConnection();
  logger.debug('informix session acquired');

  //get aurora db connection
  logger.debug('Getting auroradb session');
  const mySqlSession = await helper.getAuroraConnection();
  const mySqlConn = await mySqlSession.getConnection();
  logger.debug('auroradb session acquired');

  try {
    const count = await checkGroupExist(message.payload.name);
    if (count == 0) {
      throw new Error(`Group with name ${message.payload.name} not exist`);
    }

    const timestamp = moment(Date.parse(message.payload.updatedBy)).format('YYYY-MM-DD HH:mm:ss');
    const updateParams = [
      _.get(message, 'payload.name'),
      _.get(message, 'payload.description'),
      _.get(message, 'payload.privateGroup') ? true : false,
      _.get(message, 'payload.selfRegister') ? true : false,
      Number(_.get(message, 'payload.modifiedBy')),
      timestamp,
      Number(_.get(message, 'payload.oldId'))
    ];
    logger.debug(`rawpayload = ${updateParams}`);

    logger.debug('Creating group in Authorization DB');
    await mySqlConn.query('START TRANSACTION');
    logger.debug('AuroraDB Transaction Started');

    const updateQuery =
      'UPDATE `group` SET `name` = ?, `description` = ?, `private_group` = ?, `self_register` = ?, `modifiedBy` = ?, modifiedAt = ? WHERE `id` = ?';

    const [results] = await mySqlConn.query(updateQuery, updateParams);

    logger.debug(`Creating record in SecurityGroups`);
    await informixSession.beginTransactionAsync();

    const params = {
      group_id: Number(_.get(message, 'payload.oldId')),
      description: _.get(message, 'payload.name')
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
    await mySqlConn.query('COMMIT');
    logger.debug('Records have been updated in DBs');
  } catch (error) {
    logger.error(error);
    await informixSession.rollbackTransactionAsync();
    await mySqlConn.query('ROLLBACK');
    logger.debug('Rollback Transaction');
  } finally {
    await informixSession.closeAsync();
    await mySqlConn.release();
    logger.debug('DB connection closed');
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
          id: joi
            .string()
            .uuid()
            .required(),
          name: joi
            .string()
            .min(2)
            .max(50)
            .required(),
          oldId: joi
            .number()
            .integer()
            .required(),
          description: joi.string().max(500),
          domain: joi.string().max(100),
          privateGroup: joi.boolean().required(),
          selfRegister: joi.boolean().required(),
          updatedBy: joi.string(),
          updatedAt: joi.date()
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
  logger.debug('Getting informix session');
  const informixSession = await helper.getInformixConnection();
  logger.debug('informix session acquired');

  //get aurora db connection
  logger.debug('Getting auroradb session');
  const mySqlSession = await helper.getAuroraConnection();
  const mySqlConn = await mySqlSession.getConnection();
  logger.debug('auroradb session acquired');

  try {
    logger.debug(JSON.stringify(message));
    //   const count = await checkGroupExist(message.payload.name);
    //   if (count == 0) {
    //     throw new Error(`Group with name ${message.payload.name} not exist`);
    //   }
    //   const timestamp = moment(Date.parse(message.payload.updatedBy)).format('YYYY-MM-DD HH:mm:ss');
    //   const updateParams = [
    //     _.get(message, 'payload.name'),
    //     _.get(message, 'payload.description'),
    //     _.get(message, 'payload.privateGroup') ? true : false,
    //     _.get(message, 'payload.selfRegister') ? true : false,
    //     Number(_.get(message, 'payload.modifiedBy')),
    //     timestamp,
    //     Number(_.get(message, 'payload.oldId'))
    //   ];
    //   logger.debug(`rawpayload = ${updateParams}`);
    //   logger.debug('Creating group in Authorization DB');
    //   await mySqlConn.query('START TRANSACTION');
    //   logger.debug('AuroraDB Transaction Started');
    //   const updateQuery =
    //     'UPDATE `group` SET `name` = ?, `description` = ?, `private_group` = ?, `self_register` = ?, `modifiedBy` = ?, modifiedAt = ? WHERE `id` = ?';
    //   const [results] = await mySqlConn.query(updateQuery, updateParams);
    //   logger.debug(`Creating record in SecurityGroups`);
    //   await informixSession.beginTransactionAsync();
    //   const params = {
    //     group_id: Number(_.get(message, 'payload.oldId')),
    //     description: _.get(message, 'payload.name')
    //   };
    //   const normalizedPayload = _.omitBy(params, _.isUndefined);
    //   const keys = Object.keys(normalizedPayload);
    //   const fields = keys.map(key => `${key} = ?`).join(', ');
    //   const updateGroupStmt = await prepare(
    //     informixSession,
    //     `update security_groups_test set ${fields} where group_id = ${params.group_id}`
    //   );
    //   await updateGroupStmt.executeAsync(Object.values(normalizedPayload));
    //   await informixSession.commitTransactionAsync();
    //   await mySqlConn.query('COMMIT');
    //   logger.debug('Records have been updated in DBs');
  } catch (error) {
    //   logger.error(error);
    //   await informixSession.rollbackTransactionAsync();
    //   await mySqlConn.query('ROLLBACK');
    //   logger.debug('Rollback Transaction');
  } finally {
    //   await informixSession.closeAsync();
    //   await mySqlConn.release();
    //   logger.debug('DB connection closed');
  }
}

deleteGroup.schema = {
  message: joi.array().items(
    joi
      .object()
      .keys({
        id: joi.string().uuid(),
        name: joi
          .string()
          .min(2)
          .max(50),
        oldId: joi
          .number()
          .integer()
          .required(),
        description: joi.string().max(500),
        domain: joi.string().max(100),
        privateGroup: joi.boolean(),
        selfRegister: joi.boolean(),
        createdBy: joi.string(),
        createdAt: joi.date()
      })
      .required()
  )
};

/**
 * Add members to the group
 * @param {Object} message the kafka message
 */
async function addMembersToGroup(message) {
  //get aurora db connection
  logger.debug('Getting auroradb session');
  const mySqlSession = await helper.getAuroraConnection();
  const mySqlConn = await mySqlSession.getConnection();
  logger.debug('auroradb session acquired');

  try {
    const count = await checkGroupExist(message.payload.name);
    if (count == 0) {
      throw new Error(`Group with name ${message.payload.name} is not exist`);
    }

    const timestamp = moment(Date.parse(message.timestamp)).format('YYYY-MM-DD HH:mm:ss');
    const rawPayload = {
      group_id: Number(_.get(message, 'payload.oldId')),
      membership_type: _.get(message, 'payload.membershipType') === 'group' ? 2 : 1,
      member_id: Number(
        _.get(message, 'payload.membershipType') === 'group'
          ? _.get(message, 'payload.memberOldId')
          : _.get(message, 'payload.memberId')
      ),
      createdBy: Number(_.get(message, 'payload.createdBy')),
      modifiedBy: Number(_.get(message, 'payload.createdBy')),
      createdAt: timestamp,
      modifiedAt: timestamp
    };
    logger.debug(`rawpayload = ${JSON.stringify(rawPayload)}`);

    await mySqlConn.query('START TRANSACTION');
    logger.debug('AuroraDB Transaction Started');

    await mySqlConn.query('INSERT INTO `group_membership` SET ?', rawPayload);

    await mySqlConn.query('COMMIT');
    logger.debug('Records have been created in DBs');
  } catch (error) {
    logger.error(error);
    await mySqlConn.query('ROLLBACK');
    logger.debug('Rollback Transaction');
  } finally {
    await mySqlConn.release();
    logger.debug('DB connection closed');
  }
}

addMembersToGroup.schema = {
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
          id: joi.string().uuid(),
          groupId: joi.string().uuid(),
          name: joi
            .string()
            .min(2)
            .max(50)
            .required(),
          createdBy: joi.string(),
          createdAt: joi.date(),
          memberId: joi.string(),
          oldId: joi.string().required(),
          memberOldId: joi.string(),
          membershipType: joi.string().required()
        })
        .required()
    })
    .required()
};

/**
 * Remove member from group
 * @param {Object} message the kafka message
 */
async function removeMembersFromGroup(message) {
  //get aurora db connection
  logger.debug('Getting auroradb session');
  const mySqlSession = await helper.getAuroraConnection();
  const mySqlConn = await mySqlSession.getConnection();
  logger.debug('auroradb session acquired');

  try {
    const count = await checkGroupExist(message.payload.name);
    if (count == 0) {
      throw new Error(`Group with name ${message.payload.name} is not exist`);
    }

    const rawPayload = {
      group_id: Number(_.get(message, 'payload.oldId')),
      member_id: Number(_.get(message, 'payload.memberId'))
    };

    logger.debug(`rawpayload = ${JSON.stringify(rawPayload)}`);

    await mySqlConn.query('START TRANSACTION');
    logger.debug('AuroraDB Transaction Started');

    await mySqlConn.query('DELETE FROM `group_membership` WHERE `group_id` = ? and `member_id` = ?', [
      rawPayload.group_id,
      rawPayload.member_id
    ]);

    await mySqlConn.query('COMMIT');
    logger.debug('Records have been deleted from DBs');
  } catch (error) {
    logger.error(error);
    await mySqlConn.query('ROLLBACK');
    logger.debug('Rollback Transaction');
  } finally {
    await mySqlConn.release();
    logger.debug('DB connection closed');
  }
}

removeMembersFromGroup.schema = {
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
          groupId: joi
            .string()
            .uuid()
            .required(),
          name: joi.string().required(),
          oldId: joi.string().required(),
          memberId: joi.string().required()
        })
        .required()
    })
    .required()
};

module.exports = {
  createGroup,
  updateGroup,
  deleteGroup,
  addMembersToGroup,
  removeMembersFromGroup
};

logger.buildService(module.exports);
