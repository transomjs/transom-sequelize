import createDebug from "debug";
import createError from "http-errors";
import { DataTypes, Op } from "sequelize";
import type { DataType, FindOptions, OrderItem, Sequelize, WhereOptions } from "sequelize";
import type { TransomColumnOptions, TransomEntity, TransomModel, TransomRequest } from "../types";

const debug = createDebug("transom:sequelize:handlerUtils");

declare namespace HandlerUtils {
  /** A request's parameters split into column filters, operands (_skip, _sort...) and the rest. */
  interface SeparatedOperations {
    operands: Record<string, unknown>;
    attributes: Record<string, unknown>;
    extras: Record<string, unknown>;
  }

  /** The Sequelize options built from a request. */
  interface BuiltQuery extends Pick<FindOptions, "where" | "offset" | "limit" | "order"> {
    where: WhereOptions;
  }

  interface Functions {
    readonly OPERANDS: Readonly<Record<string, string>>;
    separateApiOperations(options: Record<string, unknown>, model: TransomModel): SeparatedOperations;
    /** Columns named in a comma-separated `_select`. Throws 400 for an unknown column. */
    processSelectOperator(model: TransomModel, select: unknown): { attributes: string[] };
    /** Filters, paging (_skip, _limit default 1000) and _sort from req.params. Throws 400 for bad input. */
    buildQuery(query: { op?: string }, req: TransomRequest, entity: TransomEntity): BuiltQuery;
    /** Converts a string to the column's type (number, boolean, Date...). Throws for invalid input. */
    getStrongTypeValue(val: unknown, attrMeta: TransomColumnOptions): unknown;
    /** The typed primary-key value. Throws 400 when missing, 500 for no or compound keys. */
    getStrongPkValue(id: unknown, model: TransomModel): unknown;
    /** The where clause for one query-string value: ~like, >, >=, <, <=, !not, [in,list], isnull, !isnull. */
    getDataTypeClause(model: TransomModel, key: string, value: unknown): unknown;
  }

