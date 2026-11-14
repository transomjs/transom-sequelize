import async from "async";
import fs from "fs";
import path from "path";
import _ from "lodash";
import { QueryTypes } from "sequelize";
import type { QueryInterface, Sequelize } from "sequelize";
import * as dialectModule from "./dialects";
import type { Dialect } from "./dialects";

const dialects: Readonly<Record<string, Dialect | undefined>> = dialectModule;

declare namespace SequelizeMeta {
  /** A foreign-key row from the dialect's query, with the flags SequelizeMeta adds. */
  interface ForeignKeyRef {
    [key: string]: unknown;
    isForeignKey?: boolean;
    isUnique?: boolean;
    isPrimaryKey?: boolean;
    isSerialKey?: boolean;
    foreignSources?: Record<string, unknown>;
  }

  /** One column from describeTable(), plus its foreign-key details. */
  interface ColumnInfo {
    [attr: string]: unknown;
    type: string;
    defaultValue?: unknown;
    /** Postgres ENUM values. */
    special?: unknown;
    foreignKey?: ForeignKeyRef;
  }

  interface Options {
    /** Indent with spaces instead of tabs. */
    spaces?: boolean;
    /** Write the files (only when `directory` is set too). */
    overwrite?: boolean;
    /** camelCase property names (with `field` set to the column name). */
    camelCase?: boolean;
    indentation?: number;
    directory?: string;
    additional?: {
      timestamps?: boolean;
      createdAt?: string | boolean;
      updatedAt?: string | boolean;
      deletedAt?: string | boolean;
    };
    freezeTableName?: boolean;
    /** Only these tables. */
    tables?: string[];
    /** All tables except these (when `tables` isn't set). */
    skipTables?: string[];
    schema?: string;
    dialect?: string;
    storage?: string;
  }

  type Callback = (err?: unknown, text?: Record<string, string>) => void;
}

/** Sequelize's runtime options. Not in its type definitions; read for dialect and database. */
function runtimeOptions(sequelize: Sequelize): Record<string, unknown> {
  const options: unknown = Reflect.get(sequelize, "options");
  return typeof options === "object" && options !== null ? { ...options } : {};
}

/** The string, lower-cased; "" for a falsy value. Other values have no toLowerCase, as before. */
function lowerOf(value: unknown): string {
  if (!value) {
    return "";
  }
  if (typeof value !== "string") {
    throw new TypeError(`Expected a string column attribute, got ${typeof value}`);
  }
  return value.toLowerCase();
}

/**
 * Reads the database schema and writes one metadata module per table
 * (`<directory>/<table>.js`) with the Sequelize column definitions.
 */
class SequelizeMeta {
  sequelize: Sequelize;
  queryInterface: QueryInterface;
  apiTables: Record<string, Record<string, SequelizeMeta.ColumnInfo>>;
  foreignKeys: Record<string, Record<string, SequelizeMeta.ForeignKeyRef>>;
  dialect: Dialect | undefined;
  options: SequelizeMeta.Options & Required<Pick<SequelizeMeta.Options, "indentation" | "additional">>;

  constructor(sequelize: Sequelize, options?: SequelizeMeta.Options) {
    if (options && options.dialect === "sqlite") {
      options.storage = options.storage || "sequelize";
    }
    this.sequelize = sequelize;
    this.queryInterface = this.sequelize.getQueryInterface();
    this.apiTables = {};
    this.foreignKeys = {};
    this.dialect = dialects[String(runtimeOptions(this.sequelize).dialect)];

    this.options = _.extend(
      {
        spaces: false,
        overwrite: true,
        camelCase: true,
        indentation: 1,
        directory: "./sequelize-meta",
        additional: {},
        freezeTableName: true,
      },
      options || {},
    );
  }

