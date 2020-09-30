const async = require('async');
const fs = require('fs');
const path = require('path');
const dialects = require('./dialects');
const _ = require('lodash');

function SequelizeMeta(sequelize, options) {
  if (options && options.dialect === 'sqlite') {
    options.storage = options.storage || 'sequelize';
  }
  this.sequelize = sequelize;
  this.queryInterface = this.sequelize.getQueryInterface();
  this.apiTables = {};
  this.foreignKeys = {};
  this.dialect = dialects[this.sequelize.options.dialect];

  this.options = _.extend(
    {
      spaces: false,
      overwrite: true,
      camelCase: true,
      indentation: 1,
      directory: './sequelize-meta',
      additional: {},
      freezeTableName: true
    },
    options || {}
  );
}

SequelizeMeta.prototype.build = function(callback) {
  const self = this;

  function mapTable(table, cb) {
    self.queryInterface.describeTable(table, self.options.schema).then(function(fields) {
      self.apiTables[table] = fields;
      cb();
    }, cb);
  }

  if (self.options.dialect === 'postgres' && self.options.schema) {
    const showTablesSql = this.dialect.showTablesQuery(self.options.schema);
    self.sequelize
      .query(showTablesSql, {
        raw: true,
        type: self.sequelize.QueryTypes.SHOWTABLES
      })
      .then(function(tableNames) {
        processTables(_.flatten(tableNames));
      }, callback);
  } else {
    this.queryInterface.showAllTables().then(processTables, callback);
  }

  function processTables(__tables) {
    if (self.sequelize.options.dialect === 'mssql') {
      __tables = _.map(__tables, 'tableName');
    }

    let tables;
    if (self.options.tables) {
      tables = _.intersection(__tables, self.options.tables);
    } else if (self.options.skipTables) {
      tables = _.difference(__tables, self.options.skipTables);
    } else {
      tables = __tables;
    }

    async.each(tables, mapForeignKeys, mapTables);

    function mapTables(err) {
      if (err) {
        console.error(err);
      }
      async.each(tables, mapTable, callback);
    }
  }

  function mapForeignKeys(table, fn) {
    if (!self.dialect) {
      return fn();
    }

    const sql = self.dialect.getForeignKeysQuery(table, self.sequelize.config.database);

    self.sequelize
      .query(sql, {
        type: self.sequelize.QueryTypes.SELECT,
        raw: true
      })
      .then(function(res) {
        _.each(res, assignColumnDetails);
        fn();
      }, fn);

    function assignColumnDetails(ref) {
      // map sqlite's PRAGMA results
      ref = _.mapKeys(ref, function(value, key) {
        switch (key) {
          case 'from':
            return 'source_column';
          case 'to':
            return 'target_column';
          case 'table':
            return 'target_table';
          default:
            return key;
        }
      });

      ref = _.assign(
        {
          source_table: table,
          source_schema: self.sequelize.options.database,
          target_schema: self.sequelize.options.database
        },
        ref
      );

      if (!_.isEmpty(_.trim(ref.source_column)) && !_.isEmpty(_.trim(ref.target_column))) {
        ref.isForeignKey = true;
        ref.foreignSources = _.pick(ref, [
          'source_table',
          'source_schema',
          'target_schema',
          'target_table',
          'source_column',
          'target_column'
        ]);
      }
      if (_.isFunction(self.dialect.isUnique) && self.dialect.isUnique(ref)) {
        ref.isUnique = true;
      }
      if (_.isFunction(self.dialect.isPrimaryKey) && self.dialect.isPrimaryKey(ref)) {
        ref.isPrimaryKey = true;
      }
      if (_.isFunction(self.dialect.isSerialKey) && self.dialect.isSerialKey(ref)) {
        ref.isSerialKey = true;
      }

      self.foreignKeys[table] = self.foreignKeys[table] || {};
      self.foreignKeys[table][ref.source_column] = _.assign({}, self.foreignKeys[table][ref.source_column], ref);
    }
  }
};

