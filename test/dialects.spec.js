'use strict';
const dialects = require('../lib/dialects');

describe('dialects', function () {
  let expect;

  before(async function () {
    expect = (await import('chai')).expect;
  });

  describe('sqlite', function () {
    it('reads foreign keys with a PRAGMA', function () {
      expect(dialects.sqlite.getForeignKeysQuery('person')).to.equal('PRAGMA foreign_key_list(person);');
    });

    it('treats a row with primaryKey === true as a primary key', function () {
      expect(dialects.sqlite.isPrimaryKey({ primaryKey: true })).to.equal(true);
      expect(dialects.sqlite.isPrimaryKey({ primaryKey: 1 })).to.equal(false);
      expect(dialects.sqlite.isPrimaryKey({})).to.equal(false);
      expect(dialects.sqlite.isPrimaryKey(null)).to.equal(false);
    });
  });

  describe('mysql (and mariadb)', function () {
    const mysql = dialects.mysql;

    it('is shared with mariadb', function () {
      expect(dialects.mariadb).to.equal(mysql);
    });

    it('queries KEY_COLUMN_USAGE for the table and schema', function () {
      const sql = mysql.getForeignKeysQuery('person', 'app');
      expect(sql).to.match(/INFORMATION_SCHEMA\.KEY_COLUMN_USAGE/);
      expect(sql).to.match(/K\.TABLE_NAME = 'person'/);
      expect(sql).to.match(/K\.CONSTRAINT_SCHEMA = 'app'/);
    });

    it('classifies key rows', function () {
      expect(mysql.isForeignKey({ extra: '' })).to.equal(true);
      expect(mysql.isForeignKey({ extra: 'auto_increment' })).to.equal(false);
      expect(mysql.isForeignKey({})).to.equal(false);

      expect(mysql.isUnique({ column_key: 'uni' })).to.equal(true);
      expect(mysql.isUnique({ column_key: 'PRI' })).to.equal(false);
      // A non-string column_key (never returned by the query) isn't unique.
      expect(mysql.isUnique({ column_key: 1 })).to.equal(false);
      expect(mysql.isUnique('UNI')).to.equal(false);

      expect(mysql.isPrimaryKey({ constraint_name: 'PRIMARY' })).to.equal(true);
      expect(mysql.isPrimaryKey({ constraint_name: 'fk_tenant' })).to.equal(false);

      expect(mysql.isSerialKey({ extra: 'auto_increment' })).to.equal(true);
      expect(mysql.isSerialKey({ extra: '' })).to.equal(false);
    });
  });

  describe('postgres', function () {
    const postgres = dialects.postgres;

    it('queries pg_constraint for the table', function () {
      expect(postgres.getForeignKeysQuery('person')).to.match(/relname = 'person'/);
    });

    it('classifies key rows by contype', function () {
      expect(postgres.isForeignKey({ contype: 'f' })).to.equal(true);
      expect(postgres.isUnique({ contype: 'u' })).to.equal(true);
      expect(postgres.isPrimaryKey({ contype: 'p' })).to.equal(true);
      expect(postgres.isPrimaryKey({ contype: 'f' })).to.equal(false);
      expect(postgres.isForeignKey(undefined)).to.equal(false);
    });

    it('recognises serial primary keys from their nextval default', function () {
      expect(postgres.isSerialKey({ contype: 'p', extra: "nextval('person_id_seq'::regclass)" })).to.equal(true);
      expect(postgres.isSerialKey({ contype: 'p', extra: 'now()' })).to.equal(false);
      expect(postgres.isSerialKey({ contype: 'f', extra: "nextval('person_id_seq'::regclass)" })).to.equal(false);
      expect(postgres.isSerialKey({ contype: 'p', extra: null })).to.equal(false);
      expect(postgres.isSerialKey(null)).to.equal(false);
    });

    it('lists the tables of a schema', function () {
      const sql = postgres.showTablesQuery('public');
      expect(sql).to.match(/table_schema = 'public'/);
      expect(sql).to.match(/spatial_ref_sys/);
    });
  });

  describe('mssql', function () {
    const mssql = dialects.mssql;

    it('quotes the table name (Sequelize strips any quotes inside it)', function () {
      expect(mssql.getForeignKeysQuery('person')).to.match(/ccu\.table_name = 'person'$/);
      expect(mssql.getForeignKeysQuery("o'brien")).to.match(/ccu\.table_name = 'obrien'$/);
    });

    it('classifies key rows by constraint_type and is_identity', function () {
      expect(mssql.isForeignKey({ constraint_type: 'FOREIGN KEY' })).to.equal(true);
      expect(mssql.isPrimaryKey({ constraint_type: 'PRIMARY KEY' })).to.equal(true);
      expect(mssql.isPrimaryKey({ constraint_type: 'UNIQUE' })).to.equal(false);
      expect(mssql.isSerialKey({ constraint_type: 'PRIMARY KEY', is_identity: true })).to.equal(true);
      expect(mssql.isSerialKey({ constraint_type: 'PRIMARY KEY', is_identity: false })).to.equal(false);
      expect(mssql.isSerialKey({ constraint_type: 'FOREIGN KEY', is_identity: true })).to.equal(false);
      expect(mssql.isSerialKey(null)).to.equal(false);
    });
  });
});
