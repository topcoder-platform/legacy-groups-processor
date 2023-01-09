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
  KAFKA_GROUP_MEMBER_ADD_TOPIC: process.env.KAFKA_GROUP_MEMBER_ADD_TOPIC || 'groups.notification.member.add',
  KAFKA_GROUP_MEMBER_DELETE_TOPIC: process.env.KAFKA_GROUP_MEMBER_DELETE_TOPIC || 'groups.notification.member.delete',
  KAFKA_GROUP_UNIVERSAL_MEMBER_ADD_TOPIC:
    process.env.KAFKA_GROUP_UNIVERSAL_MEMBER_ADD_TOPIC || 'groups.notification.universalmember.add',
  KAFKA_GROUP_UNIVERSAL_MEMBER_DELETE_TOPIC:
    process.env.KAFKA_GROUP_UNIVERSAL_MEMBER_DELETE_TOPIC || 'groups.notification.universalmember.delete',

  // informix database configuration
  INFORMIX: {
    SERVER: process.env.IFX_SERVER || 'informixoltp_tcp',
    DATABASE: process.env.IFX_DATABASE || 'common_oltp',
    HOST: process.env.IFX_HOST || 'localhost',
    PROTOCOL: process.env.IFX_PROTOCOL || 'onsoctcp',
    PORT: process.env.IFX_PORT || '2021',
    DB_LOCALE: process.env.IFX_DB_LOCALE || 'en_US.57372',
    USER: process.env.IFX_USER || 'informix',
    PASSWORD: process.env.IFX_PASSWORD || '1nf0rm1x',
    POOL_MAX_SIZE: process.env.IFX_POOL_MAX_SIZE ? Number(process.env.IFX_POOL_MAX_SIZE) : 10
  },

  // aurora database configuration
  AURORA: {
    POOL: process.env.AURORA_POOL ? Number(process.env.AURORA_POOL) : 10,
    DB_NAME: process.env.AURORA_DB_NAME || 'Authorization',
    PORT: process.env.AURORA_PORT || 8885,
    DB_USERNAME: process.env.AURORA_USER || 'informix',
    DB_PASSWORD: process.env.AURORA_PASSWORD || '1nf0rm1x',
    HOST: process.env.AURORA_HOST || 'localhost'
  },

  // neo4j database configuration
  GRAPH_DB_URI: process.env.GRAPH_DB_URI || process.env.GRAPHENEDB_BOLT_URL || 'bolt://localhost:7687',
  GRAPH_DB_USER: process.env.GRAPH_DB_USER || process.env.GRAPHENEDB_BOLT_USER || 'neo4j',
  GRAPH_DB_PASSWORD: process.env.GRAPH_DB_PASSWORD || process.env.GRAPHENEDB_BOLT_PASSWORD || 'neo',

  // UBahn API
  UBAHN_API: process.env.UBAHN_API,
  UBAHN_TOPCODER_ORG_NAME: process.env.UBAHN_TOPCODER_ORG_NAME,
  AUTH0_URL: process.env.AUTH0_URL,
  AUTH0_AUDIENCE: process.env.AUTH0_AUDIENCE || 'https://www.topcoder.com',
  TOKEN_CACHE_TIME: process.env.TOKEN_CACHE_TIME,
  AUTH0_CLIENT_ID: process.env.AUTH0_CLIENT_ID,
  AUTH0_CLIENT_SECRET: process.env.AUTH0_CLIENT_SECRET,
  AUTH0_PROXY_SERVER_URL: process.env.AUTH0_PROXY_SERVER_URL,

  GROUPS_API: process.env.GROUPS_API || 'https://api.topcoder.com/v5/groups/',
}