SequelizeMeta.prototype.run = function(callback) {
  var self = this;
  var text = {};

  this.build(generateText);

  function generateText(err) {
    if (err) {
      console.error(err);
    }

    async.each(
      _.keys(self.apiTables),
      function(table, _callback) {
        const fields = _.keys(self.apiTables[table]);
        // Spaces or Tabs?
        let spaces = '';
        for (var x = 0; x < self.options.indentation; ++x) {
          spaces += self.options.spaces === true ? ' ' : '\t';
        }

        text[table] = '';
        text[table] += '// ******************************************************\n';
        text[table] += '// ** This is a generated file. Do not modify by hand. **\n';
        text[table] += '// ******************************************************\n';
        text[table] += "const Sequelize = require('sequelize');\n";
        text[table] += 'const DataTypes = Sequelize.DataTypes;\n\n';

        text[table] += 'module.exports = {\n';

        _.each(fields, function(field, i) {
          const additional = self.options.additional;
          if (additional && additional.timestamps !== undefined && additional.timestamps) {
            if (
              (additional.createdAt && field === 'createdAt') ||
              additional.createdAt === field ||
              ((additional.updatedAt && field === 'updatedAt') || additional.updatedAt === field) ||
              ((additional.deletedAt && field === 'deletedAt') || additional.deletedAt === field)
            ) {
              return true;
            }
          }
          // Find foreign key
          const foreignKey =
            self.foreignKeys[table] && self.foreignKeys[table][field] ? self.foreignKeys[table][field] : null;

          if (_.isObject(foreignKey)) {
            self.apiTables[table][field].foreignKey = foreignKey;
          }

          if (i > 0) {
            text[table] += ',\n';
          }

          // column's attributes
          const fieldAttr = _.keys(self.apiTables[table][field]);
          const fieldName = self.options.camelCase ? _.camelCase(field) : field;
          text[table] += spaces + spaces + fieldName + ': {\n';

          // Serial key for postgres...
          let defaultVal = self.apiTables[table][field].defaultValue;
          let isUnicodeString = null;

          // ENUMs for postgres...
          if (self.apiTables[table][field].type === 'USER-DEFINED' && !!self.apiTables[table][field].special) {
            self.apiTables[table][field].type =
              'ENUM(' +
              self.apiTables[table][field].special
                .map(function(f) {
                  return `"${f}"`;
                })
                .join(',') +
              ')';
          }

          var isUnique = self.apiTables[table][field].foreignKey && self.apiTables[table][field].foreignKey.isUnique;

          _.each(fieldAttr, function(attr, x) {
            var isSerialKey =
              self.apiTables[table][field].foreignKey &&
              _.isFunction(self.dialect.isSerialKey) &&
              self.dialect.isSerialKey(self.apiTables[table][field].foreignKey);

            // We don't need the special attribute from postgresql describe table..
            if (attr === 'special') {
              return true;
            }

            if (attr === 'foreignKey') {
              if (isSerialKey) {
                text[table] += spaces + spaces + spaces + 'autoIncrement: true';
              } else if (foreignKey.isForeignKey) {
                text[table] += spaces + spaces + spaces + 'references: {\n';
                text[table] +=
                  spaces +
                  spaces +
                  spaces +
                  spaces +
                  `model: '${self.apiTables[table][field][attr].foreignSources.target_table}',\n`;
                text[table] +=
                  spaces +
                  spaces +
                  spaces +
                  spaces +
                  `key: '${self.apiTables[table][field][attr].foreignSources.target_column}'\n`;
                text[table] += spaces + spaces + spaces + '}';
              } else {
                return true;
              }
            } else if (attr === 'autoIncrement') {
              if (
                self.apiTables[table][field][attr] === true &&
                (!_.has(self.apiTables[table][field], 'foreignKey') ||
                  (_.has(self.apiTables[table][field], 'foreignKey') &&
                    !!self.apiTables[table][field].foreignKey.isPrimaryKey))
              ) {
                text[table] += spaces + spaces + spaces + 'autoIncrement: true';
              } else {
                return true;
              }
            } else if (attr === 'primaryKey') {
              if (
                self.apiTables[table][field][attr] === true &&
                (!_.has(self.apiTables[table][field], 'foreignKey') ||
                  (_.has(self.apiTables[table][field], 'foreignKey') &&
                    !!self.apiTables[table][field].foreignKey.isPrimaryKey))
              ) {
                text[table] += spaces + spaces + spaces + 'primaryKey: true';
              } else {
                return true;
              }
            } else if (attr === 'allowNull') {
              text[table] += spaces + spaces + spaces + `${attr}: ${self.apiTables[table][field][attr]}`;
            } else if (attr === 'defaultValue') {
              if (
                self.sequelize.options.dialect === 'mssql' &&
                defaultVal &&
                defaultVal.toLowerCase() === '(newid())'
              ) {
                defaultVal = null; // disable adding "default value" attribute for UUID fields if generating for MS SQL
              }

              let defaultValueText = defaultVal;

              // AutoIncrement columns don't get a default value!
              if (isSerialKey) {
                return true;
              }

              if (self.apiTables[table][field].type.toLowerCase() === 'bit(1)') {
                //mySql Bit fix
                defaultValueText = defaultVal === "b'1'" ? 1 : 0;
              } else if (
                self.sequelize.options.dialect === 'mssql' &&
                self.apiTables[table][field].type.toLowerCase() === 'bit'
              ) {
                // mssql bit fix
                defaultValueText = defaultVal === '((1))' ? 1 : 0;
              }

              if (_.isString(defaultVal)) {
                const fieldType = self.apiTables[table][field].type.toLowerCase();
                if (_.endsWith(defaultVal, '()')) {
                  defaultValueText = "Sequelize.fn('" + defaultVal.replace(/\(\)$/, '') + "')";
                } else if (_.startsWith(defaultVal, '(') && _.endsWith(defaultVal, '())')) { // e.g. "(getdate())"
                  defaultValueText = "Sequelize.fn('" + defaultVal.replace(/[()]/g, '') + "')";
                } else if (fieldType.indexOf('date') === 0 || fieldType.indexOf('timestamp') === 0) {
                  if (
                    _.includes(
                      ['current_timestamp', 'current_date', 'current_time', 'localtime', 'localtimestamp'],
                      defaultVal.toLowerCase()
                    )
                  ) {
                    defaultValueText = `Sequelize.literal('${defaultVal}')`;
                  } else {
                    defaultValueText = `"${defaultValueText}"`;
                  }
                } else {
                  defaultValueText = `"${defaultValueText}"`;
                }
              }

              if (defaultVal === null || defaultVal === undefined) {
                // No default!
                return true;
              } else {
                // A string that matches "Sequelize.literal('bar')" should be escaped.
                const requiresEscape =
                  _.isString(defaultValueText) && !defaultValueText.match(/^Sequelize\.[^(]+\(.*\)$/);
                defaultValueText = requiresEscape
                  ? self.sequelize.escape(_.trim(defaultValueText, '"'), null, self.options.dialect)
                  : defaultValueText;

                // don't prepend N for MSSQL when building models...
                defaultValueText = _.trimStart(defaultValueText, 'N');
                text[table] += spaces + spaces + spaces + attr + ': ' + defaultValueText;
              }
            } else if (attr === 'type' && self.apiTables[table][field][attr].indexOf('ENUM') === 0) {
              text[table] += spaces + spaces + spaces + attr + ': DataTypes.' + self.apiTables[table][field][attr];
            } else {
              const attrLower = (self.apiTables[table][field][attr] || '').toLowerCase();
              let val = `"${self.apiTables[table][field][attr]}"`;

              if (attrLower === 'boolean' || attrLower === 'bit(1)' || attrLower === 'bit') {
                val = 'DataTypes.BOOLEAN';
              } else if (attrLower.match(/^(smallint|mediumint|tinyint|int)/)) {
                const length = attrLower.match(/\(\d+\)/);
                val = 'DataTypes.INTEGER' + (!_.isNull(length) ? length : '');

                const unsigned = attrLower.match(/unsigned/i);
                if (unsigned) {
                  val += '.UNSIGNED';
                }
                const zero = attrLower.match(/zerofill/i);
                if (zero) {
                  val += '.ZEROFILL';
                }
              } else if (attrLower.match(/^bigint/)) {
                val = 'DataTypes.BIGINT';
              } else if (attrLower.match(/^varchar/)) {
                const length = attrLower.match(/\(\d+\)/);
                val = 'DataTypes.STRING' + (!_.isNull(length) ? length : '');
                // It's a String but it's NOT unicode!
                isUnicodeString = false;
              } else if (attrLower.match(/^string|varying|nvarchar/)) {
                val = 'DataTypes.STRING';
                // It's a String AND it's unicode!
                if (attrLower.match(/^nvarchar/)) {
                  isUnicodeString = true;
                }
              } else if (attrLower.match(/^char/)) {
                const length = attrLower.match(/\(\d+\)/);
                val = 'DataTypes.CHAR' + (!_.isNull(length) ? length : '');
              } else if (attrLower.match(/^real/)) {
                val = 'DataTypes.REAL';
              } else if (attrLower.match(/text|ntext$/)) {
                val = 'DataTypes.TEXT';
              } else if (attrLower === 'date') {
                val = 'DataTypes.DATEONLY';
              } else if (attrLower.match(/^(date|timestamp)/)) {
                val = 'DataTypes.DATE';
              } else if (attrLower.match(/^(time)/)) {
                val = 'DataTypes.TIME';
              } else if (attrLower.match(/^(float|float4)/)) {
                val = 'DataTypes.FLOAT';
              } else if (attrLower.match(/^decimal/)) {
                val = 'DataTypes.DECIMAL';
              } else if (attrLower.match(/^(float8|double precision|numeric)/)) {
                val = 'DataTypes.DOUBLE';
              } else if (attrLower.match(/^uuid|uniqueidentifier/)) {
                val = 'DataTypes.UUIDV4';
              } else if (attrLower.match(/^jsonb/)) {
                val = 'DataTypes.JSONB';
              } else if (attrLower.match(/^json/)) {
                val = 'DataTypes.JSON';
              } else if (attrLower.match(/^geometry/)) {
                val = 'DataTypes.GEOMETRY';
              }
              text[table] += spaces + spaces + spaces + attr + ': ' + val;
            }
            text[table] += ',\n';
          });

          // Allows us to sidestep the default Sequelize MSSQL Unicode parameter prefix!
          if (isUnicodeString !== null) {
            text[table] += spaces + spaces + spaces + 'unicode: ' + isUnicodeString + ',\n';
          }

          if (isUnique) {
            text[table] += spaces + spaces + spaces + 'unique: true,\n';
          }

          if (self.options.camelCase) {
            text[table] += spaces + spaces + spaces + "field: '" + field + "',\n";
          }

          // Remove the last `,` within the attribute options
          text[table] = text[table].trim().replace(/,+$/, '') + '\n';
          text[table] += spaces + spaces + '}';
        });

        // That's the end of attributes!
        text[table] += '}; // End of metadata\n';
        _callback(null);
      },
      function() {
        if (self.options.directory && self.options.overwrite) {
          return self.write(text, callback);
        }
        return callback(null, text);
      }
    );
  }
};

SequelizeMeta.prototype.write = function(attributes, callback) {
  const tables = _.keys(attributes);
  const self = this;

  function createFile(table, cb) {
    const filePath = path.join(self.options.directory, table + '.js');
    fs.writeFile(path.resolve(filePath), attributes[table], cb);
  }

  // Make sure the metadata folder exists!
  fs.mkdirSync(path.resolve(self.options.directory), { recursive: true });

  // Write the files!
  async.each(tables, createFile, callback);
};

module.exports = SequelizeMeta;
