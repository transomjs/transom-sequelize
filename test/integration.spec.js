'use strict';
// End-to-end: the plugin running inside a real transom-core server, against a sqlite
// database file in a temp folder. Covers initialize() (connect, generate and load the
// metadata, define the models) and the generated REST routes over HTTP.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Sequelize } = require('sequelize');
const TransomCore = require('@transomjs/transom-core');
const transomSequelize = require('../');

// initialize() resolves the metadata folder from the application root, which it takes to
// be three folders above the package (node_modules/@transomjs/transom-sequelize).
const APP_ROOT = path.join(__dirname, '..', '..', '..', '..');

// The generated metadata files require('sequelize'). In an application they sit beside
// its node_modules; here they're in a temp folder, so resolve from this package's.
const Module = require('module');
let savedNodePath;
function useOwnNodeModules() {
  savedNodePath = process.env.NODE_PATH;
  process.env.NODE_PATH = [path.join(__dirname, '..', 'node_modules'), savedNodePath].filter(Boolean).join(path.delimiter);
  Module._initPaths();
}
function restoreNodePath() {
  if (savedNodePath === undefined) {
    delete process.env.NODE_PATH;
  } else {
    process.env.NODE_PATH = savedNodePath;
  }
  Module._initPaths();
}

function removeTempDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    // Windows can hold the sqlite file briefly after close; the OS cleans temp later.
  }
}

const SCHEMA = [
  `CREATE TABLE tenant (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    active BOOLEAN DEFAULT 1
  )`,
  `CREATE TABLE person (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50),
    birth_date DATE,
    score FLOAT,
    notes TEXT,
    created_by VARCHAR(100),
    created_date DATETIME,
    updated_by VARCHAR(100),
    updated_date DATETIME
  )`,
  `CREATE TABLE secret (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner VARCHAR(50)
  )`,
];

// Copies the query string into req.params, after routing (transom-core's own mapping
// runs before routing, and Express replaces req.params when it matches a route).
function mapQueryToParams(req, res, next) {
  Object.assign(req.params, req.query);
  next();
}

function addUser(req, res, next) {
  req.locals.user = { email: 'tester@example.test', groups: [{ groupCode: 'admins' }] };
  next();
}

