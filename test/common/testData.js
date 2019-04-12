/*
 * Test data to be used in tests
 */

const testTopics = {
  create: {
    requiredFields: ['topic', 'originator', 'timestamp', 'mime-type',
      'payload.id', 'payload.name', 'payload.privateGroup', 'payload.selfRegister'],
    stringFields: ['payload.id', 'payload.name', 'payload.description', 'payload.domain', 'payload.createdBy'],
    booleanFields: ['payload.privateGroup', 'payload.selfRegister'],
    testMessage: {
      topic: 'groups.notification.create',
      originator: 'groups-api',
      timestamp: '2019-04-04T00:00:00',
      'mime-type': 'application/json',
      payload: {
        id: '55ba651a-6524-4e08-be04-06485f6a8d6f',
        name: 'group-1',
        description: 'desc-1',
        domain: 'www.topcoder.com',
        privateGroup: true,
        selfRegister: true,
        createdBy: 'admin'
      }
    }
  },
  update: {
    requiredFields: ['topic', 'originator', 'timestamp', 'mime-type',
      'payload.oldId', 'payload.name', 'payload.privateGroup', 'payload.selfRegister'],
    stringFields: ['payload.name', 'payload.description', 'payload.domain', 'payload.updatedBy'],
    integerFields: ['payload.oldId'],
    booleanFields: ['payload.privateGroup', 'payload.selfRegister'],
    testMessage: {
      topic: 'groups.notification.update',
      originator: 'groups-api',
      timestamp: '2019-04-04T00:00:00',
      'mime-type': 'application/json',
      payload: {
        oldId: 100000000,
        name: 'new-group-2',
        description: 'new-desc-2',
        domain: 'www.topcoder-dev.com',
        privateGroup: true,
        selfRegister: true,
        updatedBy: 'user'
      }
    }
  },
  delete: {
    requiredFields: ['topic', 'originator', 'timestamp', 'mime-type', 'payload.oldId'],
    integerFields: ['payload.oldId'],
    testMessage: {
      topic: 'groups.notification.delete',
      originator: 'groups-api',
      timestamp: '2019-04-04T00:00:00',
      'mime-type': 'application/json',
      payload: {
        oldId: 10000000
      }
    }
  }
}

module.exports = {
  testTopics
}
