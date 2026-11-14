'use strict';
// SequelizeMeta reads the schema (showAllTables, describeTable and a per-dialect
// foreign-key query) and writes one metadata module per table. These tests use a real
// (in-memory sqlite) Sequelize instance, report it as another dialect where needed, and
// stub the schema queries with rows shaped like each database returns them.
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const sinon = require('sinon');
const { Sequelize, QueryTypes } = require('sequelize');
const SequelizeMeta = require('../lib/sequelize-meta');

function sqliteSequelize() {
  return new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
}

/** A Sequelize instance that reports `dialect`, with stubbed schema queries. */
function fakeDatabase(sandbox, dialect, { tables, columns, keys, database = 'app' }) {
  const sequelize = sqliteSequelize();
  sequelize.options.dialect = dialect;
  sequelize.options.database = database;
  sequelize.config.database = database;
  const queryInterface = {
    showAllTables: sandbox.stub().resolves(tables),
    describeTable: sandbox.stub().callsFake((table) => Promise.resolve(JSON.parse(JSON.stringify(columns[table] || {})))),
  };
  sandbox.stub(sequelize, 'getQueryInterface').returns(queryInterface);
  const query = sandbox.stub(sequelize, 'query').callsFake((sql) => {
    const table = Object.keys(keys).find((t) => sql.includes(`'${t}'`) || sql.includes(`(${t})`));
    return Promise.resolve(table ? keys[table] : []);
  });
  return { sequelize, queryInterface, query };
}

function generate(sequelize, options) {
  return new Promise((resolve, reject) => {
    new SequelizeMeta(sequelize, Object.assign({ overwrite: false }, options)).run((err, text) => {
      if (err) {
        reject(err);
      } else {
        resolve(text);
      }
    });
  });
}

/** Loads generated text the way require() would, with a stub Sequelize. */
function evaluate(text) {
  // Stands in for any DataTypes expression: DataTypes.INTEGER(11).UNSIGNED.ZEROFILL, etc.
  const chain = new Proxy(function () {}, { get: () => chain, apply: () => chain });
  const DataTypes = chain;
  const fakeSequelize = { DataTypes, fn: (f) => `fn:${f}`, literal: (l) => `literal:${l}` };
  const sandbox = { module: { exports: {} }, require: () => fakeSequelize };
  vm.runInNewContext(text, sandbox);
  return sandbox.module.exports;
}

