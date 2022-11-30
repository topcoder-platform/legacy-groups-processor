/**
 * Processor Service
 */

const _ = require('lodash')
const config = require('config')
const joi = require('joi')
const moment = require('moment')
const request = require('request-promise')
const logger = require('../common/logger')
const helper = require('../common/helper')

/**
 * Prepare Informix statement
 * @param {Object} connection the Informix connection
 * @param {String} sql the sql
 * @return {Object} Informix statement
 */
async function prepare (connection, sql) {
  const stmt = await connection.prepareAsync(sql)
  return Promise.promisifyAll(stmt)
}

/**
 * Check duplicate group
 * @param {Number} id the group id
 * @param {String} name the group name
 * @param {Object} connection the Informix connection
 */
async function checkGroupExist (name) {
  const mySqlConn = await helper.mysqlPool.getConnection()

  logger.debug(`Checking for existence of Group = ${name}`)
  try {
    const [rows] = await mySqlConn.query('SELECT * FROM `group` WHERE `name` = ?', [name])
    logger.debug(`${rows.length} records found for group name = ${name}`)
    return rows.length
  } catch (error) {
    logger.error(error)
    throw error
  } finally {
    await mySqlConn.release()
  }
}

/**
 * Process create group message
 * @param {Object} message the kafka message
 */
async function createGroup (message) {
  // get informix db connection
  logger.debug('Getting informix session')
  const informixSession = await helper.getInformixConnection()
  logger.debug('informix session acquired')

  // get neo4j db connection
  logger.debug('Getting neo4j session')
  const neoSession = await helper.getNeoSession()
  logger.debug('neo4j session acquired')

  // get aurora db connection
  logger.debug('Getting auroradb session')
  const mySqlConn = await helper.mysqlPool.getConnection()
  logger.debug('auroradb session acquired')

  // used for neo4j transaction
  let tx = null
  try {
    const count = await checkGroupExist(message.payload.name)
    if (count > 0) {
      throw new Error(`Group with name ${message.payload.name} is already exist`)
    }

    const timestamp = moment(Date.parse(message.timestamp)).format('YYYY-MM-DD HH:mm:ss')

    const createdBy = _.i

    const rawPayload = {
      name: _.get(message, 'payload.name'),
      description: _.get(message, 'payload.description'),
      private_group: _.get(message, 'payload.privateGroup') ? true : false,
      self_register: _.get(message, 'payload.selfRegister') ? true : false,
      ...(_.get(message, 'payload.createdBy') ? {createdBy: Number(_.get(message, 'payload.createdBy'))} : {}),
      ...(_.get(message, 'payload.createdBy') ? {modifiedBy: Number(_.get(message, 'payload.createdBy'))} : {}),
      createdAt: timestamp,
      modifiedAt: timestamp
    }
    logger.debug(`rawpayload = ${JSON.stringify(rawPayload)}`)

    logger.debug('Creating group in Authorization DB')
    await mySqlConn.query('START TRANSACTION')
    logger.debug('AuroraDB Transaction Started')

    const [results] = await mySqlConn.query('INSERT INTO `group` SET ?', rawPayload)
    const groupLegacyId = results.insertId
    logger.debug(`Group has been created with id = ${groupLegacyId} in Authorization DB`)

    logger.debug(`Updating Neo4J DB with ${groupLegacyId}`)
    tx = neoSession.beginTransaction()
    await tx.run('MATCH (g:Group {id: $id}) SET g.oldId=$oldId RETURN g', {
      id: message.payload.id,
      oldId: String(groupLegacyId)
    })
    await tx.commit()

    logger.debug(`Creating record in SecurityGroups`)
    await informixSession.beginTransactionAsync()

    const params = {
      group_id: groupLegacyId,
      description: rawPayload.name,
      create_user_id: rawPayload.createdBy,
      challenge_group_ind: 1
    }
    const normalizedPayload = _.omitBy(params, _.isUndefined)
    const fields = Object.keys(normalizedPayload)
    const values = _.fill(Array(fields.length), '?')

    const createGroupStmt = await prepare(
      informixSession,
      `insert into security_groups (${fields.join(', ')}) values (${values.join(', ')})`
    )

    await createGroupStmt.executeAsync(Object.values(normalizedPayload))
    await informixSession.commitTransactionAsync()
    await mySqlConn.query('COMMIT')
    logger.debug('Records have been created in DBs')
  } catch (error) {
    logger.error(error)
    if (tx) {
      await tx.rollback()
    }
    await informixSession.rollbackTransactionAsync()
    await mySqlConn.query('ROLLBACK')
    logger.debug('Rollback Transaction')
  } finally {
    await neoSession.close()
    await informixSession.closeAsync()
    await mySqlConn.release()
    logger.debug('DB connection closed')
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
          id: joi.string().uuid().required(),
          name: joi.string().min(2).max(150).required(),
          description: joi.string().max(500),
          domain: joi.string().max(100).allow('', null),
          privateGroup: joi.boolean().required(),
          selfRegister: joi.boolean().required(),
          createdBy: joi.string(),
          createdAt: joi.date(),
          ssoId: joi.string().max(100).allow('', null),
          organizationId: joi.string().allow('', null),
          status: joi.string()
        })
        .required()
    })
    .required()
}

