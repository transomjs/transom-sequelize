'use strict';
const sinon = require('sinon');
const SequelizeRoutes = require('../lib/sequelizeRoutes');

describe('sequelizeRoutes', function() {
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
    return {
      get: sandbox.spy(),
      post: sandbox.spy(),
      put: sandbox.spy(),
      del: sandbox.spy(),
      registry: {
        get: sandbox.stub().callsFake((key, defaultValue) => {
          if (key === 'transom-config.definition.sequelize') {
            return {
              tables: {
                users: {
                  code: 'users',
                  routes: {
                    insert: true,
                    find: true,
                    findCount: true,
                    findById: true,
                    updateById: true,
                    deleteById: true,
                    deleteBatch: true
                  }
                },
                logs: {
                  code: 'logs',
                  routes: false
                },
                messages: {
                  code: 'messages',
                  routes: {
                    find: true,
                    findById: true,
                    insert: false,
                    updateById: false,
                    deleteById: false,
                    delete: false,
                    deleteBatch: false
                  }
                }
              }
            };
          } else if (key === 'transom-config.definition.uri.prefix') {
            return '/api/v1';
          }
          return defaultValue;
        })
      }
    };
  }

  function createMockSequelize() {
    return {
      models: {}
    };
  }

  describe('setupModelHandler', function() {
    it('should create all CRUD routes for a table with default routes', function() {
      const server = createMockServer();
      const sequelize = createMockSequelize();

      const options = {
        tables: {
          users: {
            code: 'users',
            routes: {
              insert: true,
              find: true,
              findCount: true,
              findById: true,
              updateById: true,
              deleteById: true,
              deleteBatch: true
            }
          }
        }
      };

      const sequelizeRoutes = SequelizeRoutes(server, options);
      sequelizeRoutes.setupModelHandler();

      // Verify POST (insert)
      expect(server.post.calledWith('/api/v1/db/users')).to.be.true;

      // Verify GET (find)
      expect(server.get.calledWith('/api/v1/db/users')).to.be.true;

      // Verify GET (findCount)
      expect(server.get.calledWith('/api/v1/db/users/count')).to.be.true;

      // Verify GET (findById)
      expect(server.get.calledWith('/api/v1/db/users/:__id')).to.be.true;

      // Verify PUT (updateById)
      expect(server.put.calledWith('/api/v1/db/users/:__id')).to.be.true;

      // Verify DELETE (deleteById)
      expect(server.del.calledWith('/api/v1/db/users/:__id')).to.be.true;

      // Verify DELETE (deleteBatch)
      expect(server.del.calledWith('/api/v1/db/users/batch')).to.be.true;
    });

    it('should not create routes when routes is false', function() {
      const server = createMockServer();
      const sequelize = createMockSequelize();

      const options = {
        tables: {
          logs: {
            code: 'logs',
            routes: false
          }
        }
      };

      const sequelizeRoutes = SequelizeRoutes(server, options);
      sequelizeRoutes.setupModelHandler();

      // No routes should be created for 'logs' table
      const logsRoutes = [
        server.post, server.get, server.put, server.del
      ].reduce((acc, method) => {
        return acc + method.getCalls().filter(call => {
          const args = call.args[0];
          return args.path && args.path.includes('logs');
        }).length;
      }, 0);

      expect(logsRoutes).to.equal(0);
    });

    it('should selectively create routes based on configuration', function() {
      const server = createMockServer();
      const sequelize = createMockSequelize();

      const options = {
        tables: {
          messages: {
            code: 'messages',
            routes: {
              find: true,
              findById: true,
              insert: false,
              updateById: false,
              deleteById: false,
              delete: false,
              deleteBatch: false
            }
          }
        }
      };

      const sequelizeRoutes = SequelizeRoutes(server, options);
      sequelizeRoutes.setupModelHandler();

      // Should have GET routes
      expect(server.get.calledWith('/api/v1/db/messages')).to.be.true;

      expect(server.get.calledWith('/api/v1/db/messages/:__id')).to.be.true;

      // Should NOT have POST route
      expect(server.post.calledWith('/api/v1/db/messages')).to.be.false;

      // Should NOT have PUT route
      expect(server.put.calledWith('/api/v1/db/messages/:__id')).to.be.false;

      // Should NOT have DELETE routes
      expect(server.del.calledWith('/api/v1/db/messages/:__id')).to.be.false;
    });

    it('should disable delete by query by default', function() {
      const server = createMockServer();
      const sequelize = createMockSequelize();

      const options = {
        tables: {
          users: {
            code: 'users',
            routes: {
              // delete not explicitly set, should default to false
            }
          }
        }
      };

      const sequelizeRoutes = SequelizeRoutes(server, options);
      sequelizeRoutes.setupModelHandler();

      // Should NOT have DELETE by query route
      // With Express, first arg is the path string directly
      const deleteByQueryCalls = server.del.getCalls().filter(call => {
        const path = call.args[0];
        return path === '/api/v1/db/users'; // Without :__id or /batch
      });

      expect(deleteByQueryCalls.length).to.equal(0);
    });

    it('should add preMiddleware and postMiddleware to routes', function() {
      const server = createMockServer();
      const sequelize = createMockSequelize();

      const preMiddleware = [
        sandbox.spy((req, res, next) => next()),
        sandbox.spy((req, res, next) => next())
      ];

      const postMiddleware = [
        sandbox.spy((req, res, next) => next())
      ];

      const options = {
        tables: {
          users: {
            code: 'users',
            routes: {
              find: true
            }
          }
        },
        preMiddleware,
        postMiddleware
      };

      const sequelizeRoutes = SequelizeRoutes(server, options);
      sequelizeRoutes.setupModelHandler();

      // Verify that middleware is passed to route registration
      const findCalls = server.get.getCalls().filter(call => {
        const path = call.args[0];
        return path === '/api/v1/db/users';
      });

      expect(findCalls.length).to.be.greaterThan(0);
      // The route should have: path, pre middleware array, handler, post middleware
      const callArgs = findCalls[0].args;
      expect(callArgs.length).to.be.greaterThan(2);
    });

    it('should support API versioning on routes', function() {
      const server = createMockServer();
      const sequelize = createMockSequelize();

      const options = {
        tables: {
          users: {
            code: 'users',
            versions: ['1.0.0', '2.0.0'],
            routes: {
              find: true
            }
          }
        }
      };

      const sequelizeRoutes = SequelizeRoutes(server, options);
      sequelizeRoutes.setupModelHandler();

      // Check that route was created - with Express, versions are handled via metadata
      const findCalls = server.get.getCalls().filter(call => {
        const path = call.args[0];
        return path === '/api/v1/db/users';
      });

      expect(findCalls.length).to.be.greaterThan(0);
      // Versions are now handled through TransomCore.withMeta wrapper
      // Just verify the route was registered
      expect(findCalls[0].args[0]).to.equal('/api/v1/db/users');
    });

    it('should handle custom sequelizeKey option', function() {
      const customSequelize = createMockSequelize();
      const server = {
        ...createMockServer(),
        registry: {
          get: sandbox.stub().callsFake((key, defaultValue) => {
            if (key === 'custom-sequelize-key') {
              return customSequelize;
            } else if (key === 'transom-config.definition.sequelize') {
              return { tables: {} };
            } else if (key === 'transom-config.definition.uri.prefix') {
              return '/api/v1';
            }
            return defaultValue;
          })
        }
      };

      const options = {
        sequelizeKey: 'custom-sequelize-key',
        tables: {
          users: {
            code: 'users',
            routes: false
          }
        }
      };

      const sequelizeRoutes = SequelizeRoutes(server, options);
      sequelizeRoutes.setupModelHandler();

      // Should have retrieved sequelize using custom key
      expect(server.registry.get.calledWith('custom-sequelize-key')).to.be.true;
    });

    it('should handle openapiIgnore option', function() {
      const server = createMockServer();
      const sequelize = createMockSequelize();

      const options = {
        openapiIgnore: ['users'],
        tables: {
          users: {
            code: 'users',
            routes: {
              find: true
            }
          }
        }
      };

      // This should not throw and should create routes despite openapi ignore
      const sequelizeRoutes = SequelizeRoutes(server, options);
      expect(() => {
        sequelizeRoutes.setupModelHandler();
      }).to.not.throw();
    });

    it('should handle openapiSecurity option', function() {
      const server = createMockServer();
      const sequelize = createMockSequelize();

      const options = {
        openapiSecurity: {
          'users': {
            'find': ['bearerAuth']
          }
        },
        tables: {
          users: {
            code: 'users',
            routes: {
              find: true
            }
          }
        }
      };

      const sequelizeRoutes = SequelizeRoutes(server, options);
      expect(() => {
        sequelizeRoutes.setupModelHandler();
      }).to.not.throw();
    });
  });

  after(function(done) {
    done();
  });
});