  build(callback: (err?: unknown) => void): void {
    const self = this;

    function mapTable(table: string, cb: (err?: unknown) => void): void {
      self.queryInterface.describeTable(table, self.options.schema).then(function (fields) {
        const columns: Record<string, SequelizeMeta.ColumnInfo> = {};
        for (const [name, column] of Object.entries(fields)) {
          columns[name] = { ...column };
        }
        self.apiTables[table] = columns;
        cb();
      }, cb);
    }

    const dialect = self.dialect;
    if (self.options.dialect === "postgres" && self.options.schema && dialect?.showTablesQuery) {
      const showTablesSql = dialect.showTablesQuery(self.options.schema);
      self.sequelize
        .query(showTablesSql, {
          raw: true,
          type: QueryTypes.SHOWTABLES,
        })
        .then(function (tableNames: unknown) {
          processTables(_.flatten(Array.isArray(tableNames) ? tableNames : [tableNames]));
        }, callback);
    } else {
      this.queryInterface.showAllTables().then(processTables, callback);
    }

    function processTables(allTables: unknown[]): void {
      let names: unknown[] = allTables;
      if (runtimeOptions(self.sequelize).dialect === "mssql") {
        names = _.map(allTables, "tableName");
      }
      const tableNames = names.map((name) => String(name));

      let tables: string[];
      if (self.options.tables) {
        tables = _.intersection(tableNames, self.options.tables);
      } else if (self.options.skipTables) {
        tables = _.difference(tableNames, self.options.skipTables);
      } else {
        tables = tableNames;
      }

      async.each(tables, mapForeignKeys, mapTables);

      function mapTables(err?: unknown): void {
        if (err) {
          console.error(err);
        }
        async.each(tables, mapTable, callback);
      }
    }

    function mapForeignKeys(table: string, fn: (err?: unknown) => void): void {
      const dialect = self.dialect;
      if (!dialect) {
        return fn();
      }

      const sql = dialect.getForeignKeysQuery(table, self.sequelize.config.database);

      self.sequelize
        .query(sql, {
          type: QueryTypes.SELECT,
          raw: true,
        })
        .then(function (res: object[]) {
          _.each(res, (row) => assignColumnDetails(dialect, row));
          fn();
        }, fn);

      function assignColumnDetails(dialect: Dialect, row: object): void {
        // map sqlite's PRAGMA results
        const mapped = _.mapKeys(row, function (_value, key) {
          switch (key) {
            case "from":
              return "source_column";
            case "to":
              return "target_column";
            case "table":
              return "target_table";
            default:
              return key;
          }
        });

        const database = runtimeOptions(self.sequelize).database;
        const ref: SequelizeMeta.ForeignKeyRef = _.assign(
          {
            source_table: table,
            source_schema: database,
            target_schema: database,
          },
          mapped,
        );

        if (!_.isEmpty(_.trim(_.toString(ref.source_column))) && !_.isEmpty(_.trim(_.toString(ref.target_column)))) {
          ref.isForeignKey = true;
          ref.foreignSources = _.pick(ref, [
            "source_table",
            "source_schema",
            "target_schema",
            "target_table",
            "source_column",
            "target_column",
          ]);
        }
        if (_.isFunction(dialect.isUnique) && dialect.isUnique(ref)) {
          ref.isUnique = true;
        }
        if (_.isFunction(dialect.isPrimaryKey) && dialect.isPrimaryKey(ref)) {
          ref.isPrimaryKey = true;
        }
        if (_.isFunction(dialect.isSerialKey) && dialect.isSerialKey(ref)) {
          ref.isSerialKey = true;
        }

        const sourceColumn = String(ref.source_column);
        const tableKeys = (self.foreignKeys[table] = self.foreignKeys[table] || {});
        tableKeys[sourceColumn] = _.assign({}, tableKeys[sourceColumn], ref);
      }
    }
  }