/**
 * Process update group message
 * @param {Object} message the kafka message
 */
async function updateGroup (message) {
  // get informix db connection
  logger.debug('Getting informix session')
  const informixSession = await helper.getInformixConnection()
  logger.debug('informix session acquired')

  // get aurora db connection
  logger.debug('Getting auroradb session')
  const mySqlConn = await helper.mysqlPool.getConnection()
  logger.debug('auroradb session acquired')

  try {
    const count = await checkGroupExist(message.payload.oldName)
    if (count === 0) {
      throw new Error(`Group with name ${message.payload.oldName} not exist`)
    }

    const timestamp = moment(Date.parse(message.payload.updatedAt)).format('YYYY-MM-DD HH:mm:ss')
    const updateParams = [
      _.get(message, 'payload.name'),
      _.get(message, 'payload.description'),
      _.get(message, 'payload.privateGroup') ? true : false,
      _.get(message, 'payload.selfRegister') ? true : false,
      ...(_.get(message, 'payload.updatedBy') ? [Number(_.get(message, 'payload.updatedBy'))] : []),
      timestamp,
      Number(_.get(message, 'payload.oldId'))
    ]
    logger.debug(`rawpayload = ${updateParams}`)

    logger.debug('Creating group in Authorization DB')
    await mySqlConn.query('START TRANSACTION')
    logger.debug('AuroraDB Transaction Started')

    const updateQuery =
      'UPDATE `group` SET `name` = ?, `description` = ?, `private_group` = ?, `self_register` = ?, `modifiedBy` = ?, modifiedAt = ? WHERE `id` = ?'

    const [results] = await mySqlConn.query(updateQuery, updateParams)

    logger.debug(`Creating record in SecurityGroups`)
    await informixSession.beginTransactionAsync()

    const params = {
      group_id: Number(_.get(message, 'payload.oldId')),
      description: _.get(message, 'payload.name')
    }
    const normalizedPayload = _.omitBy(params, _.isUndefined)
    const keys = Object.keys(normalizedPayload)
    const fields = keys.map((key) => `${key} = ?`).join(', ')

    const updateGroupStmt = await prepare(
      informixSession,
      `update security_groups set ${fields} where group_id = ${params.group_id}`
    )

    await updateGroupStmt.executeAsync(Object.values(normalizedPayload))
    await informixSession.commitTransactionAsync()
    await mySqlConn.query('COMMIT')
    logger.debug('Records have been updated in DBs')
  } catch (error) {
    logger.error(error)
    await informixSession.rollbackTransactionAsync()
    await mySqlConn.query('ROLLBACK')
    logger.debug('Rollback Transaction')
  } finally {
    await informixSession.closeAsync()
    await mySqlConn.release()
    logger.debug('DB connection closed')
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
          id: joi.string().uuid().required(),
          name: joi.string().min(2).max(150).required(),
          oldName: joi.string().min(2).max(150).required(),
          oldId: joi.number().integer().required(),
          description: joi.string().max(500),
          domain: joi.string().max(100).allow('', null),
          privateGroup: joi.boolean().required(),
          selfRegister: joi.boolean().required(),
          updatedBy: joi.string(),
          updatedAt: joi.date(),
          createdBy: joi.string(),
          createdAt: joi.date(),
          ssoId: joi.string().max(100).allow('', null),
          organizationId: joi.string().allow('', null),
          status: joi.string()
        })
        .required()
    })
    .required()
}

/**
 * ! Implement this method
 * Process delete group message
 * @param {Object} message the kafka message
 */
async function deleteGroup (message) {
  // get informix db connection
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
          groups: joi.array().required()
        })
        .required()
    })
    .required()
}

/**
 * Add members to the group
 * @param {Object} message the kafka message
 */
