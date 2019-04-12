/**
 * E2E test of the legacy groups Processor.
 */

process.env.NODE_ENV = 'test'
require('../../src/bootstrap')
const _ = require('lodash')
const config = require('config')
const should = require('should')
const Kafka = require('no-kafka')
const request = require('superagent')
const helper = require('../../src/common/helper')
const logger = require('../../src/common/logger')
const testHelper = require('../common/testHelper')
const { testTopics } = require('../common/testData')

describe('Topcoder - Legacy Groups Processor E2E Test', () => {
  let app
  let infoLogs = []
  let errorLogs = []
  let debugLogs = []
  const info = logger.info
  const error = logger.error
  const debug = logger.debug
  let group1Id, group2Id

  const producer = new Kafka.Producer(helper.getKafkaOptions())

  /**
   * Sleep with time from input
   * @param time the time input
   */
  async function sleep (time) {
    await new Promise((resolve) => {
      setTimeout(resolve, time)
    })
  }

  /**
   * Send message
   * @param testMessage the test message
   */
  const sendMessage = async (testMessage) => {
    await producer.send({
      topic: testMessage.topic,
      message: {
        value: JSON.stringify(testMessage)
      }
    })
  }

  /**
   * Consume not committed messages before e2e test
   */
  const consumeMessages = async () => {
    // remove all not processed messages
    const consumer = new Kafka.GroupConsumer(helper.getKafkaOptions())
    await consumer.init([{
      subscriptions: [config.CREATE_GROUP_TOPIC, config.UPDATE_GROUP_TOPIC, config.DELETE_GROUP_TOPIC],
      handler: (messageSet, topic, partition) => Promise.each(messageSet,
        (m) => consumer.commitOffset({ topic, partition, offset: m.offset }))
    }])
    // make sure process all not committed messages before test
    await sleep(2 * config.WAIT_TIME)
    await consumer.end()
  }

  // the message patter to get topic/partition/offset
  const messagePattern = /^Handle Kafka event message; Topic: (.+); Partition: (.+); Offset: (.+); Message: (.+).$/
  /**
   * Wait job finished with successful log or error log is found
   */
  const waitJob = async () => {
    while (true) {
      if (errorLogs.length > 0) {
        if (infoLogs.length && messagePattern.exec(infoLogs[0])) {
          const matchResult = messagePattern.exec(infoLogs[0])
          // only manually commit for error message during test
          await app.commitOffset({
            topic: matchResult[1],
            partition: parseInt(matchResult[2]),
            offset: parseInt(matchResult[3])
          })
        }
        break
      }
      if (debugLogs.some(x => String(x).includes('Successfully processed message'))) {
        break
      }
      // use small time to wait job and will use global timeout so will not wait too long
      await sleep(config.WAIT_TIME)
    }
  }

  const assertErrorMessage = (message) => {
    errorLogs.should.not.be.empty()
    errorLogs.some(x => String(x).includes(message)).should.be.true()
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
    await consumeMessages()
    // start kafka producer
    await producer.init()
    // start the application (kafka listener)
    app = require('../../src/app')
    // wait until consumer init successfully
    while (true) {
      if (infoLogs.some(x => String(x).includes('Kick Start'))) {
        break
      }
      await sleep(config.WAIT_TIME)
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

    try {
      await producer.end()
    } catch (err) {
      // ignore
    }
    try {
      await app.end()
    } catch (err) {
      // ignore
    }
  })

  beforeEach(() => {
    // clear logs
    infoLogs = []
    debugLogs = []
    errorLogs = []
  })

  it('Should setup healthcheck with check on kafka connection', async () => {
    const healthcheckEndpoint = `http://localhost:${process.env.PORT || 3000}/health`
    let result = await request.get(healthcheckEndpoint)
    should.equal(result.status, 200)
    should.deepEqual(result.body, { checksRun: 1 })
    debugLogs.should.match(/connected=true/)
  })

  it('Should handle invalid json message', async () => {
    const { testMessage } = testTopics.create
    await producer.send({
      topic: testMessage.topic,
      message: {
        value: '[ invalid'
      }
    })
    await waitJob()
    should.equal(errorLogs[0], 'Invalid message JSON.')
  })

  it('Should handle incorrect topic field message', async () => {
    const { testMessage } = testTopics.create
    let message = _.cloneDeep(testMessage)
    message.topic = 'invalid'
    await producer.send({
      topic: testMessage.topic,
      message: {
        value: JSON.stringify(message)
      }
    })
    await waitJob()
    should.equal(errorLogs[0], 'The message topic invalid doesn\'t match the Kafka topic groups.notification.create.')
  })

  it('processor create group success', async () => {
    await sendMessage(testTopics.create.testMessage)
    await waitJob()

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
    await sendMessage(message)
    await waitJob()

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
    await sendMessage(testTopics.create.testMessage)
    await waitJob()

    assertErrorMessage('The group name group-1 is already used')
  })

  it('processor update group success', async () => {
    let message = _.cloneDeep(testTopics.update.testMessage)
    message.payload.oldId = group2Id
    await sendMessage(message)
    await waitJob()

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
    await sendMessage(message)
    await waitJob()

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
    await sendMessage(message)
    await waitJob()

    assertErrorMessage('The group name new-group-2 is already used')
  })

  it('failure - processor update group not found', async () => {
    let message = _.cloneDeep(testTopics.update.testMessage)
    message.payload = {
      oldId: group1Id + 1000,
      name: 'new-group-1',
      privateGroup: false,
      selfRegister: false
    }
    await sendMessage(message)
    await waitJob()

    assertErrorMessage(`The group with id: ${message.payload.oldId} doesn't exist`)
  })

  it('failure - processor delete group not found', async () => {
    let message = _.cloneDeep(testTopics.delete.testMessage)
    message.payload = {
      oldId: group1Id + 1000
    }
    await sendMessage(message)
    await waitJob()

    assertErrorMessage(`The group with id: ${message.payload.oldId} doesn't exist`)
  })

  it('processor delete group success', async () => {
    let message = _.cloneDeep(testTopics.delete.testMessage)
    message.payload = {
      oldId: group1Id
    }
    await sendMessage(message)
    await waitJob()

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
          await sendMessage(message)
          await waitJob()

          assertErrorMessage(`"${_.last(requiredField.split('.'))}" is required`)
        })
      }
    }

    if (stringFields) {
      for (const stringField of stringFields) {
        if (stringField !== 'topic') {
          it(`test invalid parameters, invalid string type field ${stringField}`, async () => {
            let message = _.cloneDeep(testMessage)
            _.set(message, stringField, 123)
            await sendMessage(message)
            await waitJob()

            assertErrorMessage(`"${_.last(stringField.split('.'))}" must be a string`)
          })
        }
      }
    }

    if (booleanFields) {
      for (const booleanField of booleanFields) {
        it(`test invalid parameters, invalid boolean type field ${booleanField}`, async () => {
          let message = _.cloneDeep(testMessage)
          _.set(message, booleanField, 123)
          await sendMessage(message)
          await waitJob()

          assertErrorMessage(`"${_.last(booleanField.split('.'))}" must be a boolean`)
        })
      }
    }

    if (op === 'create' || op === 'update') {
      it(`test invalid parameters, string field name too short`, async () => {
        let message = _.cloneDeep(testMessage)
        _.set(message, 'payload.name', 'a')
        await sendMessage(message)
        await waitJob()

        assertErrorMessage(`"name" length must be at least 2 characters long`)
      })

      it(`test invalid parameters, string field name too long`, async () => {
        let message = _.cloneDeep(testMessage)
        _.set(message, 'payload.name', 'a'.repeat(51))
        await sendMessage(message)
        await waitJob()

        assertErrorMessage(`"name" length must be less than or equal to 50 characters long`)
      })

      it(`test invalid parameters, string field description too long`, async () => {
        let message = _.cloneDeep(testMessage)
        _.set(message, 'payload.description', 'a'.repeat(501))
        await sendMessage(message)
        await waitJob()

        assertErrorMessage(`"description" length must be less than or equal to 500 characters long`)
      })

      it(`test invalid parameters, string field domain too long`, async () => {
        let message = _.cloneDeep(testMessage)
        _.set(message, 'payload.domain', 'a'.repeat(101))
        await sendMessage(message)
        await waitJob()

        assertErrorMessage(`"domain" length must be less than or equal to 100 characters long`)
      })
    }

    if (integerFields) {
      for (const integerField of integerFields) {
        it(`test invalid parameters, invalid integer type field ${integerField}(wrong number)`, async () => {
          let message = _.cloneDeep(testMessage)
          _.set(message, integerField, 'string')
          await sendMessage(message)
          await waitJob()

          assertErrorMessage(`"${_.last(integerField.split('.'))}" must be a number`)
        })

        it(`test invalid parameters, invalid integer type field ${integerField}(wrong integer)`, async () => {
          let message = _.cloneDeep(testMessage)
          _.set(message, integerField, 1.1)
          await sendMessage(message)
          await waitJob()

          assertErrorMessage(`"${_.last(integerField.split('.'))}" must be an integer`)
        })
      }
    }
  }
})
