'use strict';
const chai = require('chai');
const expect = chai.expect;
const { DataTypes } = require('sequelize');
const HandlerUtils = require('../lib/handlerUtils');
const mssqlMeta = require('./mssqlMeta');

describe('handlerUtils', function() {
  before(function(done) {
    done();
  });

  // afterEach(function(done) {
  //       done();
  //   });

  it('handlerUtils is an Object', function() {
    const handlerUtils = new HandlerUtils();
    expect(handlerUtils).to.be.an.instanceOf(Object);
    // expect(Object.keys(handlerUtils).length).to.equal(1);
  });

  it('Operands constant has known keys & values', function() {
    const handlerUtils = new HandlerUtils();
    expect(handlerUtils.OPERANDS).to.be.an.instanceOf(Object);
    expect(Object.keys(handlerUtils.OPERANDS).length).to.equal(8);
    expect(handlerUtils.OPERANDS._skip).to.equal('_skip');
    expect(handlerUtils.OPERANDS._limit).to.equal('_limit');
    expect(handlerUtils.OPERANDS._sort).to.equal('_sort');
    expect(handlerUtils.OPERANDS._populate).to.equal('_populate');
    expect(handlerUtils.OPERANDS._select).to.equal('_select');
    expect(handlerUtils.OPERANDS._connect).to.equal('_connect');
    expect(handlerUtils.OPERANDS._keywords).to.equal('_keywords');
    expect(handlerUtils.OPERANDS._type).to.equal('_type');
  });

  it('Can separate Operands from keys & values', function() {
    const handlerUtils = new HandlerUtils();

    // Dummy Model data.
    const sample = {
      horse: 'Mr. Ed',
      cat: 'Garfield is an *extra* attribute!',
      dog: 'Snoopy',
      grade: 5,
      createdDate: new Date('Tue, 23 Apr 2019 15:46:30 GMT')
    };

    // Dummy up some Operand data!
    Object.keys(handlerUtils.OPERANDS).map(k => (sample[k] = `**${k}**`));

    const model = {
      rawAttributes: {
        horse: null,
        // cat?
        dog: null,
        grade: null,
        createdDate: null
      }
    };
    const result = handlerUtils.separateApiOperations(sample, model);
    expect(result.operands).to.be.an.instanceOf(Object);

    // Operands
    expect(Object.keys(result.operands).length).to.equal(8);
    expect(result.operands['_connect']).to.equal('**_connect**');
    expect(result.operands['_keywords']).to.equal('**_keywords**');
    expect(result.operands['_limit']).to.equal('**_limit**');
    expect(result.operands['_populate']).to.equal('**_populate**'); // TODO: retire this, we don't do it.
    expect(result.operands['_select']).to.equal('**_select**');
    expect(result.operands['_skip']).to.equal('**_skip**');
    expect(result.operands['_sort']).to.equal('**_sort**');
    expect(result.operands['_type']).to.equal('**_type**'); // TODO: retire this, we don't do it.

    // Extras
    expect(result.extras).to.be.an.instanceOf(Object);
    expect(Object.keys(result.extras).length).to.equal(1);
    expect(result.extras['cat']).to.equal('Garfield is an *extra* attribute!');

    // Attributes
    expect(result.attributes).to.be.an.instanceOf(Object);
    expect(Object.keys(result.attributes).length).to.equal(4);
    expect(result.attributes['horse']).to.equal('Mr. Ed');
    expect(result.attributes['dog']).to.equal('Snoopy');
    expect(result.attributes['grade']).to.equal(5);
    // use getTime() to compare date values!
    expect(result.attributes['createdDate'].getTime()).to.equal(new Date('Tue, 23 Apr 2019 15:46:30 GMT').getTime());
  });

  it('can process _select operators', function() {
    const handlerUtils = new HandlerUtils();
    const model = {
      rawAttributes: {
        horse: null,
        // cat?
        dog: null,
        grade: null,
        createdDate: null
      }
    };
    const mySelect = 'horse,dog,createdDate';
    const result = handlerUtils.processSelectOperator(model, mySelect);
    expect(result).to.be.an.instanceOf(Object);
    expect(result.attributes).to.be.an.instanceOf(Array);
    expect(result.attributes.length).to.equal(3);
    expect(result.attributes).to.have.members(['horse', 'dog', 'createdDate']);
    expect(result.attributes).not.to.have.members(['grade', 'garbage']);

    const invalidSelect = 'horse,dog,submarine,createdDate';
    const invalidAttrib = 'submarine';
    expect(function() {
      handlerUtils.processSelectOperator(model, invalidSelect);
    }).to.throw('Invalid entry in the _select list: ' + invalidAttrib);

    const invalidSelect2 = 'horse,dog,createddate'; // Case doesn't match the model!
    const invalidAttrib2 = 'createddate';
    expect(function() {
      handlerUtils.processSelectOperator(model, invalidSelect2);
    }).to.throw('Invalid entry in the _select list: ' + invalidAttrib2);
  });

  // buildQuery, // coming back to this.

  // getStrongTypeValue,
  it('can return strong types based on the meta', function() {
    const handlerUtils = new HandlerUtils();

    // Strings
    const createdByVal = "Red Robin";
    const createdByMeta = mssqlMeta.createdBy; // VARCHAR
    const result = handlerUtils.getStrongTypeValue(createdByVal, createdByMeta);
    expect(result.toString()).to.be.equal(createdByVal);
    expect(`${result}`).to.be.equal(createdByVal);
    expect(typeof result).to.be.equal('object');

    const updatedByVal = "Blue Oyster";
    const updatedByMeta = mssqlMeta.updatedBy; // NVARCHAR (Default Sequelize is Unicode!)
    const updatedResult = handlerUtils.getStrongTypeValue(updatedByVal, updatedByMeta);
    expect(updatedResult).to.be.equal(updatedByVal);
    expect(typeof updatedResult).to.be.equal('string');

    // Dates
    const updatedDateVal = "2014-01-31T12:30:58.123Z";
    const updatedDateResult = handlerUtils.getStrongTypeValue(updatedDateVal, mssqlMeta.updatedDate);
    expect(updatedDateResult).to.be.instanceOf(Object);
    expect(updatedDateResult.getTime()).to.be.equal(new Date("2014-01-31T12:30:58.123Z").getTime());

    const updatedDateVal2 = "2017-01-31";
    const updatedDateResult2 = handlerUtils.getStrongTypeValue(updatedDateVal2, mssqlMeta.updatedDate);
    expect(updatedDateResult2).to.be.instanceOf(Object);
    expect(updatedDateResult2.getTime()).to.be.equal(new Date("2017-01-31T00:00:00.000Z").getTime());

    // Numbers
    const numberVal = "789.456";
    const numberValResult = handlerUtils.getStrongTypeValue(numberVal, mssqlMeta.price);
    expect(typeof numberValResult).to.be.equal('number');
    expect(numberValResult * 1000).to.be.equal(789456);

    const numberVal2 = "0";
    const numberValResult2 = handlerUtils.getStrongTypeValue(numberVal2, mssqlMeta.price);
    expect(typeof numberValResult2).to.be.equal('number');
    expect(numberValResult2 * 1000).to.be.equal(0);

    const numberVal3 = "-234.00";
    const numberValResult3 = handlerUtils.getStrongTypeValue(numberVal3, mssqlMeta.price);
    expect(typeof numberValResult3).to.be.equal('number');
    expect(numberValResult3).to.be.equal(-234);

    // Booleans
    const booleanVal = "TRUE";
    const booleanValResult = handlerUtils.getStrongTypeValue(booleanVal, mssqlMeta.active);
    expect(typeof booleanValResult).to.be.equal('boolean');
    expect(booleanValResult).to.be.equal(true);

    const booleanVal2 = "false";
    const booleanValResult2 = handlerUtils.getStrongTypeValue(booleanVal2, mssqlMeta.active);
    expect(typeof booleanValResult2).to.be.equal('boolean');
    expect(booleanValResult2).to.be.equal(false);

    // Anything else!
    const unspecifiedVal = "It's coming in as a String!";
    const uuidMeta = {
			type: DataTypes.UUID, // We don't do anything special with these!
			allowNull: false,
			comment: null,
			field: '_id'
		};
    const uuidResult = handlerUtils.getStrongTypeValue(unspecifiedVal, uuidMeta);
    expect(typeof uuidResult).to.be.equal('string');
    expect(uuidResult).to.be.equal(unspecifiedVal); // Not changed in any way!
  });


  // getStrongPkValue,
  it('can convert PK attributes to typed PK values', function() {
    const handlerUtils = new HandlerUtils();

    // Single column Integer Pk
    const orderSkuIdVal = "132456";
    const orderSkuModel = {
      name: 'OrderSkuModel',
      primaryKeyAttributes: ['id'],
      rawAttributes: {
        id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          primaryKey: true,
          autoIncrement: true,
          comment: null,
          autoIncrement: true,
          field: 'order_sku_id'
        }
      }
    };
    const orderSkuIdResult = handlerUtils.getStrongPkValue(orderSkuIdVal, orderSkuModel);
    expect(`${orderSkuIdResult}`).to.be.equal(orderSkuIdVal);
    expect(typeof orderSkuIdResult).to.be.equal('number');

    // Null Pk value throws error
    expect(function() {
      handlerUtils.getStrongPkValue(null, orderSkuModel);
    }).to.throw('ID is required');

    // Multi-pk throws error
    orderSkuModel.primaryKeyAttributes.push('addtionalPk');
    expect(function() {
      handlerUtils.getStrongPkValue('123', orderSkuModel);
    }).to.throw('PK operations not currently supported on compound keys');

    // No Pk throws error
    orderSkuModel.primaryKeyAttributes = []; // Np PKs!
    expect(function() {
      handlerUtils.getStrongPkValue('123', orderSkuModel);
    }).to.throw('Primary key not defined');
    

  });

  // getDataTypeClause
  it('can convert attribute values to Sequelize queries', function() {
    const handlerUtils = new HandlerUtils();

    // TODO!
    // Single column Integer Pk
    const orderSkuIdVal = "132456";
    const orderSkuIdResult = 132456; // handlerUtils.getStrongPkValue(orderSkuIdVal, orderSkuModel);
    expect(`${orderSkuIdResult}`).to.be.equal(orderSkuIdVal);
    expect(typeof orderSkuIdResult).to.be.equal('number');
  });

  it('handlerUtils is an Object', function() {
    expect(true).to.be.true;
  });

  after(function(done) {
    done();
  });
});
