/**
 * The default configuration file.
 */

module.exports = {
  LOG_LEVEL: process.env.LOG_LEVEL || 'debug',

  KAFKA_URL: process.env.KAFKA_URL || 'localhost:9092',
  // below are used for secure Kafka connection, they are optional
  // for the local Kafka, they are not needed
  KAFKA_CLIENT_CERT: process.env.KAFKA_CLIENT_CERT,
  KAFKA_CLIENT_CERT_KEY: process.env.KAFKA_CLIENT_CERT_KEY,

  // Kafka group id
  KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID || 'legacy-group-processor',

  CREATE_GROUP_TOPIC: process.env.CREATE_GROUP_TOPIC || 'groups.notification.create',
  UPDATE_GROUP_TOPIC: process.env.UPDATE_GROUP_TOPIC || 'groups.notification.update',
  DELETE_GROUP_TOPIC: process.env.DELETE_GROUP_TOPIC || 'groups.notification.delete',

  // informix database configuration
  INFORMIX: {
    SERVER: process.env.IFX_SERVER || 'informixoltp_tcp', // informix server
    DATABASE: process.env.IFX_DATABASE || 'common_oltp', // informix database
    HOST: process.env.INFORMIX_HOST || 'localhost', // host
    PROTOCOL: process.env.IFX_PROTOCOL || 'onsoctcp',
    PORT: process.env.IFX_PORT || '2021', // port
    DB_LOCALE: process.env.IFX_DB_LOCALE || 'en_US.57372',
    USER: process.env.IFX_USER || 'informix', // user
    PASSWORD: process.env.IFX_PASSWORD || '1nf0rm1x', // password
    POOL_MAX_SIZE: parseInt(process.env.IFX_POOL_MAX_SIZE) || 10 // use connection pool in processor, the pool size
  },

  GRAPH_DB_URI: process.env.GRAPH_DB_URI || process.env.GRAPHENEDB_BOLT_URL || 'bolt://localhost:7687',
  GRAPH_DB_USER: process.env.GRAPH_DB_USER || process.env.GRAPHENEDB_BOLT_USER || 'neo4j',
  GRAPH_DB_PASSWORD: process.env.GRAPH_DB_PASSWORD || process.env.GRAPHENEDB_BOLT_PASSWORD || '123456'
}
