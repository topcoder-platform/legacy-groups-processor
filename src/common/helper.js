/**
 * Contains generic helper methods
 */

const config = require('config');
const ifxnjs = require('ifxnjs');
const mysql = require('mysql2');

// Informix connection related config values
const Pool = ifxnjs.Pool;

const pool = Promise.promisifyAll(new Pool());
pool.setMaxPoolSize(config.get('INFORMIX.POOL_MAX_SIZE'));
const informixConnString =
  'SERVER=' +
  config.get('INFORMIX.SERVER') +
  ';DATABASE=' +
  config.get('INFORMIX.DATABASE') +
  ';HOST=' +
  config.get('INFORMIX.HOST') +
  ';Protocol=' +
  config.get('INFORMIX.PROTOCOL') +
  ';SERVICE=' +
  config.get('INFORMIX.PORT') +
  ';DB_LOCALE=' +
  config.get('INFORMIX.DB_LOCALE') +
  ';UID=' +
  config.get('INFORMIX.USER') +
  ';PWD=' +
  config.get('INFORMIX.PASSWORD');

const neo4j = require('neo4j-driver').v1;
const driver = neo4j.driver(config.GRAPH_DB_URI, neo4j.auth.basic(config.GRAPH_DB_USER, config.GRAPH_DB_PASSWORD));

// async function getAuroraConnection() {
//   let mysqlPool = mysql.createPool({
//     connectionLimit: auroraPool,
//     host: auroraHost,
//     user: auroraUsername,
//     password: auroraPassword,
//     port: auroraPort,
//     database: auroraDatabase
//   });

//   return mysqlPool.promise();
// }

/**
 * Create Aurora DB Connection Pool
 */
var mysqlPool  = mysql.createPool({
  connectionLimit: config.get('AURORA.POOL'),
  host: config.get('AURORA.HOST'),
  user: config.get('AURORA.DB_USERNAME'),
  password: config.get('AURORA.DB_PASSWORD'),
  port: config.get('AURORA.PORT'),
  database: config.get('AURORA.DB_NAME')
}).promise();


/**
 * Get Neo4J DB session.
 * @returns {Object} new db session
 */
async function getNeoSession() {
  return driver.session();
}

/**
 * Get Informix connection using the configured parameters
 * @return {Object} Informix connection
 */
async function getInformixConnection() {
  const conn = await pool.openAsync(informixConnString);
  return Promise.promisifyAll(conn);
}

/**
 * Get Kafka options
 * @return {Object} the Kafka options
 */
function getKafkaOptions() {
  const options = {
    connectionString: config.KAFKA_URL,
    groupId: config.KAFKA_GROUP_ID
  };
  if (config.KAFKA_CLIENT_CERT && config.KAFKA_CLIENT_CERT_KEY) {
    options.ssl = {
      cert: config.KAFKA_CLIENT_CERT,
      key: config.KAFKA_CLIENT_CERT_KEY
    };
  }
  return options;
}

module.exports = {
  getNeoSession,
  getInformixConnection,
  getKafkaOptions,
  mysqlPool
};
