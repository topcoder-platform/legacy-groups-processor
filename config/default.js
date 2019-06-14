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
    SERVER: process.env.IFX_SERVER || 'informixoltp_tcp',
    DATABASE: process.env.IFX_DATABASE || 'common_oltp',
    HOST: process.env.INFORMIX_HOST || 'localhost',
    PROTOCOL: process.env.IFX_PROTOCOL || 'onsoctcp',
    PORT: process.env.IFX_PORT || '2021',
    DB_LOCALE: process.env.IFX_DB_LOCALE || 'en_US.57372',
    USER: process.env.IFX_USER || 'informix',
    PASSWORD: process.env.IFX_PASSWORD || '1nf0rm1x',
    POOL_MAX_SIZE: process.env.IFX_POOL_MAX_SIZE ? Number(process.env.IFX_POOL_MAX_SIZE) : 10
  },

  // aurora database configuration
  AURORA: {
    POOL: process.env.POOL ? Number(process.env.POOL) : 10,
    DB_NAME: process.env.DB_NAME || 'Authorization',
    PORT: process.env.PORT || 8885,
    DB_USERNAME: process.env.DB_USERNAME || 'informix',
    DB_PASSWORD: process.env.DB_PASSWORD || '1nf0rm1x',
    HOST: process.env.HOST || 'localhost'
  },

  // neo4j database configuration
  GRAPH_DB_URI: process.env.GRAPH_DB_URI || process.env.GRAPHENEDB_BOLT_URL || 'bolt://localhost:7687',
  GRAPH_DB_USER: process.env.GRAPH_DB_USER || process.env.GRAPHENEDB_BOLT_USER || 'neo4j',
  GRAPH_DB_PASSWORD: process.env.GRAPH_DB_PASSWORD || process.env.GRAPHENEDB_BOLT_PASSWORD || 'neo'
};
