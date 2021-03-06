DATABASE common_oltp;
CREATE SEQUENCE sequence_group_seq INCREMENT BY 1 START WITH 10000000 MINVALUE 10000000;
CREATE TABLE group (
  id DECIMAL(12,0) NOT NULL,
  name VARCHAR(50) NOT NULL,
  description LVARCHAR(500),
  domain VARCHAR(100),
  private_group BOOLEAN NOT NULL,
  self_register BOOLEAN NOT NULL,
  createdBy VARCHAR(100),
  createdAt DATETIME YEAR TO FRACTION NOT NULL,
  modifiedBy VARCHAR(100),
  modifiedAt DATETIME YEAR TO FRACTION
);