async function addMembersToGroup (message) {
  // get aurora db connection
  logger.debug('Getting auroradb session')
  const mySqlConn = await helper.mysqlPool.getConnection()
  logger.debug('auroradb session acquired')

  try {
    const count = await checkGroupExist(message.payload.name)
    if (count === 0) {
      throw new Error(`Group with name ${message.payload.name} is not exist`)
    }

    const timestamp = moment(Date.parse(message.timestamp)).format('YYYY-MM-DD HH:mm:ss')
    let rawPayload
    if (message.payload.universalUID) {
      const token = await helper.getM2Mtoken()

      const options = {
        method: 'GET',
        uri: `${config.UBAHN_API}/users/${message.payload.universalUID}/externalProfiles?organizationName=${config.UBAHN_TOPCODER_ORG_NAME}`,
        headers: {
          'User-Agent': 'Request-Promise',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      }

      const response = await request(options)
      const memberId = _.head(JSON.parse(response)).externalId

      rawPayload = {
        group_id: Number(_.get(message, 'payload.oldId')),
        membership_type: _.get(message, 'payload.membershipType') === 'group' ? 2 : 1,
        member_id: memberId,
        ...(_.get(message, 'payload.createdBy') ? {createdBy: Number(_.get(message, 'payload.createdBy'))} : {}),
        ...(_.get(message, 'payload.createdBy') ? {modifiedBy: Number(_.get(message, 'payload.createdBy'))} : {}),
        createdAt: timestamp,
        modifiedAt: timestamp
      }
    } else {
      rawPayload = {
        group_id: Number(_.get(message, 'payload.oldId')),
        membership_type: _.get(message, 'payload.membershipType') === 'group' ? 2 : 1,
        member_id: Number(
          _.get(message, 'payload.membershipType') === 'group'
            ? _.get(message, 'payload.memberOldId')
            : _.get(message, 'payload.memberId')
        ),
        ...(_.get(message, 'payload.createdBy') ? {createdBy: Number(_.get(message, 'payload.createdBy'))} : {}),
        ...(_.get(message, 'payload.createdBy') ? {modifiedBy: Number(_.get(message, 'payload.createdBy'))} : {}),
        createdAt: timestamp,
        modifiedAt: timestamp
      }
    }

    logger.debug(`rawpayload = ${JSON.stringify(rawPayload)}`)

    await mySqlConn.query('START TRANSACTION')
    logger.debug('AuroraDB Transaction Started')

    await mySqlConn.query('INSERT INTO `group_membership` SET ?', rawPayload)

    await mySqlConn.query('COMMIT')
    logger.debug('Records have been created in DBs')
  } catch (error) {
    logger.error(error)
    await mySqlConn.query('ROLLBACK')
    logger.debug('Rollback Transaction')
  } finally {
    await mySqlConn.release()
    logger.debug('DB connection closed')
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
          name: joi.string().min(2).max(150).required(),
          createdBy: joi.string(),
          createdAt: joi.date(),
          memberId: joi.string(),
          universalUID: joi.string(),
          oldId: joi.string().required(),
          memberOldId: joi.string(),
          membershipType: joi.string().required()
        })
        .required()
    })
    .required()
}

/**
 * Remove member from group
 * @param {Object} message the kafka message
 */
async function removeMembersFromGroup (message) {
  // get aurora db connection
  logger.debug('Getting auroradb session')
  const mySqlConn = await helper.mysqlPool.getConnection()
  logger.debug('auroradb session acquired')

  try {
    const count = await checkGroupExist(message.payload.name)
    if (count === 0) {
      throw new Error(`Group with name ${message.payload.name} is not exist`)
    }

    const rawPayload = {
      group_id: Number(_.get(message, 'payload.oldId')),
      member_id: Number(_.get(message, 'payload.memberId'))
    }

    logger.debug(`rawpayload = ${JSON.stringify(rawPayload)}`)

    await mySqlConn.query('START TRANSACTION')
    logger.debug('AuroraDB Transaction Started')

    await mySqlConn.query('DELETE FROM `group_membership` WHERE `group_id` = ? and `member_id` = ?', [
      rawPayload.group_id,
      rawPayload.member_id
    ])

    await mySqlConn.query('COMMIT')
    logger.debug('Records have been deleted from DBs')
  } catch (error) {
    logger.error(error)
    await mySqlConn.query('ROLLBACK')
    logger.debug('Rollback Transaction')
  } finally {
    await mySqlConn.release()
    logger.debug('DB connection closed')
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
          groupId: joi.string().uuid().required(),
          name: joi.string().required(),
          oldId: joi.string().required(),
          memberId: joi.string().required()
        })
        .required()
    })
    .required()
}

module.exports = {
  createGroup,
  updateGroup,
  deleteGroup,
  addMembersToGroup,
  removeMembersFromGroup
}

logger.buildService(module.exports)