  run(callback: SequelizeMeta.Callback): void {
    const self = this;
    const text: Record<string, string> = {};

    this.build(generateText);

    function generateText(err?: unknown): void {
      if (err) {
        console.error(err);
      }

      async.each(
        _.keys(self.apiTables),
        function (table, _callback) {
          const columns = self.apiTables[table] ?? {};
          const fields = _.keys(columns);
          // Spaces or Tabs?
          let spaces = "";
          for (let x = 0; x < self.options.indentation; ++x) {
            spaces += self.options.spaces === true ? " " : "\t";
          }

          let out = "";
          out += "// ******************************************************\n";
          out += "// ** This is a generated file. Do not modify by hand. **\n";
          out += "// ******************************************************\n";
          out += "const Sequelize = require('sequelize');\n";
          out += "const DataTypes = Sequelize.DataTypes;\n\n";

          out += "module.exports = {\n";

          _.each(fields, function (field, i) {
            const column = columns[field];
            if (column === undefined) {
              return true;
            }
            const additional = self.options.additional;
            if (additional && additional.timestamps !== undefined && additional.timestamps) {
              if (
                (additional.createdAt && field === "createdAt") ||
                additional.createdAt === field ||
                (additional.updatedAt && field === "updatedAt") ||
                additional.updatedAt === field ||
                (additional.deletedAt && field === "deletedAt") ||
                additional.deletedAt === field
              ) {
                return true;
              }
            }
            // Find foreign key
            const tableKeys = self.foreignKeys[table];
            const foreignKey = tableKeys && tableKeys[field] ? tableKeys[field] : null;

            if (_.isObject(foreignKey)) {
              column.foreignKey = foreignKey;
            }

            if (i > 0) {
              out += ",\n";
            }

            // column's attributes
            const fieldAttr = _.keys(column);
            const fieldName = self.options.camelCase ? _.camelCase(field) : field;
            out += spaces + spaces + fieldName + ": {\n";

            // Serial key for postgres...
            let defaultVal = column.defaultValue;
            let isUnicodeString: boolean | null = null;
            let dateonlyGetter: boolean | null = null;

            // ENUMs for postgres...
            if (column.type === "USER-DEFINED" && !!column.special) {
              const special: unknown[] = Array.isArray(column.special) ? column.special : [];
              column.type =
                "ENUM(" +
                special
                  .map(function (f) {
                    return `"${String(f)}"`;
                  })
                  .join(",") +
                ")";
            }

            const isUnique = column.foreignKey && column.foreignKey.isUnique;

            _.each(fieldAttr, function (attr) {
              const isSerialKey =
                column.foreignKey &&
                _.isFunction(self.dialect?.isSerialKey) &&
                self.dialect?.isSerialKey?.(column.foreignKey);

              // We don't need the special attribute from postgresql describe table..
              if (attr === "special") {
                return true;
              }

              const attrValue = column[attr];

              if (attr === "foreignKey") {
                if (isSerialKey) {
                  out += spaces + spaces + spaces + "autoIncrement: true";
                } else if (foreignKey?.isForeignKey) {
                  const sources = column.foreignKey?.foreignSources ?? {};
                  out += spaces + spaces + spaces + "references: {\n";
                  out += spaces + spaces + spaces + spaces + `model: '${String(sources.target_table)}',\n`;
                  out += spaces + spaces + spaces + spaces + `key: '${String(sources.target_column)}'\n`;
                  out += spaces + spaces + spaces + "}";
                } else {
                  return true;
                }
              } else if (attr === "autoIncrement") {
                if (
                  attrValue === true &&
                  (!_.has(column, "foreignKey") || (_.has(column, "foreignKey") && !!column.foreignKey?.isPrimaryKey))
                ) {
                  out += spaces + spaces + spaces + "autoIncrement: true";
                } else {
                  return true;
                }
              } else if (attr === "primaryKey") {
                if (
                  attrValue === true &&
                  (!_.has(column, "foreignKey") || (_.has(column, "foreignKey") && !!column.foreignKey?.isPrimaryKey))
                ) {
                  out += spaces + spaces + spaces + "primaryKey: true";
                } else {
                  return true;
                }
              } else if (attr === "allowNull") {
                out += spaces + spaces + spaces + `${attr}: ${String(attrValue)}`;
              } else if (attr === "defaultValue") {
                if (
                  runtimeOptions(self.sequelize).dialect === "mssql" &&
                  typeof defaultVal === "string" &&
                  defaultVal.toLowerCase() === "(newid())"
                ) {
                  defaultVal = null; // disable adding "default value" attribute for UUID fields if generating for MS SQL
                }

                let defaultValueText: unknown = defaultVal;

                // AutoIncrement columns don't get a default value!
                if (isSerialKey) {
                  return true;
                }

                if (column.type.toLowerCase() === "bit(1)") {
                  //mySql Bit fix
                  defaultValueText = defaultVal === "b'1'" ? 1 : 0;
                } else if (runtimeOptions(self.sequelize).dialect === "mssql" && column.type.toLowerCase() === "bit") {
                  // mssql bit fix
                  defaultValueText = defaultVal === "((1))" ? 1 : 0;
                }

                if (_.isString(defaultVal)) {
                  const fieldType = column.type.toLowerCase();
                  if (_.endsWith(defaultVal, "()")) {
                    defaultValueText = "Sequelize.fn('" + defaultVal.replace(/\(\)$/, "") + "')";
                  } else if (_.startsWith(defaultVal, "(") && _.endsWith(defaultVal, "())")) {
                    // e.g. "(getdate())"
                    defaultValueText = "Sequelize.fn('" + defaultVal.replace(/[()]/g, "") + "')";
                  } else if (fieldType.indexOf("date") === 0 || fieldType.indexOf("timestamp") === 0) {
                    if (
                      _.includes(
                        ["current_timestamp", "current_date", "current_time", "localtime", "localtimestamp"],
                        defaultVal.toLowerCase(),
                      )
                    ) {
                      defaultValueText = `Sequelize.literal('${defaultVal}')`;
                    } else {
                      defaultValueText = `"${String(defaultValueText)}"`;
                    }
                  } else {
                    defaultValueText = `"${String(defaultValueText)}"`;
                  }
                }

                if (defaultVal === null || defaultVal === undefined) {
                  // No default!
                  return true;
                } else {
                  // A string that matches "Sequelize.literal('bar')" should be escaped.
                  const requiresEscape =
                    _.isString(defaultValueText) && !defaultValueText.match(/^Sequelize\.[^(]+\(.*\)$/);
                  defaultValueText =
                    requiresEscape && _.isString(defaultValueText)
                      ? self.sequelize.escape(_.trim(defaultValueText, '"'))
                      : defaultValueText;

                  // don't prepend N for MSSQL when building models...
                  defaultValueText = _.trimStart(_.toString(defaultValueText), "N");
                  out += spaces + spaces + spaces + attr + ": " + String(defaultValueText);
                }
              } else if (attr === "type" && column.type.indexOf("ENUM") === 0) {
                out += spaces + spaces + spaces + attr + ": DataTypes." + column.type;
              } else {
                const attrLower = lowerOf(attrValue);
                let val = `"${String(attrValue)}"`;

                if (attrLower === "boolean" || attrLower === "bit(1)" || attrLower === "bit") {
                  val = "DataTypes.BOOLEAN";
                } else if (attrLower.match(/^(smallint|mediumint|tinyint|int)/)) {
                  const length = attrLower.match(/\(\d+\)/);
                  val = "DataTypes.INTEGER" + (!_.isNull(length) ? String(length) : "");

                  const unsigned = attrLower.match(/unsigned/i);
                  if (unsigned) {
                    val += ".UNSIGNED";
                  }
                  const zero = attrLower.match(/zerofill/i);
                  if (zero) {
                    val += ".ZEROFILL";
                  }
                } else if (attrLower.match(/^bigint/)) {
                  val = "DataTypes.BIGINT";
                } else if (attrLower.match(/^varchar/)) {
                  const length = attrLower.match(/\(\d+\)/);
                  val = "DataTypes.STRING" + (!_.isNull(length) ? String(length) : "");
                  // It's a String but it's NOT unicode!
                  isUnicodeString = false;
                } else if (attrLower.match(/^string|varying|nvarchar/)) {
                  val = "DataTypes.STRING";
                  // It's a String AND it's unicode!
                  if (attrLower.match(/^nvarchar/)) {
                    isUnicodeString = true;
                  }
                } else if (attrLower.match(/^char/)) {
                  const length = attrLower.match(/\(\d+\)/);
                  val = "DataTypes.CHAR" + (!_.isNull(length) ? String(length) : "");
                } else if (attrLower.match(/^real/)) {
                  val = "DataTypes.REAL";
                } else if (attrLower.match(/text|ntext$/)) {
                  val = "DataTypes.TEXT";
                } else if (attrLower === "date") {
                  val = "DataTypes.DATEONLY";
                  dateonlyGetter = true;
                } else if (attrLower.match(/^(date|timestamp)/)) {
                  val = "DataTypes.DATE";
                } else if (attrLower.match(/^(time)/)) {
                  val = "DataTypes.TIME";
                } else if (attrLower.match(/^(float|float4)/)) {
                  val = "DataTypes.FLOAT";
                } else if (attrLower.match(/^decimal/)) {
                  val = "DataTypes.DECIMAL";
                } else if (attrLower.match(/^(float8|double precision|numeric)/)) {
                  val = "DataTypes.DOUBLE";
                } else if (attrLower.match(/^uuid|uniqueidentifier/)) {
                  val = "DataTypes.UUIDV4";
                } else if (attrLower.match(/^jsonb/)) {
                  val = "DataTypes.JSONB";
                } else if (attrLower.match(/^json/)) {
                  val = "DataTypes.JSON";
                } else if (attrLower.match(/^geometry/)) {
                  val = "DataTypes.GEOMETRY";
                }
                out += spaces + spaces + spaces + attr + ": " + val;
              }
              out += ",\n";
              return undefined;
            });

            // Allows us to sidestep the default Sequelize MSSQL Unicode parameter prefix!
            if (isUnicodeString !== null) {
              out += spaces + spaces + spaces + "unicode: " + String(isUnicodeString) + ",\n";
            }

            // Append a zero-time component to the non-UTC date only fields.
            // E.g. Compare the following:
            // console.log(new Date('2012-03-21'), 'vs', new Date('2012-03-21T00:00:00'));
            if (dateonlyGetter) {
              out +=
                spaces +
                spaces +
                spaces +
                `get: function(name) {${" "}
${spaces + spaces + spaces + spaces}let result = this.getDataValue(name);
${spaces + spaces + spaces + spaces}if (result && typeof result === 'string') { result += 'T00:00:00'; }
${spaces + spaces + spaces + spaces}return result;
${spaces + spaces + spaces}},\n`;
            }

            if (isUnique) {
              out += spaces + spaces + spaces + "unique: true,\n";
            }

            if (self.options.camelCase) {
              out += spaces + spaces + spaces + "field: '" + field + "',\n";
            }

            // Remove the last `,` within the attribute options
            out = out.trim().replace(/,+$/, "") + "\n";
            out += spaces + spaces + "}";
            return undefined;
          });

          // That's the end of attributes!
          out += "}; // End of metadata\n";
          text[table] = out;
          _callback(null);
        },
        function () {
          if (self.options.directory && self.options.overwrite) {
            return self.write(text, callback);
          }
          return callback(null, text);
        },
      );
    }
  }

  write(attributes: Record<string, string>, callback: (err?: unknown) => void): void {
    const tables = _.keys(attributes);
    const self = this;
    const directory = String(self.options.directory);

    function createFile(table: string, cb: (err?: unknown) => void): void {
      const filePath = path.join(directory, table + ".js");
      fs.writeFile(path.resolve(filePath), attributes[table] ?? "", cb);
    }

    // Make sure the metadata folder exists!
    fs.mkdirSync(path.resolve(directory), { recursive: true });

    // Write the files!
    async.each(tables, createFile, callback);
  }
}

export = SequelizeMeta;
