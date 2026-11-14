'use strict';
const { DataTypes, Model, Sequelize } = require('sequelize');
const OpenApiMeta = require('../lib/openApiMeta');

describe('openApiMeta', function () {
  let expect;
  let sequelize;

  before(async function () {
    expect = (await import('chai')).expect;
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
    class person extends Model {}
    person.init(
      {
        // Generated metadata camelCases attributes and keeps the column name in `field`.
        id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
        fullName: { type: DataTypes.STRING, allowNull: false, comment: 'Full name', field: 'full_name' },
        isActive: { type: DataTypes.BOOLEAN, field: 'is_active' },
        secretValue: { type: DataTypes.STRING, field: 'secret_value' },
        hiddenValue: { type: DataTypes.STRING, field: 'hidden_value' },
      },
      { sequelize, modelName: 'person', tableName: 'person', timestamps: false },
    );
  });

  after(async function () {
    await sequelize.close();
  });

  function routeFor(entityObj, routes) {
    return {
      entity: 'person',
      entityObj: entityObj || {},
      modelName: 'person',
      sequelize,
      versions: null,
      routes: routes || {},
    };
  }

  describe('instanceTypes', function () {
    const meta = OpenApiMeta({}, {});
    function Named(name) {
      const fn = function () {};
      Object.defineProperty(fn, 'name', { value: name });
      return new fn();
    }

    it('maps type names to OpenAPI schemas', function () {
      expect(meta.instanceTypes(Named('BOOLEAN'))).to.deep.equal({ type: 'boolean' });
      expect(meta.instanceTypes(Named('DATE'))).to.deep.equal({ type: 'string', format: 'date' });
      expect(meta.instanceTypes(Named('DateTime'))).to.deep.equal({ type: 'string', format: 'date-time' });
      expect(meta.instanceTypes(Named('INTEGER'))).to.deep.equal({ type: 'integer', format: 'int32' });
      expect(meta.instanceTypes(Named('Number'))).to.deep.equal({ type: 'integer', format: 'int32' });
      expect(meta.instanceTypes(Named('int32'))).to.deep.equal({ type: 'integer', format: 'int32' });
      expect(meta.instanceTypes(Named('int64'))).to.deep.equal({ type: 'integer', format: 'int64' });
      expect(meta.instanceTypes(Named('FLOAT'))).to.deep.equal({ type: 'number', format: 'float' });
      expect(meta.instanceTypes(Named('DOUBLE'))).to.deep.equal({ type: 'number', format: 'double' });
      expect(meta.instanceTypes(Named('STRING'))).to.deep.equal({ type: 'string' });
      expect(meta.instanceTypes(Named('ObjectId'))).to.deep.equal({ type: 'string' });
      expect(meta.instanceTypes(Named('JSON'))).to.deep.equal({ type: 'string' });
      // Primitives read their wrapper's constructor.
      expect(meta.instanceTypes(true)).to.deep.equal({ type: 'boolean' });
      expect(meta.instanceTypes(7)).to.deep.equal({ type: 'integer', format: 'int32' });
    });

    it('throws for a value without a constructor name, as before', function () {
      expect(() => meta.instanceTypes(null)).to.throw(TypeError, /reading 'constructor'/);
      expect(() => meta.instanceTypes(undefined)).to.throw(TypeError, /reading 'constructor'/);
      expect(() => meta.instanceTypes(Object.create(null))).to.throw(TypeError, /toLowerCase/);
    });
  });

  describe('endpoint builders', function () {
    const security = { bearerAuth: [] };
    let meta;

    before(function () {
      meta = OpenApiMeta({}, { ignore: ['secret_value', 'person.hidden_value'], security });
    });

    // Every attribute is listed, named as the API uses it (fullName, not full_name). The
    // ignore list matches either name: 'secret_value' and 'person.hidden_value' are columns.
    it('find lists every attribute as a query parameter, minus ignored ones', function () {
      const result = meta.findMeta(routeFor({ meta: { summary: 'People', description: 'All the people' } }), 'person').call({ method: 'get' });
      expect(result.summary).to.equal('People');
      expect(result.description).to.equal('All the people');
      expect(result.operationId).to.equal('find-person');
      expect(result.tags).to.deep.equal(['person']);
      expect(result.security).to.deep.equal(security);
      expect(result.requestBody).to.equal(undefined);
      const names = result.parameters.map((p) => `${p.in}:${p.name}`);
      expect(names).to.deep.equal(['query:_select', 'query:_skip', 'query:_limit', 'query:_sort', 'query:id', 'query:fullName', 'query:isActive']);
      const name = result.parameters.find((p) => p.name === 'fullName');
      expect(name).to.deep.equal({ name: 'fullName', in: 'query', description: 'Full name', required: false, schema: { type: 'string' } });
      expect(result.parameters.find((p) => p.name === 'isActive').description).to.equal('isActive comment not provided');
      expect(result.parameters.find((p) => p.name === 'id').schema).to.deep.equal({ type: 'integer', format: 'int32' });
      // A column without an explicit allowNull counts as required (generated metadata
      // always sets allowNull, so this only affects hand-written attributes).
      expect(result.schemas['person-single'].required).to.deep.equal(['id', 'fullName', 'isActive']);
      expect(result.schemas['person-single'].properties.isActive).to.deep.equal({ type: 'boolean' });
      expect(result.schemas.error.required).to.deep.equal(['code', 'message']);
      expect(result.schemas.delete.required).to.deep.equal(['deleted']);
      expect(result.responses['200'].content['application/json'].schema.$ref).to.equal('#/components/schemas/person-list');
      expect(result.responses.default.description).to.equal('unexpected error');
    });

    it('route-level meta wins over the table meta; defaults otherwise', function () {
      const route = routeFor({ meta: { summary: 'Table summary' } }, { findById: { meta: { summary: 'Fetch one', description: 'By id' } } });
      const byId = meta.findByIdMeta(route, 'person').call({ method: 'get' });
      expect(byId.summary).to.equal('Fetch one');
      expect(byId.description).to.equal('By id');

      const count = meta.findCountMeta(routeFor(), 'person').call({ method: 'get' });
      expect(count.summary).to.equal('Execute get request with person.');
      expect(count.description).to.equal(null);

      const ignoredMeta = meta.findCountMeta(routeFor({}, { findCount: { meta: 'not an object' } }), 'person').call({ method: 'get' });
      expect(ignoredMeta.summary).to.equal('Execute get request with person.');
      const badTypes = meta.findCountMeta(routeFor({}, { findCount: { meta: { summary: 1 } } }), 'person').call({ method: 'get' });
      expect(badTypes.summary).to.equal('Execute get request with person.');
    });

    it('findById and the binary route take path parameters and skip the attributes', function () {
      const byId = meta.findByIdMeta(routeFor(), 'person').call({ method: 'get' });
      expect(byId.parameters.map((p) => `${p.in}:${p.name}:${p.required}`)).to.deep.equal([':__id', '_select'].map((n, i) => (i === 0 ? `path:${n}:true` : `query:${n}:false`)));
      expect(byId.schemas['person-single']).to.equal(undefined);

      const binary = meta.findBinaryMeta(routeFor(), 'person').call({ method: 'get' });
      expect(binary.operationId).to.equal('findpersonBinary-person');
      expect(binary.parameters.filter((p) => p.in === 'path').map((p) => p.name)).to.deep.equal([':__id', ':__attribute', ':__filename']);
      expect(binary.responses['200'].content['*'].schema).to.deep.equal({ type: 'string', format: 'binary' });
    });

    it('insert and update describe a request body', function () {
      const insert = meta.insertMeta(routeFor(), 'person').call({ method: 'post' });
      expect(insert.requestBody.description).to.equal('Insert a person.');
      expect(insert.requestBody.required).to.equal(true);
      expect(Object.keys(insert.requestBody.content)).to.deep.equal(['application/json', 'application/x-www-form-urlencoded']);

      const update = meta.updateByIdMeta(routeFor(), 'person').call({ method: 'put' });
      expect(update.requestBody.description).to.equal('Update a person.');
      const patch = meta.updateByIdMeta(routeFor(), 'person').call({ method: 'patch' });
      expect(patch.requestBody.description).to.equal('Update a person.');
    });

    it('describes the delete routes', function () {
      const del = meta.deleteMeta(routeFor(), 'person').call({ method: 'delete' });
      expect(del.operationId).to.equal('delete-person');
      expect(del.parameters.map((p) => p.name)).to.include('fullName');

      const batch = meta.deleteBatchMeta(routeFor(), 'person').call({ method: 'delete' });
      expect(batch.responses['200'].description).to.equal('An Array of person Ids');

      const byId = meta.deleteByIdMeta(routeFor(), 'person').call({ method: 'delete' });
      expect(byId.responses['200'].content['application/json'].schema.$ref).to.equal('#/components/schemas/delete');
    });

    it('returns bare metadata when the model is missing', function () {
      const route = Object.assign(routeFor(), { modelName: 'nobody', modelPrefix: 'x_' });
      const result = meta.findMeta(route, 'person').call({ method: 'get' });
      expect(result.schemas).to.deep.equal({});
      expect(result.responses).to.deep.equal({});
      expect(result.parameters.map((p) => p.name)).to.deep.equal(['_select', '_skip', '_limit', '_sort']);
    });

    it('endpointMeta accepts a single ignored attribute and empty parameter lists', function () {
      const fn = meta.endpointMeta(routeFor(), 'find', null, undefined, 'full_name', { description: 'ok' });
      const result = fn.call({ method: 'get' });
      expect(result.parameters.map((p) => p.name)).to.deep.equal(['id', 'isActive']);
      expect(result.responses['200']).to.deep.equal({ description: 'ok' });

      const noIgnore = meta.endpointMeta(routeFor(), 'find', {}, {}, null, { description: 'ok' }).call({ method: 'get' });
      expect(noIgnore.parameters.map((p) => p.name)).to.deep.equal(['id', 'fullName', 'isActive']);
    });

    it('works with no options', function () {
      const plain = OpenApiMeta({}, {});
      const result = plain.findCountMeta(routeFor(), 'person').call({ method: 'get' });
      expect(result.security).to.deep.equal({});
      expect(result.parameters.map((p) => p.name)).to.deep.equal(['id', 'fullName', 'isActive', 'secretValue', 'hiddenValue']);
      expect(plain.getSelectParameter('person').description).to.match(/comma delimited list of person attributes/);
    });

    it('matches ignore entries by attribute name too', function () {
      const byAttribute = OpenApiMeta({}, { ignore: ['secretValue', 'person.hiddenValue', 'other.fullName'] });
      const result = byAttribute.findMeta(routeFor(), 'person').call({ method: 'get' });
      expect(result.parameters.filter((p) => p.in === 'query' && !p.name.startsWith('_')).map((p) => p.name)).to.deep.equal(['id', 'fullName', 'isActive']);
    });
  });
});