  interface Options {
    sequelize?: Sequelize;
  }
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** A data type's key ("STRING", "INTEGER"...), or undefined for a type given as a plain string. */
function typeKey(type: DataType | undefined): string | undefined {
  return type === undefined || typeof type === "string" ? undefined : type.key;
}

/** Query string helpers. Options are accepted but unused. */
function HandlerUtils(_options?: HandlerUtils.Options): HandlerUtils.Functions {
  // Where _type == "csv" or "json", default json.
  const OPERANDS: Readonly<Record<string, string>> = {
    _skip: "_skip",
    _limit: "_limit",
    _sort: "_sort",
    _populate: "_populate",
    _select: "_select",
    _connect: "_connect",
    _keywords: "_keywords",
    _type: "_type",
  };

  function separateApiOperations(options: Record<string, unknown>, model: TransomModel): HandlerUtils.SeparatedOperations {
    const result: HandlerUtils.SeparatedOperations = {
      operands: {},
      attributes: {},
      extras: {},
    };

    // Split up the query into Attributes and Operands.
    for (const key in options) {
      if (hasOwn(model.rawAttributes, key)) {
        // Collecting Attributes.
        result.attributes[key] = options[key];
      } else if (Reflect.get(OPERANDS, key)) {
        // Collecting Operands. (A plain lookup, so inherited names like "toString" match too.)
        result.operands[key] = options[key];
      } else {
        // Anything else gets put on extras.
        result.extras[key] = options[key];
      }
    }
    return result;
  }

  function processSelectOperator(model: TransomModel, select: unknown): { attributes: string[] } {
    const result: { attributes: string[] } = {
      attributes: [],
    };
    // add selected columns only!
    if (select) {
      if (typeof select !== "string") {
        // e.g. ?_select=a&_select=b. Rejected, as before, by the caller's error handling.
        throw new TypeError("_select must be a single comma-delimited string");
      }
      const selectAttribs = select.split(",");
      selectAttribs.map((attrib) => {
        if (hasOwn(model.rawAttributes, attrib)) {
          result.attributes.push(attrib);
        } else {
          throw createError(400, "Invalid entry in the _select list: " + attrib);
        }
      });
    }
    return result;
  } // End of processSelectOperator

  /**
   * Builds the Sequelize query from the request's parameters.
   * @param query - only `op` is read; "count" skips paging and sorting.
   */
  function buildQuery(query: { op?: string }, req: TransomRequest, entity: TransomEntity): HandlerUtils.BuiltQuery {
    const model = entity.model;
    const meta = model.__meta;
    const options: Record<string, unknown> = req.params;
    const separated = separateApiOperations(options, model);
    const currentOps = separated.operands;
    const currentAttribs = separated.attributes;

    const where: Record<string, unknown> = {};

    try {
      for (const key in currentAttribs) {
        const attribValue = currentAttribs[key];
        const value: unknown[] = Array.isArray(attribValue) ? attribValue : [attribValue];
        const columnMeta = meta[key];
        if (columnMeta === undefined) {
          // Same error (and so the same 400 message) the untyped code produced.
          throw new TypeError("Cannot read properties of undefined (reading 'queryable')");
        }
        const isQueryable = columnMeta.queryable === false ? false : true;
        if (!isQueryable) {
          throw createError(400, `${model.name}.${key} is not a queryable attribute.`);
        }
        const attribWhere: unknown[] = [];
        for (const val of value) {
          // Add each value to the query clause
          const argWhere = getDataTypeClause(model, key, val);
          attribWhere.push(argWhere);
        }
        if (attribWhere.length === 1) {
          where[key] = attribWhere[0];
        } else if (attribWhere.length > 1) {
          where[key] = { [Op.and]: attribWhere };
        }
      }
    } catch (err) {
      if (hasStatus(err)) {
        throw err;
      } else {
        throw createError(400, "Unable to build query: " + (err instanceof Error ? err.message : String(err)));
      }
    }

    // Built only from the model's own columns and getDataTypeClause's operators.
    const args: HandlerUtils.BuiltQuery = { where: where as WhereOptions };

    //Apply the current query options
    if (query.op == "count") {
      //No Skip on count queries
      //No Limit on count queries
      //No Sort on count queries
      //No Select list on count queries
    } else {
      //Include Skip on query
      args.offset = Number(currentOps._skip || 0); // Don't skip any rows if amount not specified.

      //Include Limit on query
      args.limit = Number(currentOps._limit || 1000); // Apply a limit of 1000 if limit is not specified.

      //Apply Sort to the query by attribute(s).
      const sortOp = currentOps._sort;
      if (sortOp) {
        const order: OrderItem[] = [];
        args.order = order;
        let sortFields: unknown[];
        if (typeof sortOp === "string") {
          sortFields = sortOp.split(",");
        } else if (Array.isArray(sortOp)) {
          sortFields = sortOp;
        } else {
          // e.g. ?_sort[a]=b. Not iterable, so this failed before too.
          throw new TypeError("_sort must be a string or an array");
        }
        // Check that each field is valid, even the negated ones.
        for (const sortField of sortFields) {
          const sort = String(sortField);
          if (!hasOwn(model.rawAttributes, sort.replace("-", ""))) {
            throw createError(400, "Invalid sort attribute: " + sort);
          }
          if (sort.charAt(0) == "-") {
            order.push([sort.substring(1), "DESC"]); // Descending sort
          } else {
            // Sequelize accepts a one-element [column] (ascending); its types don't list it.
            order.push([sort] as unknown as OrderItem); // Ascending sort
          }
        }
      }
    }
    return args;
  } // End of buildQuery

  /**
   * Attempt to return the strongly typed value based on a string value.
   */
  function getStrongTypeValue(val: unknown, attrMeta: TransomColumnOptions): unknown {
    let retval: unknown;
    const key = typeKey(attrMeta.type);
    if (key === undefined) {
      // Same failure as before for a type given as a plain string (it has no .key).
      throw new TypeError("Cannot read properties of undefined (reading 'toLowerCase')");
    }

    switch (key.toLowerCase()) {
      case "boolean": {
        if (typeof val !== "string") {
          throw new TypeError("Boolean arguments can only be 'true' or 'false'");
        }
        const lower = val.toLowerCase();
        if (lower === "true" || lower === "false") {
          if (lower === "true") {
            retval = Boolean(true);
          } else {
            retval = Boolean(false);
          }
        } else {
          throw new Error("Boolean arguments can only be 'true' or 'false'");
        }
        break;
      }

      case "number":
      case "tinyint":
      case "smallint":
      case "mediumint":
      case "integer":
      case "bigint":
      case "float":
      case "real":
      case "double precision":
      case "double":
      case "decimal":
      case "numeric": {
        const num = parseFloat(String(val));
        if (!isFinite(num)) {
          throw new Error("Invalid numeric format");
        }
        retval = num;
        break;
      }

      case "dateonly": {
        // Sample "2014-01-31" or "2014-01-31T12:30:58.123"
        const str = typeof val === "string" ? val : "";
        if (str.length == 10 || str.length == 16 || str.length == 19 || str.length == 23) {
          const date = str.length == 10 ? new Date(str + "T00:00:00") : new Date(str);
          if (date.toString() === "Invalid Date") {
            throw new Error("Invalid date string");
          }
          retval = date;
        } else {
          throw new Error("Invalid string length for date-only parsing");
        }
        break;
      }
      case "date":
      case "time": {
        // Sample "2014-01-31" or "2014-01-31T12:30:58.123Z"
        const str = typeof val === "string" ? val : "";
        if (str.length == 10 || str.length == 24) {
          //parse the year month date.
          const date = str.length == 10 ? new Date(str + "T00:00:00.000Z") : new Date(str);
          if (date.toString() === "Invalid Date") {
            throw new Error("Invalid date string");
          }
          retval = date;
        } else {
          throw new Error("Invalid string length for date parsing"); // Bad format, don't bother
        }
        break;
      }

      case "char":
      case "text":
      case "string":
        if (attrMeta.unicode === false) {
          // Sidestep the default "N" prefix in MSSQL on VARCHAR columns!
          retval = new String(val);
        } else {
          retval = val; // no change
        }
        break;
      default:
        retval = val;
        break;
    }
    return retval;
  } // End of getStrongTypeValue

  /**
   * Convert string PK value to the appropriate datatype based on Model metadata.
   * Throw errors if the model defines anything other than a single PK column.
   */
  function getStrongPkValue(id: unknown, model: TransomModel): unknown {
    if (id == null) {
      debug(`Id was not provided in ${model.name} operation.`);
      throw createError(400, "ID is required");
    }
    const [pkName, ...others] = model.primaryKeyAttributes;
    if (pkName === undefined) {
      debug(`Sequelize model ${model.name} does not include an attribute identified as the primary key.`);
      throw createError(500, "Primary key not defined");
    }
    if (others.length > 0) {
      debug(
        `Sequelize model ${model.name} has multiple attributes(${model.primaryKeyAttributes.join(", ")}) defined as primary key.`,
      );
      throw createError(500, "PK operations not currently supported on compound keys");
    }
    const pkMeta = model.rawAttributes[pkName];
    if (pkMeta === undefined) {
      throw new TypeError(`Primary key '${pkName}' has no attribute definition`);
    }
    const pkId = getStrongTypeValue(id, pkMeta);
    return pkId;
  } // End of getStrongPkValue

  /**
   * The clause for one value, typed for the column. Throws for an invalid value.
   * Only string values use the operator prefixes; anything else is a plain equals.
   */
  function getDataTypeClause(model: TransomModel, key: string, value: unknown): unknown {
    let arg: unknown = {};
    const attribMeta = model.rawAttributes[key];
    if (attribMeta === undefined) {
      throw new TypeError(`'${key}' is not an attribute of ${model.name}`);
    }
    const datatypeKey = typeKey(attribMeta.type);
    const str = typeof value === "string" ? value : undefined;
    if (str !== undefined && "~" === str[0]) {
      if (datatypeKey === DataTypes.STRING.key || datatypeKey === DataTypes.TEXT.key || datatypeKey === DataTypes.CHAR.key) {
        let likeStr;
        if (">" === str[1]) {
          // Begins with
          likeStr = `${str.substring(2)}%`;
        } else if ("<" === str[1]) {
          // Ends with
          likeStr = `%${str.substring(2)}`;
        } else {
          // Contains
          likeStr = `%${str.substring(1)}%`;
        }
        arg = { [Op.like]: getStrongTypeValue(likeStr, attribMeta) };
      } else {
        throw new Error("Like operator is only allowed on string/text/char attributes");
      }
    } else if (str !== undefined && ">" === str[0]) {
      if ("=" === str[1]) {
        // Greater than or Equals
        arg = {
          [Op.gte]: getStrongTypeValue(str.substring(2), attribMeta),
        };
      } else {
        // Greater than
        arg = {
          [Op.gt]: getStrongTypeValue(str.substring(1), attribMeta),
        };
      }
    } else if (str !== undefined && "<" === str[0]) {
      if ("=" === str[1]) {
        // Less than or Equals
        arg = {
          [Op.lte]: getStrongTypeValue(str.substring(2), attribMeta),
        };
      } else {
        // Less than
        arg = {
          [Op.lt]: getStrongTypeValue(str.substring(1), attribMeta),
        };
      }
    } else if (String(value).toLowerCase() === "!isnull") {
      // Not Null
      arg = {
        [Op.ne]: null,
      };
    } else if (str !== undefined && "!" === str[0]) {
      //Not Equals
      arg = {
        [Op.ne]: getStrongTypeValue(str.substring(1), attribMeta),
      };
    } else if (str !== undefined && "[" === str[0] && "]" === str[str.length - 1]) {
      // In-list
      const list = str.substring(1, str.length - 1).split(",");
      const strongList: unknown[] = [];
      for (const item of list) {
        const strongItem = getStrongTypeValue(item, attribMeta);
        strongList.push(strongItem);
      }
      arg = {
        [Op.in]: strongList,
      };
    } else {
      // Simple Equals
      if (String(value).toLowerCase() === "isnull") {
        arg = null;
      } else {
        arg = getStrongTypeValue(value, attribMeta);
      }
    }
    return arg;
  } // End of getDataTypeClause

  return {
    OPERANDS,
    separateApiOperations,
    processSelectOperator,
    buildQuery,
    getStrongTypeValue,
    getStrongPkValue,
    getDataTypeClause,
  };
}

/** Errors thrown by http-errors, or anything else carrying an HTTP status. */
function hasStatus(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (Boolean(Reflect.get(err, "status")) || Boolean(Reflect.get(err, "statusCode")))
  );
}

export = HandlerUtils;
