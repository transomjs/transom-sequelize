'use strict';
const sinon = require('sinon');
const ModelHandler = require('../lib/modelHandler');
const createError = require('http-errors');

describe('modelHandler', function() {
  let chai;
  let expect;
  let sandbox;

  before(function() {
    return import('chai').then(chaiLib => {
      chai = chaiLib;
      expect = chai.expect;
    });
  });

  beforeEach(function() {
    sandbox = sinon.createSandbox();
  });

  afterEach(function() {
    sandbox.restore();
  });

  function createMockServer() {
    return {};
  }

  function createMockSequelize(model) {
    return {
      model: sandbox.stub().returns(model)
    };
  }

  describe('handleFind', function() {
    it('should handle find request successfully', function(done) {
      const mockItems = [{ id: 1 }, { id: 2 }];
      const mockModel = {
        name: 'TestModel',
        findAll: sandbox.stub().resolves(mockItems),
        rawAttributes: { id: {} },
        options: { needsAcl: false }
      };

      const server = createMockServer();
      const sequelize = createMockSequelize(mockModel);
      const modelHandler = ModelHandler({ server, sequelize });

      const req = {
        query: {},
        params: {},
        locals: {
          __entity: {
            modelName: 'testmodel'
          }
        }
      };

      const res = {
        json: sandbox.spy()
      };

      const next = sandbox.spy(function(err) {
        if (err) {
          done(err);
        } else {
          expect(res.json.calledOnce).to.be.true;
          const responseData = res.json.firstCall.args[0];
          expect(responseData.data).to.deep.equal(mockItems);
          done();
        }
      });

      modelHandler.handleFind(req, res, next);
    });

    it('should call custom fx function if provided', function(done) {
      const mockModel = {
        name: 'TestModel'
      };

      const customFx = sandbox.stub().resolves({ items: [{ custom: true }] });

      const server = createMockServer();
      const sequelize = createMockSequelize(mockModel);
      const modelHandler = ModelHandler({ server, sequelize });

      const req = {
        query: {},
        params: {},
        locals: {
          __entity: {
            modelName: 'testmodel',
            routes: {
              find: {
                fx: customFx
              }
            }
          }
        }
      };

      const res = {
        json: sandbox.spy()
      };

      const next = sandbox.spy(function(err) {
        if (err) {
          done(err);
        } else {
          expect(customFx.calledOnce).to.be.true;
          expect(res.json.calledOnce).to.be.true;
          done();
        }
      });

      modelHandler.handleFind(req, res, next);
    });

    it('should handle errors in find', function(done) {
      const mockModel = {
        name: 'TestModel',
        findAll: sandbox.stub().rejects(new Error('Database error')),
        rawAttributes: { id: {} },
        options: { needsAcl: false }
      };

      const server = createMockServer();
      const sequelize = createMockSequelize(mockModel);
      const modelHandler = ModelHandler({ server, sequelize });

      const req = {
        query: {},
        params: {},
        locals: {
          __entity: {
            modelName: 'testmodel'
          }
        }
      };

      const res = {
        json: sandbox.spy()
      };

      const next = sandbox.spy(function(err) {
        expect(err.status).to.equal(400);
        expect(res.json.called).to.be.false;
        done();
      });

      modelHandler.handleFind(req, res, next);
    });
  });

  describe('handleFindById', function() {
    it('should handle findById request successfully', function(done) {
      const mockItem = { id: 1, name: 'Test' };
      const mockModel = {
        name: 'TestModel',
        findOne: sandbox.stub().resolves(mockItem),
        primaryKeyAttribute: 'id',
        primaryKeyAttributes: ['id'],
        rawAttributes: {
          id: { type: { key: 'INTEGER' }, primaryKey: true }
        },
        options: { needsAcl: false }
      };

      const server = createMockServer();
      const sequelize = createMockSequelize(mockModel);
      const modelHandler = ModelHandler({ server, sequelize });

      const req = {
        params: { __id: '1' },
        query: {},
        locals: {
          __entity: {
            modelName: 'testmodel'
          }
        }
      };

      const res = {
        json: sandbox.spy(),
        setHeader: sandbox.spy()
      };

      const next = sandbox.spy(function(err) {
        if (err) {
          done(err);
        } else {
          expect(res.json.calledOnce).to.be.true;
          const responseData = res.json.firstCall.args[0];
          expect(responseData.id).to.equal(1);
          done();
        }
      });

      modelHandler.handleFindById(req, res, next);
    });

    it('should handle error when record not found', function(done) {
      const mockModel = {
        name: 'TestModel',
        findOne: sandbox.stub().resolves(null),
        primaryKeyAttribute: 'id',
        primaryKeyAttributes: ['id'],
        rawAttributes: {
          id: { type: { key: 'INTEGER' }, primaryKey: true }
        },
        options: { needsAcl: false }
      };

      const server = createMockServer();
      const sequelize = createMockSequelize(mockModel);
      const modelHandler = ModelHandler({ server, sequelize });

      const req = {
        params: { __id: '999' },
        query: {},
        locals: {
          __entity: {
            modelName: 'testmodel'
          }
        }
      };

      const res = {
        json: sandbox.spy()
      };

      const next = sandbox.spy(function(err) {
        // NotFoundError has a status property, so it passes through without being wrapped
        expect(err.status).to.equal(404);
        done();
      });

      modelHandler.handleFindById(req, res, next);
    });
  });

  describe('handleCount', function() {
    it('should handle count request successfully', function(done) {
      const mockModel = {
        name: 'TestModel',
        count: sandbox.stub().resolves(42),
        rawAttributes: { id: {} },
        options: { needsAcl: false }
      };

      const server = createMockServer();
      const sequelize = createMockSequelize(mockModel);
      const modelHandler = ModelHandler({ server, sequelize });

      const req = {
        query: {},
        params: {},
        locals: {
          __entity: {
            modelName: 'testmodel'
          }
        }
      };

      const res = {
        json: sandbox.spy(),
        setHeader: sandbox.spy()
      };

      const next = sandbox.spy(function(err) {
        if (err) {
          done(err);
        } else {
          expect(res.json.calledOnce).to.be.true;
          const responseData = res.json.firstCall.args[0];
          expect(responseData.count).to.equal(42);
          done();
        }
      });

      modelHandler.handleCount(req, res, next);
    });
  });

  describe('handleInsert', function() {
    it('should handle insert request successfully', function(done) {
      const mockCreatedItem = { id: 1, name: 'New Item' };
      const mockModel = {
        name: 'TestModel',
        create: sandbox.stub().resolves(mockCreatedItem),
        rawAttributes: { id: {}, name: {} },
        options: { needsAcl: false, timestamps: false },
        getUserAudit: sandbox.stub().returns({})
      };

      const server = createMockServer();
      const sequelize = createMockSequelize(mockModel);
      const modelHandler = ModelHandler({ server, sequelize });

      const req = {
        body: { name: 'New Item' },
        params: {},
        locals: {
          __entity: {
            modelName: 'testmodel'
          }
        }
      };

      const res = {
        json: sandbox.spy(),
        setHeader: sandbox.spy()
      };

      const next = sandbox.spy(function(err) {
        if (err) {
          done(err);
        } else {
          expect(res.json.calledOnce).to.be.true;
          const responseData = res.json.firstCall.args[0];
          expect(responseData.id).to.equal(1);
          done();
        }
      });

      modelHandler.handleInsert(req, res, next);
    });

    it('should set Ignored-Attributes header when fields are skipped', function(done) {
      const mockCreatedItem = { id: 1, name: 'New Item' };
      const mockModel = {
        name: 'TestModel',
        create: sandbox.stub().resolves(mockCreatedItem),
        rawAttributes: { id: {}, name: {} },
        options: { needsAcl: false, timestamps: false },
        getUserAudit: sandbox.stub().returns({})
      };

      const server = createMockServer();
      const sequelize = createMockSequelize(mockModel);
      const modelHandler = ModelHandler({ server, sequelize });

      const req = {
        body: { name: 'New Item', invalidField: 'should be skipped' },
        params: {},
        locals: {
          __entity: {
            modelName: 'testmodel'
          }
        }
      };

      const res = {
        json: sandbox.spy(),
        setHeader: sandbox.spy()
      };

      const next = sandbox.spy(function(err) {
        if (err) {
          done(err);
        } else {
          expect(res.setHeader.calledWith('Ignored-Attributes', 'invalidField')).to.be.true;
          done();
        }
      });

      modelHandler.handleInsert(req, res, next);
    });
  });

  describe('handleDelete', function() {
    it('should handle delete request successfully', function(done) {
      const mockModel = {
        name: 'TestModel',
        destroy: sandbox.stub().resolves(3),
        rawAttributes: { id: {} },
        options: { needsAcl: false }
      };

      const server = createMockServer();
      const sequelize = createMockSequelize(mockModel);
      const modelHandler = ModelHandler({ server, sequelize });

      const req = {
        query: {},
        params: {},
        locals: {
          __entity: {
            modelName: 'testmodel'
          }
        }
      };

      const res = {
        json: sandbox.spy(),
        setHeader: sandbox.spy()
      };

      const next = sandbox.spy(function(err) {
        if (err) {
          done(err);
        } else {
          expect(res.json.calledOnce).to.be.true;
          done();
        }
      });

      modelHandler.handleDelete(req, res, next);
    });
  });

  describe('handleDeleteById', function() {
    it('should handle deleteById request successfully', function(done) {
      const mockModel = {
        name: 'TestModel',
        destroy: sandbox.stub().resolves(1),
        primaryKeyAttribute: 'id',
        primaryKeyAttributes: ['id'],
        rawAttributes: {
          id: { type: { key: 'INTEGER' }, primaryKey: true }
        },
        options: { needsAcl: false }
      };

      const server = createMockServer();
      const sequelize = createMockSequelize(mockModel);
      const modelHandler = ModelHandler({ server, sequelize });

      const req = {
        params: { __id: '1' },
        locals: {
          __entity: {
            modelName: 'testmodel'
          }
        }
      };

      const res = {
        json: sandbox.spy(),
        setHeader: sandbox.spy()
      };

      const next = sandbox.spy(function(err) {
        if (err) {
          done(err);
        } else {
          expect(res.json.calledOnce).to.be.true;
          done();
        }
      });

      modelHandler.handleDeleteById(req, res, next);
    });
  });

  describe('handleDeleteBatch', function() {
    it('should handle deleteBatch request successfully', function(done) {
      const mockModel = {
        name: 'TestModel',
        destroy: sandbox.stub().resolves(3),
        primaryKeyAttribute: 'id',
        primaryKeyAttributes: ['id'],
        rawAttributes: {
          id: { type: { key: 'INTEGER' }, primaryKey: true }
        },
        options: { needsAcl: false }
      };

      const server = createMockServer();
      const sequelize = createMockSequelize(mockModel);
      const mockSequelizeWithOp = {
        model: sequelize.model,
        Sequelize: {
          Op: {
            in: Symbol('in')
          }
        }
      };
      const modelHandler = ModelHandler({ server, sequelize: mockSequelizeWithOp });

      const req = {
        body: { id: ['1', '2', '3'] },
        locals: {
          __entity: {
            modelName: 'testmodel'
          }
        }
      };

      const res = {
        json: sandbox.spy(),
        setHeader: sandbox.spy()
      };

      const next = sandbox.spy(function(err) {
        if (err) {
          done(err);
        } else {
          expect(res.json.calledOnce).to.be.true;
          done();
        }
      });

      modelHandler.handleDeleteBatch(req, res, next);
    });
  });

  describe('handleUpdateById', function() {
    it('should handle updateById request successfully', function(done) {
      const mockUpdatedItem = { id: 1, name: 'Updated' };
      const mockRecord = {
        update: sandbox.stub().resolves(mockUpdatedItem)
      };

      const mockModel = {
        name: 'TestModel',
        findOne: sandbox.stub().resolves(mockRecord),
        primaryKeyAttribute: 'id',
        primaryKeyAttributes: ['id'],
        rawAttributes: {
          id: { type: { key: 'INTEGER' }, primaryKey: true },
          name: {}
        },
        options: { needsAcl: false, timestamps: false },
        getUserAudit: sandbox.stub().returns({})
      };

      const server = createMockServer();
      const sequelize = createMockSequelize(mockModel);
      const modelHandler = ModelHandler({ server, sequelize });

      const req = {
        params: { __id: '1' },
        body: { name: 'Updated' },
        locals: {
          __entity: {
            modelName: 'testmodel'
          }
        }
      };

      const res = {
        json: sandbox.spy(),
        setHeader: sandbox.spy()
      };

      const next = sandbox.spy(function(err) {
        if (err) {
          done(err);
        } else {
          expect(res.json.calledOnce).to.be.true;
          const responseData = res.json.firstCall.args[0];
          expect(responseData.name).to.equal('Updated');
          done();
        }
      });

      modelHandler.handleUpdateById(req, res, next);
    });
  });

  describe('getEntity', function() {
    it('should extract entity from req.locals', function() {
      const mockModel = {
        name: 'TestModel'
      };

      const server = createMockServer();
      const sequelize = createMockSequelize(mockModel);
      const modelHandler = ModelHandler({ server, sequelize });

      const req = {
        locals: {
          __entity: {
            modelName: 'testmodel',
            routes: {
              find: {
                fx: function() {},
                responder: function() {}
              }
            }
          }
        }
      };

      const entity = modelHandler.getEntity(req, 'find');

      expect(entity.modelName).to.equal('testmodel');
      expect(entity.model).to.equal(mockModel);
      expect(entity.fx).to.be.a('function');
      expect(entity.responder).to.be.a('function');
    });

    it('should handle missing route configuration', function() {
      const mockModel = {
        name: 'TestModel'
      };

      const server = createMockServer();
      const sequelize = createMockSequelize(mockModel);
      const modelHandler = ModelHandler({ server, sequelize });

      const req = {
        locals: {
          __entity: {
            modelName: 'testmodel'
          }
        }
      };

      const entity = modelHandler.getEntity(req, 'find');

      expect(entity.modelName).to.equal('testmodel');
      expect(entity.model).to.equal(mockModel);
      expect(entity.fx).to.be.undefined;
      expect(entity.responder).to.be.undefined;
    });
  });

  after(function(done) {
    done();
  });
});
