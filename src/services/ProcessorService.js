/**
 * Processor Service
 */

const _ = require('lodash')
const joi = require('joi')
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
async function checkDuplicateGroup (id, name, connection) {
  const result = await connection.queryAsync(`select * from group where name = '${name}'${id ? ` and id <> ${id}` : ''}`)
  if (result.length > 0) {
    throw new Error(`The group name ${name} is already used`)
  }
}

/**
 * Check group exist
 * @param {Number} id the group id
 * @param {Object} connection the Informix connection
 */
async function checkGroupExist (id, connection) {
  const result = await connection.queryAsync(`select * from group where id = ${id}`)
  if (result.length === 0) {
    throw new Error(`The group with id: ${id} doesn't exist`)
  }
}

/**
 * Process create group message
 * @param {Object} message the kafka message
 */
async function createGroup (message) {
  // informix database connection
  const connection = await helper.getInformixConnection()
  // neo4j session
  const session = helper.createDBSession()

  try {
    await checkDuplicateGroup(undefined, message.payload.name, connection)

    const generateId = await connection.queryAsync('select first 1 sequence_group_seq.nextval from country')
    const id = generateId[0].nextval

    // prepare the statement for inserting the group data to common_oltp.group table
    const rawPayload = {
      id,
      name: _.get(message, 'payload.name'),
      description: _.get(message, 'payload.description'),
      domain: _.get(message, 'payload.domain'),
      private_group: _.get(message, 'payload.privateGroup') ? 't' : 'f',
      self_register: _.get(message, 'payload.selfRegister') ? 't' : 'f',
      createdBy: _.get(message, 'payload.createdBy')
    }

    const normalizedPayload = _.omitBy(rawPayload, _.isUndefined)
    const keys = Object.keys(normalizedPayload)
    const fields = ['createdAt'].concat(keys)
    const values = ['current'].concat(_.fill(Array(keys.length), '?'))

    const createGroupStmt = await prepare(connection, `insert into group (${fields.join(', ')}) values (${values.join(', ')})`)

    await createGroupStmt.executeAsync(Object.values(normalizedPayload))

    // update group data in neo4j
    await session.run(`MATCH (g:Group {id: {id}}) SET g.oldId={oldId} RETURN g`,
      { id: message.payload.id, oldId: id })
  } finally {
    session.close()
    await connection.closeAsync()
  }
}

createGroup.schema = {
  message: joi.object().keys({
    topic: joi.string().required(),
    originator: joi.string().required(),
    timestamp: joi.date().required(),
    'mime-type': joi.string().required(),
    payload: joi.object().keys({
      id: joi.string().uuid().required(),
      name: joi.string().min(2).max(50).required(),
      description: joi.string().max(500),
      domain: joi.string().max(100),
      privateGroup: joi.boolean().required(),
      selfRegister: joi.boolean().required(),
      createdBy: joi.string()
    }).required()
  }).required()
}

/**
 * Process update group message
 * @param {Object} message the kafka message
 */
async function updateGroup (message) {
  const connection = await helper.getInformixConnection()
  try {
    await checkGroupExist(message.payload.oldId, connection)
    if (message.payload.name) {
      await checkDuplicateGroup(message.payload.oldId, message.payload.name, connection)
    }

    // prepare the statement for updating the group data to common_oltp.group table
    const rawPayload = {
      name: _.get(message, 'payload.name'),
      description: _.get(message, 'payload.description', null),
      domain: _.get(message, 'payload.domain', null),
      private_group: _.get(message, 'payload.privateGroup') ? 't' : 'f',
      self_register: _.get(message, 'payload.selfRegister') ? 't' : 'f',
      modifiedBy: _.get(message, 'payload.updatedBy')
    }

    const normalizedPayload = _.omitBy(rawPayload, _.isUndefined)
    const keys = Object.keys(normalizedPayload)

    const updateStatements = keys.map(key => normalizedPayload[key] === null
      ? `${key} = null` : `${key} = '${normalizedPayload[key]}'`).join(', ')
    const updateGroupQuery = `update group set ${updateStatements}, modifiedAt = current where id = ${message.payload.oldId}`

    await connection.queryAsync(updateGroupQuery)
  } finally {
    await connection.closeAsync()
  }
}

updateGroup.schema = {
  message: joi.object().keys({
    topic: joi.string().required(),
    originator: joi.string().required(),
    timestamp: joi.date().required(),
    'mime-type': joi.string().required(),
    payload: joi.object().keys({
      oldId: joi.number().required(),
      name: joi.string().min(2).max(50).required(),
      description: joi.string().max(500),
      domain: joi.string().max(100),
      privateGroup: joi.boolean().required(),
      selfRegister: joi.boolean().required(),
      updatedBy: joi.string()
    }).required()
  }).required()
}

/**
 * Process delete group message
 * @param {Object} message the kafka message
 */
async function deleteGroup (message) {
  const connection = await helper.getInformixConnection()
  try {
    await checkGroupExist(message.payload.oldId, connection)
    const deleteGroupStmt = await prepare(connection, 'delete from group where id = ?')
    await deleteGroupStmt.executeAsync([message.payload.oldId])
  } finally {
    await connection.closeAsync()
  }
}

deleteGroup.schema = {
  message: joi.object().keys({
    topic: joi.string().required(),
    originator: joi.string().required(),
    timestamp: joi.date().required(),
    'mime-type': joi.string().required(),
    payload: joi.object().keys({
      oldId: joi.number().required()
    }).required()
  }).required()
}

module.exports = {
  createGroup,
  updateGroup,
  deleteGroup
}

logger.buildService(module.exports)
