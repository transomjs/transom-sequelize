'use strict';
const sinon = require('sinon');
const ModelFunctions = require('../lib/modelFunctions');
const restifyErrors = require('restify-errors');

describe('modelFunctions', function() {
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

  describe('modelFind', function() {
    it('should find all records without ACL', async function() {
      const mockItems = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' }
      ];

      const mockModel = {
        findAll: sandbox.stub().resolves(mockItems),
        rawAttributes: { id: {}, name: {} },
        options: { needsAcl: false }
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = { query: {}, params: {} };
      const server = {};

      const result = await modelFunctions.modelFind(server, entity, req);

      expect(result).to.deep.equal({ items: mockItems });
      expect(mockModel.findAll.calledOnce).to.be.true;
    });

    it('should apply select operator to limit returned fields', async function() {
      const mockItems = [{ id: 1, name: 'Item 1' }];

      const mockModel = {
        findAll: sandbox.stub().resolves(mockItems),
        rawAttributes: { id: {}, name: {}, secret: {} },
        options: { needsAcl: false }
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = { query: { _select: 'id,name' }, params: {} };
      const server = {};

      const result = await modelFunctions.modelFind(server, entity, req);

      expect(result.items).to.deep.equal(mockItems);
      const callArgs = mockModel.findAll.firstCall.args[0];
      expect(callArgs.attributes).to.deep.equal(['id', 'name']);
    });

    it('should reject on error during query building', async function() {
      const mockModel = {
        findAll: sandbox.stub(),
        rawAttributes: { id: {} },
        options: { needsAcl: false }
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      // Invalid query with non-existent field
      const req = { query: { invalidField: 'value' }, params: {} };
      const server = {};

      try {
        await modelFunctions.modelFind(server, entity, req);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err).to.exist;
      }
    });
  });

  describe('modelFindById', function() {
    it('should find a record by ID', async function() {
      const mockItem = { id: 1, name: 'Item 1' };

      const mockModel = {
        findOne: sandbox.stub().resolves(mockItem),
        primaryKeyAttribute: 'id',
        primaryKeyAttributes: ['id'],
        rawAttributes: {
          id: { type: { key: 'INTEGER' }, primaryKey: true },
          name: {}
        },
        options: { needsAcl: false }
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = { params: { __id: '1' }, query: {} };
      const server = {};

      const result = await modelFunctions.modelFindById(server, entity, req);

      expect(result).to.deep.equal(mockItem);
      expect(mockModel.findOne.calledOnce).to.be.true;
    });

    it('should throw NotFoundError when record does not exist', async function() {
      const mockModel = {
        findOne: sandbox.stub().resolves(null),
        primaryKeyAttribute: 'id',
        primaryKeyAttributes: ['id'],
        rawAttributes: {
          id: { type: { key: 'INTEGER' }, primaryKey: true }
        },
        options: { needsAcl: false }
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = { params: { __id: '999' }, query: {} };
      const server = {};

      try {
        await modelFunctions.modelFindById(server, entity, req);
        expect.fail('Should have thrown NotFoundError');
      } catch (err) {
        expect(err).to.be.instanceOf(restifyErrors.NotFoundError);
        expect(err.message).to.equal('Not Found');
      }
    });

    it('should apply select operator for findById', async function() {
      const mockItem = { id: 1, name: 'Item 1' };

      const mockModel = {
        findOne: sandbox.stub().resolves(mockItem),
        primaryKeyAttribute: 'id',
        primaryKeyAttributes: ['id'],
        rawAttributes: {
          id: { type: { key: 'INTEGER' }, primaryKey: true },
          name: {},
          secret: {}
        },
        options: { needsAcl: false }
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = { params: { __id: '1' }, query: { _select: 'id,name' } };
      const server = {};

      await modelFunctions.modelFindById(server, entity, req);

      const callArgs = mockModel.findOne.firstCall.args[0];
      expect(callArgs.attributes).to.deep.equal(['id', 'name']);
    });
  });

  describe('modelCount', function() {
    it('should count records', async function() {
      const mockModel = {
        count: sandbox.stub().resolves(42),
        rawAttributes: { id: {}, name: {} },
        options: { needsAcl: false }
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = { query: {}, params: {} };
      const server = {};

      const result = await modelFunctions.modelCount(server, entity, req);

      expect(result).to.deep.equal({ count: 42 });
      expect(mockModel.count.calledOnce).to.be.true;
    });

    it('should reject on error during count', async function() {
      const mockModel = {
        count: sandbox.stub().rejects(new Error('Database error')),
        rawAttributes: { id: {} },
        options: { needsAcl: false }
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = { query: {}, params: {} };
      const server = {};

      try {
        await modelFunctions.modelCount(server, entity, req);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.equal('Database error');
      }
    });
  });

  describe('modelInsert', function() {
    it('should insert a new record', async function() {
      const mockCreatedItem = { id: 1, name: 'New Item' };

      const mockModel = {
        create: sandbox.stub().resolves(mockCreatedItem),
        rawAttributes: { id: {}, name: {} },
        options: { needsAcl: false, timestamps: false },
        getUserAudit: sandbox.stub().returns({})
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = { body: { name: 'New Item' }, locals: {} };
      const server = {};

      const result = await modelFunctions.modelInsert(server, entity, req);

      expect(result.item).to.deep.equal(mockCreatedItem);
      expect(result.skippedFields).to.be.an('array');
      expect(mockModel.create.calledOnce).to.be.true;
      expect(mockModel.create.firstCall.args[0]).to.deep.equal({ name: 'New Item' });
    });

    it('should skip invalid fields not in model', async function() {
      const mockCreatedItem = { id: 1, name: 'New Item' };

      const mockModel = {
        create: sandbox.stub().resolves(mockCreatedItem),
        rawAttributes: { id: {}, name: {} },
        options: { needsAcl: false, timestamps: false },
        getUserAudit: sandbox.stub().returns({})
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = {
        body: { name: 'New Item', invalidField: 'should be skipped' },
        locals: {}
      };
      const server = {};

      const result = await modelFunctions.modelInsert(server, entity, req);

      expect(result.skippedFields).to.include('invalidField');
      expect(mockModel.create.firstCall.args[0]).to.not.have.property('invalidField');
    });

    it('should use nextVal function if available', async function() {
      const mockCreatedItem = { id: 100, name: 'New Item' };

      const mockModel = {
        create: sandbox.stub().resolves(mockCreatedItem),
        nextVal: sandbox.stub().resolves({ id: 100 }),
        rawAttributes: { id: {}, name: {} },
        options: { needsAcl: false, timestamps: false },
        getUserAudit: sandbox.stub().returns({})
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = { body: { name: 'New Item' }, locals: {} };
      const server = {};

      const result = await modelFunctions.modelInsert(server, entity, req);

      expect(mockModel.nextVal.calledOnce).to.be.true;
      expect(mockModel.create.firstCall.args[0]).to.deep.equal({ id: 100, name: 'New Item' });
    });

    it('should apply audit fields from getUserAudit', async function() {
      const mockCreatedItem = { id: 1, name: 'New Item', createdBy: 'test@example.com' };

      const mockModel = {
        create: sandbox.stub().resolves(mockCreatedItem),
        rawAttributes: { id: {}, name: {}, createdBy: {} },
        options: { needsAcl: false, timestamps: true, createdBy: 'createdBy' },
        getUserAudit: sandbox.stub().returns({ createdBy: 'test@example.com', updatedBy: 'test@example.com' })
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = {
        body: { name: 'New Item' },
        locals: { user: { email: 'test@example.com' } }
      };
      const server = {};

      await modelFunctions.modelInsert(server, entity, req);

      expect(mockModel.getUserAudit.calledOnce).to.be.true;
      const createArgs = mockModel.create.firstCall.args[0];
      expect(createArgs.createdBy).to.equal('test@example.com');
    });
  });

  describe('modelDelete', function() {
    it('should delete records matching query', async function() {
      const mockModel = {
        destroy: sandbox.stub().resolves(3),
        rawAttributes: { id: {}, name: {} },
        options: { needsAcl: false }
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = { query: {}, params: {} };
      const server = {};

      const result = await modelFunctions.modelDelete(server, entity, req);

      expect(result.data.deleted).to.equal(3);
      expect(mockModel.destroy.calledOnce).to.be.true;
    });

    it('should reject on error during delete', async function() {
      const mockModel = {
        destroy: sandbox.stub().rejects(new Error('Delete failed')),
        rawAttributes: { id: {} },
        options: { needsAcl: false }
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = { query: {}, params: {} };
      const server = {};

      try {
        await modelFunctions.modelDelete(server, entity, req);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.equal('Delete failed');
      }
    });
  });

  describe('modelDeleteById', function() {
    it('should delete a record by ID', async function() {
      const mockModel = {
        destroy: sandbox.stub().resolves(1),
        primaryKeyAttribute: 'id',
        primaryKeyAttributes: ['id'],
        rawAttributes: {
          id: { type: { key: 'INTEGER' }, primaryKey: true }
        },
        options: { needsAcl: false }
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = { params: { __id: '1' } };
      const server = {};

      const result = await modelFunctions.modelDeleteById(server, entity, req);

      expect(result.data.deleted).to.equal(1);
      expect(mockModel.destroy.calledOnce).to.be.true;
      const callArgs = mockModel.destroy.firstCall.args[0];
      expect(callArgs.where.id).to.equal(1);
    });
  });

  describe('modelDeleteBatch', function() {
    it('should delete multiple records by ID list', async function() {
      const mockModel = {
        destroy: sandbox.stub().resolves(3),
        primaryKeyAttribute: 'id',
        primaryKeyAttributes: ['id'],
        rawAttributes: {
          id: { type: { key: 'INTEGER' }, primaryKey: true }
        },
        options: { needsAcl: false }
      };

      const mockSequelize = {
        Sequelize: {
          Op: {
            in: Symbol('in')
          }
        }
      };
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = {
        body: { id: ['1', '2', '3'] }
      };
      const server = {};

      const result = await modelFunctions.modelDeleteBatch(server, entity, req);

      expect(result.data.deleted).to.equal(3);
      expect(mockModel.destroy.calledOnce).to.be.true;
    });

    it('should handle single string value for batch delete', async function() {
      const mockModel = {
        destroy: sandbox.stub().resolves(1),
        primaryKeyAttribute: 'id',
        primaryKeyAttributes: ['id'],
        rawAttributes: {
          id: { type: { key: 'INTEGER' }, primaryKey: true }
        },
        options: { needsAcl: false }
      };

      const mockSequelize = {
        Sequelize: {
          Op: {
            in: Symbol('in')
          }
        }
      };
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = {
        body: { id: '1' }
      };
      const server = {};

      const result = await modelFunctions.modelDeleteBatch(server, entity, req);

      expect(result.data.deleted).to.equal(1);
    });

    it('should throw error if PK field missing from body', async function() {
      const mockModel = {
        destroy: sandbox.stub(),
        primaryKeyAttribute: 'id',
        primaryKeyAttributes: ['id'],
        rawAttributes: {
          id: { type: { key: 'INTEGER' }, primaryKey: true }
        },
        options: { needsAcl: false }
      };

      const mockSequelize = {
        Sequelize: { Op: { in: Symbol('in') } }
      };
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = { body: {} };
      const server = {};

      try {
        await modelFunctions.modelDeleteBatch(server, entity, req);
        expect.fail('Should have thrown an error');
      } catch (err) {
        expect(err.message).to.include('must contain a "id" field');
      }
    });
  });

  describe('modelUpdateById', function() {
    it('should update a record by ID', async function() {
      const mockUpdatedItem = { id: 1, name: 'Updated Item' };
      const mockRecord = {
        update: sandbox.stub().resolves(mockUpdatedItem)
      };

      const mockModel = {
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

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = {
        params: { __id: '1' },
        body: { name: 'Updated Item' },
        locals: {}
      };
      const server = {};

      const result = await modelFunctions.modelUpdateById(server, entity, req);

      expect(result).to.deep.equal(mockUpdatedItem);
      expect(mockModel.findOne.calledOnce).to.be.true;
      expect(mockRecord.update.calledOnce).to.be.true;
    });

    it('should throw NotFoundError when updating non-existent record', async function() {
      const mockModel = {
        findOne: sandbox.stub().resolves(null),
        primaryKeyAttribute: 'id',
        primaryKeyAttributes: ['id'],
        rawAttributes: {
          id: { type: { key: 'INTEGER' }, primaryKey: true }
        },
        options: { needsAcl: false, timestamps: false },
        getUserAudit: sandbox.stub().returns({})
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = {
        params: { __id: '999' },
        body: { name: 'Updated' },
        locals: {}
      };
      const server = {};

      try {
        await modelFunctions.modelUpdateById(server, entity, req);
        expect.fail('Should have thrown NotFoundError');
      } catch (err) {
        expect(err).to.be.instanceOf(restifyErrors.NotFoundError);
      }
    });

    it('should apply audit fields on update', async function() {
      const mockRecord = {
        update: sandbox.stub().resolves({ id: 1, name: 'Updated', updatedBy: 'test@example.com' })
      };

      const mockModel = {
        findOne: sandbox.stub().resolves(mockRecord),
        primaryKeyAttribute: 'id',
        primaryKeyAttributes: ['id'],
        rawAttributes: {
          id: { type: { key: 'INTEGER' }, primaryKey: true },
          name: {},
          updatedBy: {}
        },
        options: { needsAcl: false, timestamps: true, updatedBy: 'updatedBy' },
        getUserAudit: sandbox.stub().returns({ updatedBy: 'test@example.com' })
      };

      const mockSequelize = {};
      const modelFunctions = ModelFunctions({ sequelize: mockSequelize });

      const entity = { model: mockModel, modelName: 'TestModel' };
      const req = {
        params: { __id: '1' },
        body: { name: 'Updated' },
        locals: { user: { email: 'test@example.com' } }
      };
      const server = {};

      await modelFunctions.modelUpdateById(server, entity, req);

      expect(mockModel.getUserAudit.calledWith(req, false)).to.be.true;
      const updateArgs = mockRecord.update.firstCall.args[0];
      expect(updateArgs.updatedBy).to.equal('test@example.com');
    });
  });

  after(function(done) {
    done();
  });
});
