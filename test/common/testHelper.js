/**
 * Contains generic helper methods
 */

const helper = require('../../src/common/helper')

/**
 * Initialize Neo4j and Informix.
 */
async function initDB () {
  // init Neo4j
  const session = helper.createDBSession()
  try {
    await session.run('MATCH (g {id: "55ba651a-6524-4e08-be04-06485f6a8d6f"}) DELETE g')
    await session.run('MATCH (g {id: "65ba651a-6524-4e08-be04-06485f6a8d6f"}) DELETE g')
  } finally {
    session.close()
  }

  // init Informix
  const connection = await helper.getInformixConnection()
  try {
    await connection.queryAsync('delete from group')
  } finally {
    await connection.closeAsync()
  }
}

/**
 * Insert test data.
 */
async function insertData () {
  const session = helper.createDBSession()
  try {
    await session.run('CREATE (g:Group {id: "55ba651a-6524-4e08-be04-06485f6a8d6f", name: "group-1", description: "desc-1", domain: "www.topcoder.com", privateGroup: true, selfRegister: true, createdBy: "admin"}) RETURN g')
    await session.run('CREATE (g:Group {id: "65ba651a-6524-4e08-be04-06485f6a8d6f", name: "group-2", privateGroup: false, selfRegister: false }) RETURN g')
  } finally {
    session.close()
  }
}

/**
 * Get group by name from Informix
 * @param {name} String the group name
 * @return {Object} the group with given name
 */
async function getGroupByName (name) {
  const connection = await helper.getInformixConnection()
  try {
    const result = await connection.queryAsync(`select * from group where name = '${name}'`)
    return result[0]
  } finally {
    await connection.closeAsync()
  }
}

/**
 * Get group.oldId by name from Neo4j
 * @param {name} String the group name
 * @return {String} the oldId property
 */
async function getOldIdByName (name) {
  const session = helper.createDBSession()
  try {
    const result = await session.run(`MATCH (g:Group {name: "${name}"}) RETURN g`)
    return result.records[0].get(0).properties.oldId
  } finally {
    session.close()
  }
}

module.exports = {
  initDB,
  insertData,
  getGroupByName,
  getOldIdByName
}
