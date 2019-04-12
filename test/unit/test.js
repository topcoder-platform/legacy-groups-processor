/**
 * Unit tests of the legacy groups Processor.
 */

process.env.NODE_ENV = 'test'
require('../../src/bootstrap')
const _ = require('lodash')
const should = require('should')
const logger = require('../../src/common/logger')
const ProcessorService = require('../../src/services/ProcessorService')
const testHelper = require('../common/testHelper')
const { testTopics } = require('../common/testData')

describe('Topcoder - Legacy Groups Processor Unit Test', () => {
  let infoLogs = []
  let errorLogs = []
  let debugLogs = []
  const info = logger.info
  const error = logger.error
  const debug = logger.debug
  let group1Id, group2Id

  /**
   * Assert validation error
   * @param err the error
   * @param message the message
   */
  const assertValidationError = (err, message) => {
    err.isJoi.should.be.true()
    should.equal(err.name, 'ValidationError')
    err.details.map(x => x.message).should.containEql(message)
    errorLogs.should.not.be.empty()
  }

  before(async () => {
    // inject logger with log collector
    logger.info = (message) => {
      infoLogs.push(message)
      info(message)
    }
    logger.debug = (message) => {
      debugLogs.push(message)
      debug(message)
    }
    logger.error = (message) => {
      errorLogs.push(message)
      error(message)
    }
    await testHelper.initDB()
    await testHelper.insertData()
  })

  after(async () => {
    await testHelper.initDB()

    // restore logger
    logger.error = error
    logger.info = info
    logger.debug = debug
  })

  beforeEach(() => {
    // clear logs
    infoLogs = []
    debugLogs = []
    errorLogs = []
  })

  it('processor create group success', async () => {
    await ProcessorService.createGroup(testTopics.create.testMessage)
    const group = await testHelper.getGroupByName('group-1')
    should.exist(group.id)
    should.exist(group.createdat)
    should.equal(group.name, 'group-1')
    should.equal(group.description, 'desc-1')
    should.equal(group.domain, 'www.topcoder.com')
    should.equal(group.private_group, true)
    should.equal(group.self_register, true)
    should.equal(group.createdby, 'admin')
    group1Id = Number(group.id)
    const oldId = await testHelper.getOldIdByName('group-1')
    should.equal(group1Id, oldId)
  })

  it('processor create group without optional field success', async () => {
    let message = _.cloneDeep(testTopics.create.testMessage)
    message.payload = {
      id: '65ba651a-6524-4e08-be04-06485f6a8d6f',
      name: 'group-2',
      privateGroup: false,
      selfRegister: false
    }
    await ProcessorService.createGroup(message)
    const group = await testHelper.getGroupByName('group-2')
    should.exist(group.id)
    should.exist(group.createdat)
    should.equal(group.name, 'group-2')
    should.equal(group.description, null)
    should.equal(group.domain, null)
    should.equal(group.private_group, false)
    should.equal(group.self_register, false)
    should.equal(group.createdby, null)
    group2Id = Number(group.id)
    const oldId = await testHelper.getOldIdByName('group-2')
    should.equal(group2Id, oldId)
  })

  it('failure - processor create group with duplicate name', async () => {
    try {
      await ProcessorService.createGroup(testTopics.create.testMessage)
      throw new Error('should not throw error here')
    } catch (err) {
      errorLogs.should.not.be.empty()
      errorLogs[1].should.containEql('The group name group-1 is already used')
    }
  })

  it('processor update group success', async () => {
    let message = _.cloneDeep(testTopics.update.testMessage)
    message.payload.oldId = group2Id
    await ProcessorService.updateGroup(message)
    const group = await testHelper.getGroupByName('new-group-2')
    should.equal(Number(group.id), group2Id)
    should.exist(group.modifiedat)
    should.equal(group.name, 'new-group-2')
    should.equal(group.description, 'new-desc-2')
    should.equal(group.domain, 'www.topcoder-dev.com')
    should.equal(group.private_group, true)
    should.equal(group.self_register, true)
    should.equal(group.modifiedby, 'user')
  })

  it('processor update group without optional fields success', async () => {
    let message = _.cloneDeep(testTopics.update.testMessage)
    message.payload = {
      oldId: group1Id,
      name: 'new-group-1',
      privateGroup: false,
      selfRegister: false
    }
    await ProcessorService.updateGroup(message)
    const group = await testHelper.getGroupByName('new-group-1')
    should.equal(Number(group.id), group1Id)
    should.exist(group.modifiedat)
    should.equal(group.name, 'new-group-1')
    should.equal(group.description, null)
    should.equal(group.domain, null)
    should.equal(group.private_group, false)
    should.equal(group.self_register, false)
    should.equal(group.modifiedby, null)
  })

  it('failure - processor update group with duplicate name', async () => {
    let message = _.cloneDeep(testTopics.update.testMessage)
    message.payload = {
      oldId: group1Id,
      name: 'new-group-2',
      privateGroup: false,
      selfRegister: false
    }
    try {
      await ProcessorService.updateGroup(message)
      throw new Error('should not throw error here')
    } catch (err) {
      errorLogs.should.not.be.empty()
      errorLogs[1].should.containEql('The group name new-group-2 is already used')
    }
  })

  it('failure - processor update group not found', async () => {
    let message = _.cloneDeep(testTopics.update.testMessage)
    message.payload = {
      oldId: group1Id + 1000,
      name: 'new-group-1',
      privateGroup: false,
      selfRegister: false
    }
    try {
      await ProcessorService.updateGroup(message)
      throw new Error('should not throw error here')
    } catch (err) {
      errorLogs.should.not.be.empty()
      errorLogs[1].should.containEql(`The group with id: ${message.payload.oldId} doesn't exist`)
    }
  })

  it('failure - processor delete group not found', async () => {
    let message = _.cloneDeep(testTopics.delete.testMessage)
    message.payload = {
      oldId: group1Id + 1000
    }
    try {
      await ProcessorService.deleteGroup(message)
      throw new Error('should not throw error here')
    } catch (err) {
      errorLogs.should.not.be.empty()
      errorLogs[1].should.containEql(`The group with id: ${message.payload.oldId} doesn't exist`)
    }
  })

  it('processor delete group success', async () => {
    let message = _.cloneDeep(testTopics.delete.testMessage)
    message.payload = {
      oldId: group1Id
    }
    await ProcessorService.deleteGroup(message)
    const group = await testHelper.getGroupByName('new-group-1')
    should.not.exist(group)
  })

  for (const op of ['create', 'update', 'delete']) {
    let { requiredFields, integerFields, stringFields, booleanFields, testMessage } = testTopics[op]

    for (const requiredField of requiredFields) {
      if (requiredField !== 'topic') {
        it(`test invalid parameters, required field ${requiredField} is missing`, async () => {
          let message = _.cloneDeep(testMessage)
          message = _.omit(message, requiredField)
          try {
            await ProcessorService[`${op}Group`](message)
            throw new Error('should not throw error here')
          } catch (err) {
            assertValidationError(err, `"${_.last(requiredField.split('.'))}" is required`)
          }
        })
      }
    }

    if (stringFields) {
      for (const stringField of stringFields) {
        if (stringField !== 'topic') {
          it(`test invalid parameters, invalid string type field ${stringField}`, async () => {
            let message = _.cloneDeep(testMessage)
            _.set(message, stringField, 123)
            try {
              await ProcessorService[`${op}Group`](message)
              throw new Error('should not throw error here')
            } catch (err) {
              assertValidationError(err, `"${_.last(stringField.split('.'))}" must be a string`)
            }
          })
        }
      }
    }

    if (booleanFields) {
      for (const booleanField of booleanFields) {
        it(`test invalid parameters, invalid boolean type field ${booleanField}`, async () => {
          let message = _.cloneDeep(testMessage)
          _.set(message, booleanField, 123)
          try {
            await ProcessorService[`${op}Group`](message)
            throw new Error('should not throw error here')
          } catch (err) {
            assertValidationError(err, `"${_.last(booleanField.split('.'))}" must be a boolean`)
          }
        })
      }
    }

    if (op === 'create' || op === 'update') {
      it(`test invalid parameters, string field name too short`, async () => {
        let message = _.cloneDeep(testMessage)
        _.set(message, 'payload.name', 'a')
        try {
          await ProcessorService[`${op}Group`](message)
          throw new Error('should not throw error here')
        } catch (err) {
          assertValidationError(err, `"name" length must be at least 2 characters long`)
        }
      })

      it(`test invalid parameters, string field name too long`, async () => {
        let message = _.cloneDeep(testMessage)
        _.set(message, 'payload.name', 'a'.repeat(51))
        try {
          await ProcessorService[`${op}Group`](message)
          throw new Error('should not throw error here')
        } catch (err) {
          assertValidationError(err, `"name" length must be less than or equal to 50 characters long`)
        }
      })

      it(`test invalid parameters, string field description too long`, async () => {
        let message = _.cloneDeep(testMessage)
        _.set(message, 'payload.description', 'a'.repeat(501))
        try {
          await ProcessorService[`${op}Group`](message)
          throw new Error('should not throw error here')
        } catch (err) {
          assertValidationError(err, `"description" length must be less than or equal to 500 characters long`)
        }
      })

      it(`test invalid parameters, string field domain too long`, async () => {
        let message = _.cloneDeep(testMessage)
        _.set(message, 'payload.domain', 'a'.repeat(101))
        try {
          await ProcessorService[`${op}Group`](message)
          throw new Error('should not throw error here')
        } catch (err) {
          assertValidationError(err, `"domain" length must be less than or equal to 100 characters long`)
        }
      })
    }

    if (integerFields) {
      for (const integerField of integerFields) {
        it(`test invalid parameters, invalid integer type field ${integerField}(wrong number)`, async () => {
          let message = _.cloneDeep(testMessage)
          _.set(message, integerField, 'string')
          try {
            await ProcessorService[`${op}Group`](message)
            throw new Error('should not throw error here')
          } catch (err) {
            assertValidationError(err, `"${_.last(integerField.split('.'))}" must be a number`)
          }
        })

        it(`test invalid parameters, invalid integer type field ${integerField}(wrong integer)`, async () => {
          let message = _.cloneDeep(testMessage)
          _.set(message, integerField, 1.1)
          try {
            await ProcessorService[`${op}Group`](message)
            throw new Error('should not throw error here')
          } catch (err) {
            assertValidationError(err, `"${_.last(integerField.split('.'))}" must be an integer`)
          }
        })
      }
    }
  }
})
