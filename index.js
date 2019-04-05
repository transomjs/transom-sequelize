'use strict';
const path = require('path');
const _ = require('lodash');
const Sequelize = require('sequelize');
const SequelizeMeta = require('./lib/sequelize-meta');
const SequelizeRoutes = require('./lib/sequelizeRoutes');
const debug = require('debug')('transom:sequelize');

function TransomSequelize() {
  this.initialize = function(server, options) {
    return new Promise(function(resolve, reject) {
      const sequelizeDefn = server.registry.get('transom-config.definition.sequelize', {});
      options = Object.assign({}, sequelizeDefn, options);

      // Generate lowercase codes on each table entry. Used for file and model names!
      Object.keys(options.tables).map(t => {
        options.tables[t].name = t;
        options.tables[t].code = (options.tables[t].code || t).toLowerCase();
      });

      // Sequelize wants them split out.
      const database = options.config.database;
      delete options.config.database;

      const username = options.config.username;
      delete options.config.username;

      const password = options.config.password;
      delete options.config.password;

      const sequelize = new Sequelize(database, username, password, options.config);
      sequelize
        .authenticate()
        .then(() => {
          console.log(`Connection to ${database} has been established.`);

          const overwrite = options.overwrite === false ? false : true;
          const metaPath = path.join(__dirname, '..', options.directory || 'sequelize-metadata');

          const sequelizeMeta = new SequelizeMeta(sequelize, {
            directory: metaPath,
            overwrite,
            additional: {
              timestamps: false
            },
            tables: Object.keys(options.tables)
          });

          // Generates metadata for all the tables.
          return new Promise((resolve, reject) => {
            sequelizeMeta.run(function(err) {
              if (err) {
                return reject(err);
              }
              // For each table we have meta.
              const allTables = options.tables;
              const tables = Object.keys(allTables);
              tables.map(tbl => {
                // Load the generated metadata files
                const metadataFile = path.join(metaPath, tbl);
                debug(`Loading metadata from ${metadataFile}`);

                // Get column metadata from generated files and the api definition.
                const generatedMeta = require(metadataFile);
                const attributeMeta = allTables[tbl].attributes || {};
                const attributeHooks = allTables[tbl].hooks || {};
                
                // Lay the attributeMeta overtop of the generatedMeta.
                const comboMeta = {};
                for (let column in generatedMeta) {
                  comboMeta[column] = Object.assign({}, generatedMeta[column], attributeMeta[column]);
                }

                // Create model options to help define behaviours of the Model.
                const options = {
                  sequelize,
                  tableName: tbl,
                  modelName: allTables[tbl].code, // These must be in LowerCase!
                  hooks: attributeHooks,
                  timestamps: false,
                  freezeTableName: true
                };

                // No duplicate model names in Sequelize!
                if (sequelize.models[options.modelName]) {
                  throw new Error(`'${options.modelName}' already exists in Sequelize.`);
                }

                // Create and initialize the model with sequelize.
                class model extends Sequelize.Model {}
                model.init(comboMeta, options);

                // Adding class level methods (Static)
                const statics = allTables[tbl].statics || {};
                for (let staticKey in statics) {
                  if (model[staticKey]) {
                    throw new Error(
                      `Failed to add static function, '${staticKey}' already exists on the ${tbl} Model.`
                    );
                  }
                  model[staticKey] =
                    typeof statics[staticKey] === 'function'
                      ? statics[staticKey]
                      : function() {
                          return statics[staticKey];
                        };
                }

                // Adding instance level methods.
                // ********************************************************************
                // ** DO NOT use fat arrow functions when creating instance methods!
                // ** It loses context of `this`.
                // ********************************************************************
                const methods = allTables[tbl].methods || {};
                for (let methodKey in methods) {
                  if (model.prototype[methodKey]) {
                    throw new Error(
                      `Failed to add instance method, '${methodKey}' already exists on the ${tbl} Model.`
                    );
                  }
                  model.prototype[methodKey] =
                    typeof methods[methodKey] === 'function'
                      ? methods[methodKey]
                      : function() {
                          return methods[methodKey];
                        };
                }
              });
              resolve();
            });
          });
        })
        .then(() => {
          const sequelizeRoutes = new SequelizeRoutes({
            server,
            sequelize
          });
          sequelizeRoutes.setupModelHandler();

          // search for something
          console.log('A----------------------------');
          const employees = sequelize.models['employees'];
          console.log('Static method:', employees.helloWorld());
          employees.findAll({ where: { firstName: 'shaw' } }).then(result => {
            console.log('N----------------------------');
            console.log('employees[0]:', result[0].get());
            console.log('X-----------------------------');
            console.log('Instance method:', result[0].fullname());
            console.log('Z-----------------------------');
          });

          // search for something else
          // console.log('-----------------------------');
          // const Carrier = sequelize.models['Carrier'];
          // Carrier.findAll({ where: {xname: 'ralph'} }).then(result => {
          //   console.log('Carriers:', result[0].get());
          // });
        })
        .catch(err => {
          console.error('Unable to connect to the database:', err.message || err);
          reject(err);
        });

      debug('options.config', options.config);
      resolve();
    });
  };

  // this.preStart = function (server, options) {
  // }
}

module.exports = new TransomSequelize();
