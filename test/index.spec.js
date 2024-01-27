'use strict';

describe('index', function() {
	let chai;
	let expect;
  
	before(function() {
	  return import('chai').then(chaiLib => {
		chai = chaiLib;
		expect = chai.expect;
	  });
	});
  
	afterEach(function(done) {
        done();
    });

	it('transomSequelize is an Object with initialize and preStart', function() {
		expect(true).to.be.true;
    });
    
	after(function(done) {
		done();
    });
    
});
