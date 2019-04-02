# Topcoder - Legacy Groups Processor

## Dependencies

- nodejs https://nodejs.org/en/ (v8+)
- Kafka
- Informix
- Neo4j https://neo4j.com/download/
- Docker, Docker Compose

## Configuration

Configuration for the legacy groups processor is at `config/default.js`.
The following parameters can be set in config files or in env variables:
- LOG_LEVEL: the log level; default value: 'debug'
- KAFKA_URL: comma separated Kafka hosts; default value: 'localhost:9092'
- KAFKA_CLIENT_CERT: Kafka connection certificate, optional; default value is undefined;
    if not provided, then SSL connection is not used, direct insecure connection is used;
    if provided, it can be either path to certificate file or certificate content
- KAFKA_CLIENT_CERT_KEY: Kafka connection private key, optional; default value is undefined;
    if not provided, then SSL connection is not used, direct insecure connection is used;
    if provided, it can be either path to private key file or private key content
- KAFKA_GROUP_ID: the Kafka group id, default value is 'legacy-group-processor'
- CREATE_GROUP_TOPIC: create group Kafka topic, default value is 'groups.notification.create'
- UPDATE_GROUP_TOPIC: update group Kafka topic, default value is 'groups.notification.update'
- DELETE_GROUP_TOPIC: delete group Kafka topic, default value is 'groups.notification.delete'
- INFORMIX: Informix cdatabase onfiguration parameters, refer `config/default.js` for more information
- GRAPH_DB_URI: Graph DB URI, default is local db URI 'bolt://localhost:7687'
- GRAPH_DB_USER: Graph DB user, default is 'neo4j'
- GRAPH_DB_PASSWORD: Graph DB password, default is '123456', you probably need to change it

generally, we only need to update INFORMIX_HOST, KAFKA_URL and GRAPH_DB_URI via environment variables, see INFORMIX_HOST, KAFKA_URL and GRAPH_DB_URI parameter in docker/sample.api.env

There is a `/health` endpoint that checks for the health of the app. This sets up an expressjs server and listens on the environment variable `PORT`. It's not part of the configuration file and needs to be passed as an environment variable


## Local Kafka setup

- `http://kafka.apache.org/quickstart` contains details to setup and manage Kafka server,
  below provides details to setup Kafka server in Linux/Mac, Windows will use bat commands in bin/windows instead
- download kafka at `https://www.apache.org/dyn/closer.cgi?path=/kafka/1.1.0/kafka_2.11-1.1.0.tgz`
- extract out the downloaded tgz file
- go to extracted directory kafka_2.11-0.11.0.1
- start ZooKeeper server:
  `bin/zookeeper-server-start.sh config/zookeeper.properties`
- use another terminal, go to same directory, start the Kafka server:
  `bin/kafka-server-start.sh config/server.properties`
- note that the zookeeper server is at localhost:2181, and Kafka server is at localhost:9092
- use another terminal, go to same directory, create the needed topics:
  `bin/kafka-topics.sh --create --zookeeper localhost:2181 --replication-factor 1 --partitions 1 --topic groups.notification.create`

  `bin/kafka-topics.sh --create --zookeeper localhost:2181 --replication-factor 1 --partitions 1 --topic groups.notification.update`

  `bin/kafka-topics.sh --create --zookeeper localhost:2181 --replication-factor 1 --partitions 1 --topic groups.notification.delete`

- verify that the topics are created:
  `bin/kafka-topics.sh --list --zookeeper localhost:2181`,
  it should list out the created topics
- run the producer and then write some message into the console to send to the `groups.notification.create` topic:
  `bin/kafka-console-producer.sh --broker-list localhost:9092 --topic groups.notification.create`
  in the console, write message, one message per line:
  `{ "topic": "groups.notification.create", "originator": "groups-api", "timestamp": "2018-03-24T00:00:00", "mime-type": "application/json", "payload": { "id": "55ba651a-6524-4e08-be04-06485f6a8d6f", "name": "group-1", "privateGroup": true, "selfRegister": true, "createdBy": "admin" } }`
- optionally, use another terminal, go to same directory, start a consumer to view the messages:
  `bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic groups.notification.create --from-beginning`
- writing/reading messages to/from other topics are similar


## Topcoder Informix Database Setup
We will use Topcoder Informix database setup on Docker.

Go to `docker-ifx` folder and run `docker-compose up`

Once Informix database is properly started, run the following commands

`docker cp update.sql tc_informix:/`
`docker exec -ti tc_informix bash -c "dbaccess - /update.sql"`

you can also run the sql script using GUI tool directly

## Neo4j database setup

- download the Neo4j Desktop https://neo4j.com/download/
- install the tool
- follow (https://neo4j.com/download-thanks-desktop/?edition=desktop&flavour=winstall64&release=1.1.13&offline=true) to add graph database
- configure graph database connection details in config file

You can also use neo4j deployed in Docker refer https://hub.docker.com/_/neo4j
Here is an example docker-compose.yml
```
neo4j:
  image: neo4j:latest
  ports:
    - 7474:7474
    - 7687:7687
```

After start neo4j, you can visit the neo4j browser in `http://localhost:7474`, the default login credential is `neo4j/neo4j`

## Local deployment
- Given the fact that the library used to access Informix DB depends on Informix Client SDK.
We will run the application on Docker using a base image with Informix Client SDK installed and properly configured.
For deployment, please refer to next section 'Local Deployment with Docker'

## Local Deployment with Docker

To run the Legacy Groups Processor using docker, follow the steps below

1. Make sure that Kafka, Neo4j and Informix are running as per instructions above.

2. Go to `docker` folder

3. Rename the file `sample.api.env` to `api.env` And properly update the IP addresses to match your environment for the variables : KAFKA_URL, INFORMIX_HOST and GRAPH_DB_URI( make sure to use IP address instead of hostname ( i.e localhost will not work)).Here is an example:
```
KAFKA_URL=192.168.31.8:9092
INFORMIX_HOST=192.168.31.8
GRAPH_DB_URI=bolt://192.168.31.8:7687
```

4. Once that is done, go to run the following command

```
docker-compose up
```

5. When you are running the application for the first time, It will take some time initially to download the image and install the dependencies

## Verification
Refer `Verification.md`
