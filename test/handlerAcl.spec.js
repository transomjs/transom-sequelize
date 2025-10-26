'use strict';
const { Op, Sequelize } = require('sequelize');
const HandlerAcl = require('../lib/handlerAcl');

describe('handlerAcl', function() {
  let chai;
  let expect;

  before(function() {
    return import('chai').then(chaiLib => {
      chai = chaiLib;
      expect = chai.expect;
    });
  });

  describe('allowInsert', function() {
    it('should allow insert when user has required group', function() {
      const handlerAcl = new HandlerAcl();

      const model = {
        options: {
          acl: {
            create: 'admin'
          }
        }
      };

      const req = {
        locals: {
          user: {
            groups: [
              { groupCode: 'admin' },
              { groupCode: 'user' }
            ]
          }
        }
      };

      const result = handlerAcl.allowInsert(model, req);
      expect(result).to.be.true;
    });

    it('should deny insert when user lacks required group', function() {
      const handlerAcl = new HandlerAcl();

      const model = {
        options: {
          acl: {
            create: 'admin'
          }
        }
      };

      const req = {
        locals: {
          user: {
            groups: [
              { groupCode: 'user' },
              { groupCode: 'guest' }
            ]
          }
        }
      };

      const result = handlerAcl.allowInsert(model, req);
      expect(result).to.be.false;
    });

    it('should deny insert when user has no groups', function() {
      const handlerAcl = new HandlerAcl();

      const model = {
        options: {
          acl: {
            create: 'admin'
          }
        }
      };

      const req = {
        locals: {
          user: {
            groups: []
          }
        }
      };

      const result = handlerAcl.allowInsert(model, req);
      expect(result).to.be.false;
    });

    it('should deny insert when no user in request', function() {
      const handlerAcl = new HandlerAcl();

      const model = {
        options: {
          acl: {
            create: 'admin'
          }
        }
      };

      const req = {
        locals: {}
      };

      const result = handlerAcl.allowInsert(model, req);
      expect(result).to.be.false;
    });
  });

  describe('applyInsertDefaults', function() {
    it('should apply default ACL values with CURRENT_USER owner', function() {
      const handlerAcl = new HandlerAcl();

      const model = {
        options: {
          acl: {
            default: {
              owner: 'CURRENT_USER',
              public: 1,
              group: {
                'admin': 7
              }
            }
          }
        }
      };

      const req = {
        locals: {
          user: {
            id: 'user123'
          }
        }
      };

      const result = handlerAcl.applyInsertDefaults(model, req);

      expect(result.aclOwner).to.equal('user123');
      expect(result.aclPublicPrivs).to.equal(1);
      expect(result.aclGroup).to.equal('admin');
      expect(result.aclGroupPrivs).to.equal(7);
    });

    it('should apply default ACL values with hardcoded owner', function() {
      const handlerAcl = new HandlerAcl();

      const model = {
        options: {
          acl: {
            default: {
              owner: 'system',
              public: 1,
              group: {
                'users': 3
              }
            }
          }
        }
      };

      const req = {
        locals: {}
      };

      const result = handlerAcl.applyInsertDefaults(model, req);

      expect(result.aclOwner).to.equal('system');
      expect(result.aclPublicPrivs).to.equal(1);
      expect(result.aclGroup).to.equal('users');
      expect(result.aclGroupPrivs).to.equal(3);
    });

    it('should use defaults when no ACL defaults specified', function() {
      const handlerAcl = new HandlerAcl();

      const model = {
        options: {
          acl: {
            default: {}
          }
        }
      };

      const req = {
        locals: {}
      };

      const result = handlerAcl.applyInsertDefaults(model, req);

      expect(result.aclOwner).to.equal(0);
      expect(result.aclPublicPrivs).to.equal(0);
      expect(result.aclGroup).to.equal('none');
      expect(result.aclGroupPrivs).to.equal(0);
    });

    it('should handle missing group configuration', function() {
      const handlerAcl = new HandlerAcl();

      const model = {
        options: {
          acl: {
            default: {
              owner: 'CURRENT_USER',
              public: 1
            }
          }
        }
      };

      const req = {
        locals: {
          user: {
            id: 'user123'
          }
        }
      };

      const result = handlerAcl.applyInsertDefaults(model, req);

      expect(result.aclGroup).to.equal('none');
      expect(result.aclGroupPrivs).to.equal(0);
    });
  });

  describe('addAclFind', function() {
    it('should add ACL conditions to find query', function() {
      const handlerAcl = new HandlerAcl();

      const model = {
        name: 'TestModel',
        rawAttributes: {
          id: {},
          aclOwner: {},
          aclGroup: {},
          aclGroupPrivs: {},
          aclPublicPrivs: {}
        }
      };

      const query = {
        where: { active: true }
      };

      const req = {
        locals: {
          user: {
            id: 'user123',
            groups: [
              { groupCode: 'admin' }
            ]
          }
        }
      };

      const result = handlerAcl.addAclFind(model, query, req);

      expect(result.where).to.have.property(Op.and);
      expect(result.where[Op.and]).to.be.an('array');
      expect(result.where[Op.and].length).to.equal(2);
      expect(result.where[Op.and][0]).to.deep.equal({ active: true });
      expect(result.where[Op.and][1]).to.have.property(Op.or);
    });

    it('should throw error if ACL columns are missing', function() {
      const handlerAcl = new HandlerAcl();

      const model = {
        name: 'TestModel',
        rawAttributes: {
          id: {},
          aclOwner: {}
          // Missing other ACL columns
        }
      };

      const query = {};
      const req = {
        locals: {
          user: { id: 'user123', groups: [] }
        }
      };

      expect(() => {
        handlerAcl.addAclFind(model, query, req);
      }).to.throw('TestModel does include the required acl columns');
    });

    it('should work with empty where clause', function() {
      const handlerAcl = new HandlerAcl();

      const model = {
        name: 'TestModel',
        rawAttributes: {
          id: {},
          aclOwner: {},
          aclGroup: {},
          aclGroupPrivs: {},
          aclPublicPrivs: {}
        }
      };

      const query = {};

      const req = {
        locals: {
          user: {
            id: 'user456',
            groups: []
          }
        }
      };

      const result = handlerAcl.addAclFind(model, query, req);

      expect(result.where).to.have.property(Op.and);
      expect(result.where[Op.and].length).to.equal(2);
      expect(result.where[Op.and][0]).to.deep.equal({});
    });
  });

  describe('addAclUpdate', function() {
    it('should add ACL conditions for update with WRITE privilege', function() {
      const handlerAcl = new HandlerAcl();

      const model = {
        name: 'TestModel',
        rawAttributes: {
          id: {},
          aclOwner: {},
          aclGroup: {},
          aclGroupPrivs: {},
          aclPublicPrivs: {}
        }
      };

      const query = {
        where: { id: 1 }
      };

      const req = {
        locals: {
          user: {
            id: 'user789',
            groups: [
              { groupCode: 'editor' }
            ]
          }
        }
      };

      const result = handlerAcl.addAclUpdate(model, query, req);

      expect(result.where).to.have.property(Op.and);
      expect(result.where[Op.and]).to.be.an('array');
      expect(result.where[Op.and][1]).to.have.property(Op.or);
    });
  });

  describe('addAclDelete', function() {
    it('should add ACL conditions for delete with DELETE privilege', function() {
      const handlerAcl = new HandlerAcl();

      const model = {
        name: 'TestModel',
        rawAttributes: {
          id: {},
          aclOwner: {},
          aclGroup: {},
          aclGroupPrivs: {},
          aclPublicPrivs: {}
        }
      };

      const query = {
        where: { id: 1 }
      };

      const req = {
        locals: {
          user: {
            id: 'user999',
            groups: [
              { groupCode: 'admin' }
            ]
          }
        }
      };

      const result = handlerAcl.addAclDelete(model, query, req);

      expect(result.where).to.have.property(Op.and);
      expect(result.where[Op.and]).to.be.an('array');
      expect(result.where[Op.and][1]).to.have.property(Op.or);
    });
  });

  describe('ACL privilege constants', function() {
    it('should enforce READ privilege correctly', function() {
      const handlerAcl = new HandlerAcl();

      const model = {
        name: 'TestModel',
        rawAttributes: {
          id: {},
          aclOwner: {},
          aclGroup: {},
          aclGroupPrivs: {},
          aclPublicPrivs: {}
        }
      };

      const query = {};
      const req = {
        locals: {
          user: {
            id: 'user1',
            groups: [{ groupCode: 'readers' }]
          }
        }
      };

      const result = handlerAcl.addAclFind(model, query, req);

      // The OR clause should check for READ privilege (value 1)
      const aclConditions = result.where[Op.and][1];
      expect(aclConditions[Op.or]).to.be.an('array');
      expect(aclConditions[Op.or].length).to.equal(3);
    });
  });

  after(function(done) {
    done();
  });
});