describe('integration: initialize() with transom-core and sqlite', function () {
  this.timeout(20000);
  let expect;
  let tmpDir;
  let storage;
  let server;
  let httpServer;
  let baseUrl;

  before(async function () {
    expect = (await import('chai')).expect;

    useOwnNodeModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transom-sequelize-'));
    storage = path.join(tmpDir, 'test.sqlite');
    const relativeMeta = path.relative(APP_ROOT, path.join(tmpDir, 'meta'));
    if (path.isAbsolute(relativeMeta)) {
      this.skip(); // The temp folder is on another drive; the metadata path can't reach it.
    }

    const setup = new Sequelize({ dialect: 'sqlite', storage, logging: false });
    for (const sql of SCHEMA) {
      await setup.query(sql);
    }
    await setup.close();

    const transom = new TransomCore();
    transom.configure(transomSequelize, { preMiddleware: [mapQueryToParams, addUser] });

    const logSpy = console.log;
    console.log = function () {}; // initialize() logs its connection status.
    try {
      server = await transom.initialize({
        transom: { suppressTimezoneWarning: true, requestLogger: false },
        definition: {
          uri: { prefix: '/api/v1' },
          sequelize: {
            directory: relativeMeta,
            config: { dialect: 'sqlite', storage, logging: false, dateStringify: undefined },
            tables: {
              tenant: {
                audit: false,
                statics: {
                  greeting: 'hello',
                  shout: function () {
                    return 'HELLO';
                  },
                },
                methods: {
                  kind: 'tenant',
                  label: function () {
                    return `tenant:${this.name}`;
                  },
                },
              },
              person: {
                code: 'People',
                audit: {
                  createdAt: 'createdDate',
                  createdBy: 'createdBy',
                  updatedAt: 'updatedDate',
                  updatedBy: 'updatedBy',
                },
                attributes: { notes: { queryable: false } },
                routes: { delete: {}, deleteBatch: {} },
              },
              secret: { audit: false, routes: false },
            },
          },
        },
      });
    } finally {
      console.log = logSpy;
    }

    await new Promise((resolve) => {
      httpServer = server.listen(0, resolve);
    });
    baseUrl = `http://127.0.0.1:${httpServer.address().port}/api/v1/db`;
  });

  after(async function () {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    if (server) {
      await server.registry.get('sequelize').close();
    }
    if (tmpDir) {
      removeTempDir(tmpDir);
    }
    restoreNodePath();
  });

  async function call(method, url, body) {
    const res = await fetch(baseUrl + url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (err) {
      // Express's HTML error page.
    }
    return { status: res.status, body: parsed };
  }

  it('writes a metadata file per table into the configured folder', function () {
    const files = fs.readdirSync(path.join(tmpDir, 'meta')).sort();
    expect(files).to.deep.equal(['person.js', 'secret.js', 'tenant.js']);
    const person = fs.readFileSync(path.join(tmpDir, 'meta', 'person.js'), 'utf8');
    expect(person).to.match(/This is a generated file/);
    expect(person).to.match(/firstName: \{[\s\S]*?type: DataTypes\.STRING\(50\)[\s\S]*?field: "first_name"/);
    // sqlite's single INTEGER PRIMARY KEY is assigned automatically.
    expect(person).to.match(/id: \{[^}]*autoIncrement: true/);
    expect(person).to.match(/birthDate: \{[\s\S]*?DataTypes\.DATEONLY[\s\S]*?get: function\(name\)/);
  });

  it('defines a model per table, using the lower-cased code as its name', function () {
    const sequelize = server.registry.get('sequelize');
    expect(Object.keys(sequelize.models).sort()).to.deep.equal(['people', 'secret', 'tenant']);
    expect(sequelize.models.people.options.createdBy).to.equal('createdBy');
    expect(sequelize.models.tenant.options.timestamps).to.equal(false);
    expect(sequelize.models.people.__meta.notes.queryable).to.equal(false);
  });

  it('adds statics and instance methods; non-functions become getters', function () {
    const tenant = server.registry.get('sequelize').models.tenant;
    expect(tenant.greeting()).to.equal('hello');
    expect(tenant.shout()).to.equal('HELLO');
    const row = tenant.build({ name: 'Acme' });
    expect(row.kind()).to.equal('tenant');
    expect(row.label()).to.equal('tenant:Acme');
  });

  it('getUserAudit fills createdBy/updatedBy only for audited tables', function () {
    const models = server.registry.get('sequelize').models;
    const req = { locals: { user: { email: 'jo@example.test' } } };
    expect(models.people.getUserAudit(req, true)).to.deep.equal({ createdBy: 'jo@example.test', updatedBy: 'jo@example.test' });
    expect(models.people.getUserAudit({ locals: {} }, false)).to.deep.equal({ updatedBy: 'unknown' });
    expect(models.tenant.getUserAudit(req, true)).to.deep.equal({});
  });

  it('responds to inserts on sqlite with the new id', async function () {
    const tenant = await call('POST', '/tenant', { name: 'Acme' });
    expect(tenant.status).to.equal(200);
    expect(tenant.body.id).to.be.a('number');
    const found = await call('GET', '/tenant');
    expect(found.body.data.map((t) => t.name)).to.deep.equal(['Acme']);
    expect(found.body.data[0].id).to.equal(tenant.body.id);
  });

  it('serves insert, find, count, findById, update and delete over HTTP', async function () {
    const tenantId = 1;
    const jo = await call('POST', '/people', { tenantId, firstName: 'Jo', lastName: 'Smith', score: 1.5 });
    expect(jo.status).to.equal(200);
    expect(jo.body.createdBy).to.equal('tester@example.test');
    expect(jo.body.updatedBy).to.equal('tester@example.test');
    await call('POST', '/people', { tenantId, firstName: 'Al', lastName: 'Jones' });

    const all = await call('GET', '/people?_sort=firstName');
    expect(all.status).to.equal(200);
    expect(all.body.data.map((p) => p.firstName)).to.deep.equal(['Al', 'Jo']);
    const joId = all.body.data[1].id;
    const alId = all.body.data[0].id;

    const filtered = await call('GET', '/people?lastName=Smith&_select=id,firstName');
    expect(filtered.body.data).to.deep.equal([{ id: joId, firstName: 'Jo' }]);

    const count = await call('GET', '/people/count?tenantId=' + tenantId);
    expect(count.body).to.deep.equal({ count: 2 });

    const one = await call('GET', `/people/${joId}`);
    expect(one.body.firstName).to.equal('Jo');

    const updated = await call('PUT', `/people/${joId}`, { lastName: 'Smythe' });
    expect(updated.status).to.equal(200);
    expect(updated.body.lastName).to.equal('Smythe');

    const removed = await call('DELETE', `/people/${joId}`);
    expect(removed.status).to.equal(200);
    expect((await call('GET', `/people/${joId}`)).status).to.equal(404);

    // The batch delete takes its ids from the request body.
    const batch = await call('DELETE', '/people/batch', { id: [String(alId)] });
    expect(batch.status).to.equal(200);
    expect((await call('GET', '/people/count')).body).to.deep.equal({ count: 0 });
  });

  it('rejects filters on non-queryable columns', async function () {
    const res = await call('GET', '/people?notes=x');
    expect(res.status).to.equal(400);
  });

  it("doesn't add routes for a table with routes: false", async function () {
    const res = await call('GET', '/secret');
    expect(res.status).to.equal(404);
  });
});

describe('integration: initialize() startup failures', function () {
  this.timeout(20000);
  let expect;
  let savedListeners;
  let unhandled;
  let savedError;
  let savedLog;

  before(async function () {
    expect = (await import('chai')).expect;
  });

  beforeEach(function () {
    // Startup failures reject initialize(); record any unhandled rejection so the
    // tests can check there isn't one.
    unhandled = [];
    savedListeners = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', (reason) => unhandled.push(reason));
    savedError = console.error;
    savedLog = console.log;
    console.error = function () {};
    console.log = function () {};
  });

  afterEach(function () {
    console.error = savedError;
    console.log = savedLog;
    process.removeAllListeners('unhandledRejection');
    for (const listener of savedListeners) {
      process.on('unhandledRejection', listener);
    }
  });

  it('rejects when startup fails, without leaving an unhandled rejection', async function () {
    const registry = new (require('pocket-registry'))();
    registry.set('transom-config', {
      definition: {
        uri: { prefix: '/api/v1' },
        // An unknown dialect makes new Sequelize() throw at once.
        sequelize: { config: { dialect: 'no-such-dialect' }, tables: { t: {} } },
      },
    });
    const server = { registry, get() {}, post() {}, put() {}, del() {} };
    let failure;
    await transomSequelize.initialize(server).catch((err) => {
      failure = err;
    });
    expect(String(failure)).to.match(/no-such-dialect/);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(unhandled).to.have.length(0);
    expect(registry.has('sequelize')).to.equal(false);
  });

  it('uses the configured retryOptions over its defaults', async function () {
    const { Sequelize } = require('sequelize');
    const authenticate = Sequelize.prototype.authenticate;
    let seen;
    Sequelize.prototype.authenticate = function (options) {
      seen = options.retry;
      return Promise.reject(new Error('stop here'));
    };
    const registry = new (require('pocket-registry'))();
    try {
      registry.set('transom-config', {
        definition: {
          uri: { prefix: '/api/v1' },
          sequelize: { config: { dialect: 'sqlite', storage: ':memory:', logging: false, retryOptions: { max: 1, name: 'mine' } }, tables: {} },
        },
      });
      let failure;
      await transomSequelize.initialize({ registry, get() {}, post() {}, put() {}, del() {} }).catch((err) => {
        failure = err;
      });
      expect(String(failure)).to.match(/stop here/);
      expect(seen.max).to.equal(1);
      expect(seen.name).to.equal('mine');
      // Defaults fill in what isn't configured.
      expect(seen.timeout).to.equal(10000);
      expect(seen.backoffBase).to.equal(1000);
      expect(seen.match).to.have.length(1);
      seen.report('reported');
    } finally {
      Sequelize.prototype.authenticate = authenticate;
      await registry.get('sequelize').close();
    }
    expect(unhandled).to.have.length(0);
  });

  it('rejects when a table definition fails, e.g. a static that already exists', async function () {
    const registry = new (require('pocket-registry'))();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transom-sequelize-'));
    const storage = path.join(tmpDir, 'db.sqlite');
    const setup = new Sequelize({ dialect: 'sqlite', storage, logging: false });
    await setup.query('CREATE TABLE thing (id INTEGER PRIMARY KEY)');
    await setup.close();
    registry.set('transom-config', {
      definition: {
        uri: { prefix: '/api/v1' },
        sequelize: {
          directory: path.relative(APP_ROOT, path.join(tmpDir, 'meta')),
          config: { dialect: 'sqlite', storage, logging: false },
          // findAll is already a Sequelize model method.
          tables: { thing: { audit: false, statics: { findAll() {} } } },
        },
      },
    });
    useOwnNodeModules();
    let failure;
    try {
      await transomSequelize.initialize({ registry, get() {}, post() {}, put() {}, del() {} }).catch((err) => {
        failure = err;
      });
    } finally {
      restoreNodePath();
      await registry.get('sequelize').close();
      removeTempDir(tmpDir);
    }
    expect(String(failure)).to.match(/'findAll' already exists on the thing Model/);
    expect(unhandled).to.have.length(0);
  });

  it('applies a custom dateStringify to DATE values', async function () {
    const { DATE } = require('sequelize');
    const original = DATE.prototype._stringify;
    const registry = new (require('pocket-registry'))();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transom-sequelize-'));
    const stringify = function () {
      return 'custom';
    };
    registry.set('transom-config', {
      definition: {
        uri: { prefix: '/api/v1' },
        sequelize: {
          sequelizeKey: 'db',
          directory: path.relative(APP_ROOT, path.join(tmpDir, 'meta')),
          config: { dialect: 'sqlite', storage: path.join(tmpDir, 'empty.sqlite'), logging: false, dateStringify: stringify },
          tables: {},
        },
      },
    });
    const server = { registry, get() {}, post() {}, put() {}, del() {} };
    try {
      await transomSequelize.initialize(server);
      expect(DATE.prototype._stringify).to.equal(stringify);
      expect(registry.has('db')).to.equal(true);
      await registry.get('db').close();
    } finally {
      DATE.prototype._stringify = original;
      removeTempDir(tmpDir);
    }
    expect(unhandled).to.have.length(0);
  });
});