describe('SequelizeMeta', function () {
  let expect;
  let sandbox;
  let consoleError;

  before(async function () {
    expect = (await import('chai')).expect;
  });

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    consoleError = sandbox.stub(console, 'error');
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('mysql', function () {
    const columns = {
      person: {
        id: { type: 'INT(11) UNSIGNED ZEROFILL', allowNull: false, defaultValue: null, primaryKey: true, autoIncrement: true, comment: null },
        tenant_id: { type: 'INT(11)', allowNull: true, defaultValue: null, primaryKey: false, autoIncrement: false, comment: 'The tenant' },
        email: { type: 'VARCHAR(100)', allowNull: false, defaultValue: 'nobody@example.test', primaryKey: false },
        active: { type: 'BIT(1)', allowNull: false, defaultValue: "b'1'" },
        deleted: { type: 'BIT(1)', allowNull: false, defaultValue: "b'0'" },
        created_date: { type: 'DATETIME', allowNull: false, defaultValue: 'CURRENT_TIMESTAMP' },
        start_date: { type: 'DATETIME', allowNull: true, defaultValue: '2020-01-01 00:00:00' },
        birth_date: { type: 'DATE', allowNull: true },
        uid: { type: 'CHAR(36)', allowNull: true, defaultValue: 'uuid()' },
        price: { type: 'DECIMAL(10,2)', allowNull: true, defaultValue: '0.00' },
        quantity: { type: 'SMALLINT(6)', allowNull: true, defaultValue: 0 },
        big: { type: 'BIGINT(20)' },
        ratio: { type: 'FLOAT' },
        notes: { type: 'TEXT' },
        starts: { type: 'TIME' },
        doc: { type: 'JSON' },
        shape: { type: 'GEOMETRY' },
        flag: { type: 'TINYINT(1)' },
        createdAt: { type: 'DATETIME' },
        updatedAt: { type: 'DATETIME' },
      },
      tenant: {
        id: { type: 'INT(11)', allowNull: false, primaryKey: true, autoIncrement: true },
      },
      skipped: { id: { type: 'INT(11)' } },
    };
    const keys = {
      person: [
        { constraint_name: 'PRIMARY', source_column: 'id', target_table: null, target_column: null, extra: 'auto_increment', column_key: 'PRI' },
        { constraint_name: 'fk_person_tenant', source_column: 'tenant_id', target_table: 'tenant', target_column: 'id', extra: '', column_key: 'MUL' },
        { constraint_name: 'uq_email', source_column: 'email', target_table: null, target_column: null, extra: '', column_key: 'UNI' },
      ],
      tenant: [{ constraint_name: 'PRIMARY', source_column: 'id', target_column: null, extra: 'auto_increment', column_key: 'PRI' }],
    };

    it('generates column definitions from the schema', async function () {
      const db = fakeDatabase(sandbox, 'mysql', { tables: ['person', 'tenant', 'skipped'], columns, keys });
      const text = await generate(db.sequelize, { tables: ['person', 'tenant'] });

      expect(Object.keys(text).sort()).to.deep.equal(['person', 'tenant']);
      const person = text.person;
      expect(person).to.match(/^\/\/ \*+\n\/\/ \*\* This is a generated file/);
      expect(person).to.include('\t\tid: {\n\t\t\ttype: DataTypes.INTEGER(11).UNSIGNED.ZEROFILL,');
      expect(person).to.match(/id: \{[^}]*primaryKey: true,\n\t\t\tautoIncrement: true,/);
      // BUG: a null comment is written as the string "null".
      expect(person).to.match(/id: \{[^}]*comment: "null",/);
      expect(person).to.match(/tenantId: \{[\s\S]*?comment: "The tenant",[\s\S]*?references: \{\n\t\t\t\tmodel: 'tenant',\n\t\t\t\tkey: 'id'\n\t\t\t\}[\s\S]*?field: 'tenant_id'/);
      expect(person).to.match(/email: \{[^}]*type: DataTypes\.STRING\(100\),[^}]*defaultValue: 'nobody@example\.test',[^}]*unicode: false,\n\t\t\tunique: true,\n\t\t\tfield: 'email'/);
      // BUG: the "mySql Bit fix" turns b'1'/b'0' into 1/0, but the string handling after it
      // quotes the result again, so BIT defaults come out as the strings '1' and '0'.
      expect(person).to.match(/active: \{[^}]*type: DataTypes\.BOOLEAN,[^}]*defaultValue: '1'/);
      expect(person).to.match(/deleted: \{[^}]*defaultValue: '0'/);
      expect(person).to.match(/createdDate: \{[^}]*type: DataTypes\.DATE,[^}]*defaultValue: Sequelize\.literal\('CURRENT_TIMESTAMP'\)/);
      expect(person).to.match(/startDate: \{[^}]*defaultValue: '2020-01-01 00:00:00'/);
      expect(person).to.match(/birthDate: \{[^}]*DataTypes\.DATEONLY[\s\S]*?get: function\(name\)/);
      expect(person).to.match(/uid: \{[^}]*type: DataTypes\.CHAR\(36\),[^}]*defaultValue: Sequelize\.fn\('uuid'\)/);
      expect(person).to.match(/price: \{[^}]*type: DataTypes\.DECIMAL,[^}]*defaultValue: '0\.00'/);
      expect(person).to.match(/quantity: \{[^}]*type: DataTypes\.INTEGER\(6\),[^}]*defaultValue: 0/);
      expect(person).to.match(/big: \{\n\t\t\ttype: DataTypes\.BIGINT/);
      expect(person).to.match(/ratio: \{\n\t\t\ttype: DataTypes\.FLOAT/);
      expect(person).to.match(/notes: \{\n\t\t\ttype: DataTypes\.TEXT/);
      expect(person).to.match(/starts: \{\n\t\t\ttype: DataTypes\.TIME/);
      expect(person).to.match(/doc: \{\n\t\t\ttype: DataTypes\.JSON/);
      expect(person).to.match(/shape: \{\n\t\t\ttype: DataTypes\.GEOMETRY/);
      expect(person).to.match(/flag: \{\n\t\t\ttype: DataTypes\.INTEGER\(1\)/);
      expect(person).to.match(/\}; \/\/ End of metadata\n$/);

      // The generated module loads.
      const loaded = evaluate(person);
      expect(loaded.tenantId.field).to.equal('tenant_id');
      expect(loaded.tenantId.references).to.deep.equal({ model: 'tenant', key: 'id' });
      expect(loaded.email.unique).to.equal(true);
    });

    it('leaves out timestamp columns named in `additional`', async function () {
      const db = fakeDatabase(sandbox, 'mysql', { tables: ['person'], columns, keys });
      const text = await generate(db.sequelize, {
        additional: { timestamps: true, createdAt: true, updatedAt: 'updatedAt', deletedAt: 'starts' },
      });
      expect(text.person).not.to.match(/createdAt: \{/);
      expect(text.person).not.to.match(/updatedAt: \{/);
      expect(text.person).not.to.match(/starts: \{/);
      expect(text.person).to.match(/createdDate: \{/);
    });

    it('can use spaces, a wider indent, and the column names as-is', async function () {
      const db = fakeDatabase(sandbox, 'mysql', { tables: ['tenant'], columns, keys });
      const text = await generate(db.sequelize, { spaces: true, indentation: 2, camelCase: false });
      expect(text.tenant).to.include('    id: {\n      type: DataTypes.INTEGER(11),');
      expect(text.tenant).not.to.match(/field: /);
    });

    it('skips tables listed in skipTables', async function () {
      const db = fakeDatabase(sandbox, 'mysql', { tables: ['person', 'tenant', 'skipped'], columns, keys });
      const text = await generate(db.sequelize, { skipTables: ['person'] });
      expect(Object.keys(text).sort()).to.deep.equal(['skipped', 'tenant']);
    });

    it('generates every table when neither tables nor skipTables is set', async function () {
      const db = fakeDatabase(sandbox, 'mysql', { tables: ['tenant', 'skipped'], columns, keys });
      const text = await generate(db.sequelize, {});
      expect(Object.keys(text).sort()).to.deep.equal(['skipped', 'tenant']);
    });

    it('passes the database name to the foreign-key query', async function () {
      const db = fakeDatabase(sandbox, 'mysql', { tables: ['tenant'], columns, keys, database: 'reflex' });
      await generate(db.sequelize, {});
      const [sql, options] = db.query.firstCall.args;
      expect(sql).to.match(/CONSTRAINT_SCHEMA = 'reflex'/);
      expect(options).to.deep.equal({ type: QueryTypes.SELECT, raw: true });
    });

    it('logs a failed foreign-key query and still generates the tables', async function () {
      const db = fakeDatabase(sandbox, 'mysql', { tables: ['tenant'], columns, keys });
      db.query.rejects(new Error('no access to information_schema'));
      const text = await generate(db.sequelize, {});
      expect(consoleError.calledOnce).to.equal(true);
      expect(String(consoleError.firstCall.args[0])).to.match(/no access/);
      expect(text.tenant).to.match(/id: \{/);
    });

    it('logs a failed describeTable and generates what it has', async function () {
      const db = fakeDatabase(sandbox, 'mysql', { tables: ['tenant'], columns, keys });
      db.queryInterface.describeTable.rejects(new Error('describe failed'));
      const text = await generate(db.sequelize, {});
      expect(String(consoleError.firstCall.args[0])).to.match(/describe failed/);
      expect(text).to.deep.equal({});
    });

    it('reports a failed table listing to the callback', async function () {
      const db = fakeDatabase(sandbox, 'mysql', { tables: [], columns, keys });
      db.queryInterface.showAllTables.rejects(new Error('cannot list'));
      const text = await generate(db.sequelize, {});
      expect(String(consoleError.firstCall.args[0])).to.match(/cannot list/);
      expect(text).to.deep.equal({});
    });

    // BUG: values are written inside double quotes without escaping, so a column comment
    // containing a double quote produces a metadata file that isn't valid JavaScript.
    it('writes a double quote in a comment unescaped', async function () {
      const db = fakeDatabase(sandbox, 'mysql', {
        tables: ['tenant'],
        columns: { tenant: { name: { type: 'VARCHAR(10)', comment: 'Say "hi"' } } },
        keys: {},
      });
      const text = await generate(db.sequelize, {});
      expect(text.tenant).to.include('comment: "Say "hi""');
      // (The SyntaxError comes from the vm context, so match its name, not its class.)
      expect(() => evaluate(text.tenant)).to.throw().with.property('name', 'SyntaxError');
    });
  });

  describe('postgres', function () {
    const columns = {
      person: {
        id: { type: 'INTEGER', allowNull: false, defaultValue: "nextval('person_id_seq'::regclass)", primaryKey: true, autoIncrement: true },
        mood: { type: 'USER-DEFINED', allowNull: true, special: ['happy', 'sad'] },
        rating: { type: 'DOUBLE PRECISION' },
        amount: { type: 'NUMERIC' },
        label: { type: 'CHARACTER VARYING' },
        uid: { type: 'UUID' },
        attrs: { type: 'JSONB' },
        score: { type: 'REAL' },
        seen: { type: 'TIMESTAMP WITH TIME ZONE', defaultValue: 'now()' },
        ok: { type: 'BOOLEAN', defaultValue: true },
        other_id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
      },
    };
    const keys = {
      person: [
        { constraint_name: 'person_pkey', contype: 'p', source_column: 'id', target_column: null, extra: "nextval('person_id_seq'::regclass)" },
        { constraint_name: 'person_other', contype: 'f', source_column: 'other_id', target_table: 'other', target_column: 'id', extra: null },
      ],
    };

    it('lists tables from the schema, and maps enums, serials and postgres types', async function () {
      const db = fakeDatabase(sandbox, 'postgres', { tables: [], columns, keys });
      db.query.withArgs(sinon.match(/information_schema\.tables/)).resolves([['person']]);
      const text = await generate(db.sequelize, { dialect: 'postgres', schema: 'public' });

      expect(db.query.firstCall.args[1]).to.deep.equal({ raw: true, type: QueryTypes.SHOWTABLES });
      expect(db.queryInterface.showAllTables.called).to.equal(false);
      const person = text.person;
      // A serial key gets autoIncrement from its foreign-key row, and no default.
      expect(person).to.match(/id: \{\n\t\t\ttype: DataTypes\.INTEGER,\n\t\t\tallowNull: false,\n\t\t\tprimaryKey: true,\n\t\t\tautoIncrement: true,\n\t\t\tautoIncrement: true/);
      expect(person).not.to.match(/nextval/);
      expect(person).to.match(/mood: \{\n\t\t\ttype: DataTypes\.ENUM\("happy","sad"\)/);
      expect(person).to.match(/rating: \{\n\t\t\ttype: DataTypes\.DOUBLE/);
      expect(person).to.match(/amount: \{\n\t\t\ttype: DataTypes\.DOUBLE/);
      expect(person).to.match(/label: \{\n\t\t\ttype: DataTypes\.STRING,/);
      expect(person).to.match(/uid: \{\n\t\t\ttype: DataTypes\.UUIDV4/);
      expect(person).to.match(/attrs: \{\n\t\t\ttype: DataTypes\.JSONB/);
      expect(person).to.match(/score: \{\n\t\t\ttype: DataTypes\.REAL/);
      expect(person).to.match(/seen: \{[^}]*defaultValue: Sequelize\.fn\('now'\)/);
      expect(person).to.match(/ok: \{\n\t\t\ttype: DataTypes\.BOOLEAN,\n\t\t\tdefaultValue: true/);
      // A foreign key that's also marked primary in describeTable isn't written as primary.
      expect(person).to.match(/otherId: \{\n\t\t\ttype: DataTypes\.INTEGER,\n\t\t\treferences: \{/);
    });

    it('uses showAllTables when no schema is given', async function () {
      const db = fakeDatabase(sandbox, 'postgres', { tables: ['person'], columns, keys });
      const text = await generate(db.sequelize, { dialect: 'postgres' });
      expect(db.queryInterface.showAllTables.calledOnce).to.equal(true);
      expect(Object.keys(text)).to.deep.equal(['person']);
    });

    it('accepts a single table name from the schema listing', async function () {
      const db = fakeDatabase(sandbox, 'postgres', { tables: [], columns, keys });
      db.query.withArgs(sinon.match(/information_schema\.tables/)).resolves('person');
      const text = await generate(db.sequelize, { dialect: 'postgres', schema: 'public' });
      expect(Object.keys(text)).to.deep.equal(['person']);
    });
  });

  describe('mssql', function () {
    const columns = {
      person: {
        id: { type: 'INT', allowNull: false, primaryKey: true, autoIncrement: true, defaultValue: null },
        guid: { type: 'UNIQUEIDENTIFIER', allowNull: false, defaultValue: '(newid())' },
        active: { type: 'BIT', defaultValue: '((1))' },
        archived: { type: 'BIT', defaultValue: '((0))' },
        created: { type: 'DATETIME2', defaultValue: '(getdate())' },
        name: { type: 'NVARCHAR(100)' },
        body: { type: 'NTEXT' },
      },
    };
    const keys = {
      person: [{ constraint_name: 'PK_person', constraint_type: 'PRIMARY KEY', source_column: 'id', target_column: null, is_identity: true }],
    };

    it('reads table names from mssql rows and handles mssql defaults', async function () {
      const db = fakeDatabase(sandbox, 'mssql', { tables: [{ tableName: 'person', schema: 'dbo' }], columns, keys });
      const text = await generate(db.sequelize, {});
      const person = text.person;
      expect(person).to.match(/id: \{\n\t\t\ttype: DataTypes\.INTEGER,\n\t\t\tallowNull: false,\n\t\t\tprimaryKey: true,\n\t\t\tautoIncrement: true,\n\t\t\tautoIncrement: true,/);
      expect(person).to.match(/guid: \{\n\t\t\ttype: DataTypes\.UUIDV4,\n\t\t\tallowNull: false,\n\t\t\tfield: 'guid'/);
      // BUG: as for MySQL, the bit fix's 1/0 is quoted again, giving '1'/'0'.
      expect(person).to.match(/active: \{\n\t\t\ttype: DataTypes\.BOOLEAN,\n\t\t\tdefaultValue: '1'/);
      expect(person).to.match(/archived: \{\n\t\t\ttype: DataTypes\.BOOLEAN,\n\t\t\tdefaultValue: '0'/);
      expect(person).to.match(/created: \{\n\t\t\ttype: DataTypes\.DATE,\n\t\t\tdefaultValue: Sequelize\.fn\('getdate'\)/);
      expect(person).to.match(/name: \{\n\t\t\ttype: DataTypes\.STRING,\n\t\t\tunicode: true,/);
      expect(person).to.match(/body: \{\n\t\t\ttype: DataTypes\.TEXT/);
    });
  });

  describe('dialects without key details', function () {
    it('skips the foreign-key query for an unknown dialect', async function () {
      const db = fakeDatabase(sandbox, 'db2', {
        tables: ['t'],
        columns: { t: { id: { type: 'INTEGER', primaryKey: true, autoIncrement: true } } },
        keys: {},
      });
      const text = await generate(db.sequelize, {});
      expect(db.query.called).to.equal(false);
      expect(text.t).to.match(/id: \{\n\t\t\ttype: DataTypes\.INTEGER,\n\t\t\tprimaryKey: true,\n\t\t\tautoIncrement: true/);
    });
  });

  describe('sqlite', function () {
    it('defaults the storage option for the sqlite dialect', function () {
      const options = { dialect: 'sqlite', overwrite: false };
      const meta = new SequelizeMeta(sqliteSequelize(), options);
      expect(options.storage).to.equal('sequelize');
      expect(meta.options.indentation).to.equal(1);
      expect(meta.options.camelCase).to.equal(true);
    });

    it('works with no options at all', function () {
      const meta = new SequelizeMeta(sqliteSequelize());
      expect(meta.options.directory).to.equal('./sequelize-meta');
      expect(meta.options.overwrite).to.equal(true);
    });

    it('writes one file per table into the directory, creating it', async function () {
      const sequelize = sqliteSequelize();
      await sequelize.query('CREATE TABLE tenant (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR(100) NOT NULL DEFAULT \'x\')');
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transom-sequelize-meta-'));
      const directory = path.join(tmpDir, 'nested', 'meta');
      try {
        await generate(sequelize, { directory, overwrite: true });
        expect(fs.readdirSync(directory)).to.deep.equal(['tenant.js']);
        const loaded = evaluate(fs.readFileSync(path.join(directory, 'tenant.js'), 'utf8'));
        expect(loaded.name.defaultValue).to.equal('x');
        expect(loaded.name.allowNull).to.equal(false);
      } finally {
        await sequelize.close();
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    // BUG: sqlite's describeTable() reports `unique: false` and, for a foreign-key column,
    // `references: {model, key}`. The generator writes the boolean as the string "false",
    // and calls toLowerCase() on the references object, which throws inside a promise
    // callback: run() never calls back, and initialize() never resolves.
    it('writes unique: "false" as a string, and fails on sqlite foreign keys', async function () {
      const sequelize = sqliteSequelize();
      await sequelize.query('CREATE TABLE tenant (id INTEGER PRIMARY KEY)');
      await sequelize.query('CREATE TABLE person (id INTEGER PRIMARY KEY, tenant_id INTEGER REFERENCES tenant(id))');

      const tenant = await generate(sequelize, { tables: ['tenant'] });
      expect(tenant.tenant).to.include('unique: "false"');

      const saved = process.listeners('unhandledRejection');
      process.removeAllListeners('unhandledRejection');
      const unhandled = [];
      process.on('unhandledRejection', (reason) => unhandled.push(reason));
      let calledBack = false;
      try {
        new SequelizeMeta(sequelize, { overwrite: false, tables: ['person'] }).run(() => {
          calledBack = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 200));
      } finally {
        process.removeAllListeners('unhandledRejection');
        for (const listener of saved) {
          process.on('unhandledRejection', listener);
        }
        await sequelize.close();
      }
      expect(calledBack).to.equal(false);
      expect(unhandled).to.have.length(1);
      expect(String(unhandled[0])).to.match(/Expected a string column attribute, got object/);
    });
  });
});
