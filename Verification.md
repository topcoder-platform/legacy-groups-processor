# Topcoder - Legacy Groups Processor

## Verification
start Kafka server, start Informix database, start Neo4j server, start processor app
run command `docker cp docker-ifx/viewdata.sql tc_informix:/` and `docker cp docker-ifx/delete.sql tc_informix:/` so you can use them to verify group data and delete group data.

1. Open Neo4j Browser(`http://localhost:7474`) to insert group data. run the following command:
`CREATE (g:Group {id: "55ba651a-6524-4e08-be04-06485f6a8d6f", name: "group-1", privateGroup: true, selfRegister: true, createdBy: "admin"}) RETURN g`
Run command `MATCH (g:Group {id: "55ba651a-6524-4e08-be04-06485f6a8d6f"}) RETURN g` to verify group has been insert into neo4j
2. start kafka-console-producer to write messages to `groups.notification.create` topic:
  `bin/kafka-console-producer.sh --broker-list localhost:9092 --topic groups.notification.create`
3. write message:
  `{ "topic": "groups.notification.create", "originator": "groups-api", "timestamp": "2018-03-24T00:00:00", "mime-type": "application/json", "payload": { "id": "55ba651a-6524-4e08-be04-06485f6a8d6f", "name": "group-1", "privateGroup": true, "selfRegister": true, "createdBy": "admin" } }`
4. check the app console to verify message has been properly handled.
5. open a new console to run command `docker exec -ti tc_informix bash -c "dbaccess - /viewdata.sql"` to verify data has been inserted into group table, mark down the id field.
6. Open Neo4j Browser(`http://localhost:7474`), Run command `MATCH (g:Group {id: "55ba651a-6524-4e08-be04-06485f6a8d6f"}) RETURN g` to verify oldId field has been updated.
7. Try to write a message that will cause error(duplicate name):
  `{ "topic": "groups.notification.create", "originator": "groups-api", "timestamp": "2018-03-24T00:00:00", "mime-type": "application/json", "payload": { "id": "55ba651a-6524-4e08-be04-06485f6a8d7f", "name": "group-1", "privateGroup": true, "selfRegister": true, "createdBy": "admin" } }`
8. You will see error message in app console.
9. start kafka-console-producer to write messages to `groups.notification.update` topic:
  `bin/kafka-console-producer.sh --broker-list localhost:9092 --topic groups.notification.update`
10. write message(`uses the id value(a number) you got in step 5 as oldId value`):
  `{ "topic": "groups.notification.update", "originator": "groups-api", "timestamp": "2018-03-24T00:00:00", "mime-type": "application/json", "payload": { "oldId": <id_in_step5>, "name": "new-group-1", "description": "new-description", "domain": "www.topcoder.com",  "privateGroup": false, "selfRegister": false, "updatedBy": "user" } }`
11. check the app console to verify message has been properly handled.
12. open a new console to run command `docker exec -ti tc_informix bash -c "dbaccess - /viewdata.sql"` to verify data has been updated.
13. start kafka-console-producer to write messages to `groups.notification.delete` topic:
  `bin/kafka-console-producer.sh --broker-list localhost:9092 --topic groups.notification.delete`
14. write message(`uses the id value(a number) you got in step 5 as oldId value`):
  `{ "topic": "groups.notification.delete", "originator": "groups-api", "timestamp": "2018-03-24T00:00:00", "mime-type": "application/json", "payload": { "oldId": <id_in_step5>} }`
15. check the app console to verify message has been properly handled.
16. open a new console to run command `docker exec -ti tc_informix bash -c "dbaccess - /viewdata.sql"` to verify data has been deleted.

For clear the environment:
clear the group table in Informix:
`docker exec -ti tc_informix bash -c "dbaccess - /delete.sql"`
clear the group nodes in Neo4j:
Open Neo4j Browser(`http://localhost:7474`) and run `MATCH (g:Group) DELETE g`
