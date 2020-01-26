'use strict';
const path = require('path');
const Sequelize = require('sequelize');
const SequelizeMeta = require('./lib/sequelize-meta');
const SequelizeRoutes = require('./lib/sequelizeRoutes');
const debug = require('debug')('transom:sequelize');

function TransomSequelize() {
  this.initialize = function(server, options) {

    let sequelize;
    let database;
    let retryOptions; 

    return new Promise(resolve => {
      const sequelizeDefn = server.registry.get('transom-config.definition.sequelize', {});
      options = Object.assign({}, sequelizeDefn, options);

      // Generate lowercase codes on each table entry. Used for file and model names!
      Object.keys(options.tables).map(t => {
        options.tables[t].name = t;
        options.tables[t].code = (options.tables[t].code || t).toLowerCase();
      });

      // Configure Promise retries on the initial database connection.
      retryOptions = Object.assign({}, options.config.retryOptions, {
        max: 10, // maximum amount of tries
        timeout: 10000, // throw if no response or error within millisecond timeout
        match: [ // Must match error signature (ala bluebird catch) to continue
          Sequelize.ConnectionError
        ],
        backoffBase: 1000, // Initial backoff duration in ms.
        backoffExponent: 1.05, // Exponent to increase backoff each try.
        report: msg => { console.log(msg); }, // the function used for reporting; must have a (string, object) argument signature, where string is the message.
        name:  'Transom.sequelize connection attempt'
      });
      delete options.config.retryOptions;

      // Sequelize wants them split out.
      database = options.config.database;
      delete options.config.database;

      const username = options.config.username;
      delete options.config.username;

      const password = options.config.password;
      delete options.config.password;

      sequelize = new Sequelize(database, username, password, options.config);

      const regKey = options.sequelizeKey || 'sequelize';
      server.registry.set(regKey, sequelize);

      const dialect = options.config.dialect;
      const dateStringify = options.config.dateStringify;

      if (dialect === 'mssql') {
        // Apply fix for inserting dates on MS SQL Server, override timezone formatting.
        Sequelize.DATE.prototype._stringify = dateStringify || function _stringify(date, options) {
          return this._applyTimezone(date, options).format('YYYY-MM-DD HH:mm:ss.SSS');
        };
      } else if (options.config.dateStringify) {
        Sequelize.DATE.prototype._stringify = dateStringify;
      }
      resolve();
    }).then(() => {
      // return retry(() => sequelize.authenticate(), retryOptions);
      return sequelize.authenticate({ retry: retryOptions });
    }).then(() => {
          console.log(`Connection to ${database} has been established.`);

          return new Promise((resolve, reject) => {
            const overwrite = options.overwrite === false ? false : true;
            const metaPath = path.join(__dirname, '..', '..', '..', options.directory || 'sequelize-metadata');

            const sequelizeMeta = new SequelizeMeta(sequelize, {
              directory: metaPath,
              overwrite,
              additional: {
                timestamps: false
              },
              tables: Object.keys(options.tables)
            });

          // Generates metadata for all the tables.
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

                debug(`Initializing ${tbl} Model [${Object.keys(attributeHooks).join(', ')}]`);

                // Create and initialize the model with sequelize.
                class model extends Sequelize.Model {}
                model.init(comboMeta, options);

                // Copy the meta to the model for custom querying options later!
                model.__meta = comboMeta;

                // Adding class level (Static) methods
                const statics = allTables[tbl].statics || {};
                for (let staticKey in statics) {
                  if (model[staticKey]) {
                    throw new Error(
                      `Failed to add static function, '${staticKey}' already exists on the ${tbl} Model.`
                    );
                  }
                  debug(`Adding static function ${staticKey} to ${tbl} Model.`);
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
                  debug(`Adding instance method ${methodKey} to ${tbl} Model.`);
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
          const sequelizeRoutes = new SequelizeRoutes(server,options);
          sequelizeRoutes.setupModelHandler();
        })
        .catch(err => {
          console.error('Unable to connect to the database:', err.message || err);
          Promise.reject(err);
        });
  };

  // this.preStart = function (server, options) {
  // }
}

module.exports = new TransomSequelize();
