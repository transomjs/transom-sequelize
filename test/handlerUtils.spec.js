'use strict';
const chai = require('chai');
const expect = chai.expect;

const HandlerUtils = require('../lib/handlerUtils');

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
	
	it('Operands constant has known keys & values', function () {
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

	it('Can separate Operands from keys & values', function () {
		const handlerUtils = new HandlerUtils();

		const sample = {
			horse: 'Mr. Ed',
			cat: 'Garfield',
			dog: 'Snoopy',
			grade: 5,
			createdDate: new Date("Tue, 23 Apr 2019 15:46:30 GMT")
		};
		Object.keys(handlerUtils.OPERANDS).map(k => sample[k] = `**${k}**`);
		const model = {
			rawAttributes: {
				horse: null,
				// cat?
				dog: null,
				grade: null,
				createdDate: null
			}
		}
		const result = handlerUtils.separateApiOperations(sample, model);
    expect(result.operands).to.be.an.instanceOf(Object);
		expect(Object.keys(result.operands).length).to.equal(8);
		
    expect(result.attributes).to.be.an.instanceOf(Object);
		expect(Object.keys(handlerUtils.OPERANDS).length).to.equal(8);
		
		expect(result.extras).to.be.an.instanceOf(Object);
    expect(Object.keys(handlerUtils.OPERANDS).length).to.equal(8);

    expect(Object.keys(handlerUtils.OPERANDS).length).to.equal(8);
		expect(handlerUtils.OPERANDS._type).to.equal('_type');	
	});

  // it('can parse Stringified JSON Objects', function() {
  //   const handlerUtils = new HandlerUtils();
  //   const sample = `{"coordinates":[108.258,181.368],"type":"Point"}`;
  //   const result = handlerUtils.tryParseJSON(sample, 'not-used');
  //   expect(result).to.be.an.instanceOf(Object);
  //   expect(result)
  //     .to.have.property('type')
  //     .and.to.equal('Point');
  //   expect(result)
  //     .to.have.property('coordinates')
  //     .and.to.be.an.instanceof(Array);
  //   expect(result.coordinates).to.have.members([108.258, 181.368]);
  //   expect(result.coordinates.length).to.equal(2, 'tryParseJSON returned extra array members');
  // });

  it('handlerUtils is an Object', function() {
    expect(true).to.be.true;
  });

  after(function(done) {
    done();
  });
});
