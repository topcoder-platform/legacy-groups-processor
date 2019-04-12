/**
 * The application entry point
 */

require('./bootstrap')
const config = require('config')
const Kafka = require('no-kafka')
const healthcheck = require('topcoder-healthcheck-dropin')
const logger = require('./common/logger')
const helper = require('./common/helper')
const ProcessorService = require('./services/ProcessorService')

// Start kafka consumer
logger.info('Starting kafka consumer')
// create consumer
const consumer = new Kafka.GroupConsumer(helper.getKafkaOptions())

/*
 * Data handler linked with Kafka consumer
 * Whenever a new message is received by Kafka consumer,
 * this function will be invoked
 */
const dataHandler = (messageSet, topic, partition) => Promise.each(messageSet, async (m) => {
  const message = m.message.value.toString('utf8')
  logger.info(`Handle Kafka event message; Topic: ${topic}; Partition: ${partition}; Offset: ${
    m.offset}; Message: ${message}.`)
  let messageJSON
  try {
    messageJSON = JSON.parse(message)
  } catch (e) {
    logger.error('Invalid message JSON.')
    logger.logFullError(e)

    // commit the message and ignore it
    await consumer.commitOffset({ topic, partition, offset: m.offset })
    return
  }

  if (messageJSON.topic !== topic) {
    logger.error(`The message topic ${messageJSON.topic} doesn't match the Kafka topic ${topic}.`)

    // commit the message and ignore it
    await consumer.commitOffset({ topic, partition, offset: m.offset })
    return
  }

  try {
    switch (topic) {
      case config.CREATE_GROUP_TOPIC:
        await ProcessorService.createGroup(messageJSON)
        break
      case config.UPDATE_GROUP_TOPIC:
        await ProcessorService.updateGroup(messageJSON)
        break
      case config.DELETE_GROUP_TOPIC:
        await ProcessorService.deleteGroup(messageJSON)
        break
      default:
        throw new Error(`Invalid topic: ${topic}`)
    }

    // only commit if no errors
    await consumer.commitOffset({ topic, partition, offset: m.offset })
    logger.debug('Successfully processed message')
  } catch (err) {
    logger.logFullError(err)
  }
})

// check if there is kafka connection alive
const check = () => {
  if (!consumer.client.initialBrokers && !consumer.client.initialBrokers.length) {
    return false
  }
  let connected = true
  consumer.client.initialBrokers.forEach(conn => {
    logger.debug(`url ${conn.server()} - connected=${conn.connected}`)
    connected = conn.connected & connected
  })
  return connected
}

const topics = [config.CREATE_GROUP_TOPIC, config.UPDATE_GROUP_TOPIC, config.DELETE_GROUP_TOPIC]

consumer
  .init([{
    subscriptions: topics,
    handler: dataHandler
  }])
  // consume configured topics
  .then(() => {
    logger.info('Initialized.......')
    healthcheck.init([check])
    logger.info('Adding topics successfully.......')
    logger.info(topics)
    logger.info('Kick Start.......')
  })
  .catch((err) => logger.error(err))

if (process.env.NODE_ENV === 'test') {
  module.exports = consumer
}
