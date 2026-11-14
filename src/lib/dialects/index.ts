import { Utils } from "sequelize";
import _ from "lodash";

/** Per-dialect SQL and helpers for reading key details from information_schema. */
export interface Dialect {
  /** SQL that returns all foreign keys of a table. */
  getForeignKeysQuery(tableName: string, schemaName?: string): string;
  /** Is the row from getForeignKeysQuery an actual foreign key? */
  isForeignKey?(record: unknown): boolean;
  /** Is the row from getForeignKeysQuery a unique key? */
  isUnique?(record: unknown): boolean;
  /** Is the row from getForeignKeysQuery an actual primary key? */
  isPrimaryKey?(record: unknown): boolean;
  /** Is the row from getForeignKeysQuery a serial/auto-increment key? */
  isSerialKey?(record: unknown): boolean;
  /** Replaces Sequelize's own table listing, to support a custom schema. */
  showTablesQuery?(schema: string): string;
}

/** The value of `key` on a row, or undefined when `record` isn't an object. */
function field(record: unknown, key: string): unknown {
  return _.isObject(record) ? Reflect.get(record, key) : undefined;
}

export const sqlite: Dialect = {
  getForeignKeysQuery(tableName: string): string {
    return `PRAGMA foreign_key_list(${tableName});`;
  },

  isPrimaryKey(record: unknown): boolean {
    return _.isObject(record) && _.has(record, "primaryKey") && field(record, "primaryKey") === true;
  },
};

export const mysql: Dialect = {
  getForeignKeysQuery(tableName: string, schemaName?: string): string {
    return `SELECT K.CONSTRAINT_NAME as constraint_name
      , K.CONSTRAINT_SCHEMA as source_schema
      , K.TABLE_SCHEMA as source_table
      , K.COLUMN_NAME as source_column
      , K.REFERENCED_TABLE_SCHEMA AS target_schema
      , K.REFERENCED_TABLE_NAME AS target_table
      , K.REFERENCED_COLUMN_NAME AS target_column
      , C.extra AS extra
      , C.COLUMN_KEY AS column_key
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE AS K
      LEFT JOIN INFORMATION_SCHEMA.COLUMNS AS C
        ON C.TABLE_NAME = K.TABLE_NAME AND C.COLUMN_NAME = K.COLUMN_NAME
      WHERE K.TABLE_NAME = '${tableName}'
        AND K.CONSTRAINT_SCHEMA = '${schemaName}'
        AND C.TABLE_SCHEMA = '${schemaName}';`;
  },

  isForeignKey(record: unknown): boolean {
    return _.isObject(record) && _.has(record, "extra") && field(record, "extra") !== "auto_increment";
  },

  isUnique(record: unknown): boolean {
    // COLUMN_KEY is always a string here (the WHERE on C makes the join inner).
    const columnKey = field(record, "column_key");
    return (
      _.isObject(record) &&
      _.has(record, "column_key") &&
      typeof columnKey === "string" &&
      columnKey.toUpperCase() === "UNI"
    );
  },

  isPrimaryKey(record: unknown): boolean {
    return _.isObject(record) && _.has(record, "constraint_name") && field(record, "constraint_name") === "PRIMARY";
  },

  isSerialKey(record: unknown): boolean {
    return _.isObject(record) && _.has(record, "extra") && field(record, "extra") === "auto_increment";
  },
};

export const mariadb: Dialect = mysql;

export const postgres: Dialect = {
  getForeignKeysQuery(tableName: string): string {
    return `SELECT
      o.conname AS constraint_name,
      (SELECT nspname FROM pg_namespace WHERE oid=m.relnamespace) AS source_schema,
      m.relname AS source_table,
      (SELECT a.attname FROM pg_attribute a
        WHERE a.attrelid = m.oid AND a.attnum = o.conkey[1] AND a.attisdropped = false) AS source_column,
      (SELECT nspname FROM pg_namespace WHERE oid=f.relnamespace) AS target_schema,
      f.relname AS target_table,
      (SELECT a.attname FROM pg_attribute a
        WHERE a.attrelid = f.oid AND a.attnum = o.confkey[1] AND a.attisdropped = false) AS target_column,
      o.contype,
      (SELECT d.adsrc AS extra FROM pg_catalog.pg_attribute a
        LEFT JOIN pg_catalog.pg_attrdef d ON (a.attrelid, a.attnum) = (d.adrelid,  d.adnum)
        WHERE NOT a.attisdropped AND a.attnum > 0 AND a.attrelid = o.conrelid AND a.attnum = o.conkey[1] LIMIT 1)
    FROM pg_constraint o
    LEFT JOIN pg_class c ON c.oid = o.conrelid
    LEFT JOIN pg_class f ON f.oid = o.confrelid
    LEFT JOIN pg_class m ON m.oid = o.conrelid
    WHERE o.conrelid = (SELECT oid FROM pg_class WHERE relname = '${tableName}' LIMIT 1)`;
  },

  isForeignKey(record: unknown): boolean {
    return _.isObject(record) && _.has(record, "contype") && field(record, "contype") === "f";
  },

  isUnique(record: unknown): boolean {
    return _.isObject(record) && _.has(record, "contype") && field(record, "contype") === "u";
  },

  isPrimaryKey(record: unknown): boolean {
    return _.isObject(record) && _.has(record, "contype") && field(record, "contype") === "p";
  },

  isSerialKey(record: unknown): boolean {
    // lodash's string functions read null/undefined as "", the same as _.toString.
    const extra = _.toString(field(record, "extra"));
    return (
      _.isObject(record) &&
      postgres.isPrimaryKey?.(record) === true &&
      _.has(record, "extra") &&
      _.startsWith(extra, "nextval") &&
      _.includes(extra, "_seq") &&
      _.includes(extra, "::regclass")
    );
  },

  showTablesQuery(schema: string): string {
    const query = `SELECT table_name FROM information_schema.tables WHERE table_schema = '${schema}' AND table_type LIKE '%TABLE' AND table_name != 'spatial_ref_sys';`;
    return query;
  },
};

export const mssql: Dialect = {
  getForeignKeysQuery(tableName: string): string {
    return (
      "SELECT \
      ccu.table_name AS source_table, \
      ccu.constraint_name AS constraint_name, \
      ccu.column_name AS source_column, \
      kcu.table_name AS target_table, \
      kcu.column_name AS target_column, \
      tc.constraint_type AS constraint_type, \
      c.is_identity AS is_identity \
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc \
    INNER JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu \
      ON ccu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME \
    LEFT JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc \
      ON ccu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME \
    LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu \
      ON kcu.CONSTRAINT_NAME = rc.UNIQUE_CONSTRAINT_NAME AND tc.CONSTRAINT_TYPE = 'FOREIGN KEY' \
    INNER JOIN sys.COLUMNS c \
      ON c.name = ccu.column_name \
      AND c.object_id = OBJECT_ID(ccu.table_name) \
    WHERE ccu.table_name = " + Utils.addTicks(tableName, "'")
    );
  },

  isForeignKey(record: unknown): boolean {
    return _.isObject(record) && _.has(record, "constraint_type") && field(record, "constraint_type") === "FOREIGN KEY";
  },

  isPrimaryKey(record: unknown): boolean {
    return _.isObject(record) && _.has(record, "constraint_type") && field(record, "constraint_type") === "PRIMARY KEY";
  },

  isSerialKey(record: unknown): boolean {
    return (
      _.isObject(record) &&
      mssql.isPrimaryKey?.(record) === true &&
      _.has(record, "is_identity") &&
      Boolean(field(record, "is_identity"))
    );
  },
};
