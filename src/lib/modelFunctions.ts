import createDebug from "debug";
import createError from "http-errors";
import type { FindOptions, Model, Sequelize, WhereOptions } from "sequelize";
import HandlerUtils from "./handlerUtils";
import HandlerAcl from "./handlerAcl";
import type { TransomEntity, TransomRequest, TransomServerLike } from "../types";

const debug = createDebug("transom:sequelize:functions");

declare namespace ModelFunctions {
  /** A model function. Also the shape of a route's `fx` override. */
  type Fx<T> = (server: TransomServerLike, entity: TransomEntity, req: TransomRequest, skipAcl?: boolean) => Promise<T>;

  /** The result of the delete functions: the number of rows deleted. */
  interface DeleteResult {
    data: { deleted: number };
  }

  interface Functions {
    /** findAll() with the request's filters, paging, _sort, _select and ACL applied. */
    modelFind: Fx<{ items: Model[] }>;
    /** Looks up req.params.__id (with _select and ACL). Rejects with 404 when not found. */
    modelFindById: Fx<Model>;
    modelCount: Fx<{ count: number }>;
    /**
     * Creates a row from req.body (plus nextVal(), ACL defaults and audit fields).
     * Body fields that aren't columns are dropped and returned as skippedFields.
     */
    modelInsert: Fx<{ item: Model; skippedFields: string[] }>;
    /** Deletes the rows matching the request's filters. */
    modelDelete: Fx<DeleteResult>;
    modelDeleteById: Fx<DeleteResult>;
    /** Deletes the ids listed in req.body[<primary key>] (an array or one string). */
    modelDeleteBatch: Fx<DeleteResult>;
    /** Updates req.params.__id with req.body (plus audit fields). Rejects with 404 when not found. */
    modelUpdateById: Fx<Model>;
  }

  interface Options {
    sequelize: Sequelize;
  }
}

/** The model functions behind the generated routes. */
function ModelFunctions(options: ModelFunctions.Options): ModelFunctions.Functions {
  const sequelize = options.sequelize;
  const handlerUtils = HandlerUtils({
    sequelize,
  });

  const handlerAcl = HandlerAcl({
    sequelize,
  });

  function modelFind(_server: TransomServerLike, entity: TransomEntity, req: TransomRequest, skipAcl?: boolean) {
    const model = entity.model;
    let query: FindOptions;
    try {
      query = handlerUtils.buildQuery({}, req, entity);
      if (entity.model.options.needsAcl && !skipAcl) {
        query = handlerAcl.addAclFind(model, query, req);
      }

      // Used for Select.
      const separated = handlerUtils.separateApiOperations(req.query, model);
      const operations = separated.operands || {};
      const selectOpts = handlerUtils.processSelectOperator(model, operations["_select"]);

      // Apply the select list.
      if (selectOpts.attributes && selectOpts.attributes.length > 0) {
        query.attributes = selectOpts.attributes;
      }
    } catch (err) {
      debug(`Error building query for ${entity.modelName} model findAll()`, err);
      return Promise.reject(err);
    }

    return model
      .findAll(query)
      .then((items) => {
        debug("Fetching findAll() completed.");
        return {
          items,
        };
      })
      .catch((err: unknown) => {
        debug(`Error executing ${entity.modelName} model findAll()`, err);
        throw err;
      });
  }

  function modelFindById(_server: TransomServerLike, entity: TransomEntity, req: TransomRequest, skipAcl?: boolean) {
    const model = entity.model;
    let queryOptions: FindOptions & { where?: WhereOptions } = {};
    let id: unknown;

    try {
      id = handlerUtils.getStrongPkValue(req.params.__id, model);

      // Used for Select.
      const separated = handlerUtils.separateApiOperations(req.query, model);
      const operations = separated.operands || {};
      const selectOpts = handlerUtils.processSelectOperator(model, operations["_select"]);

      // Apply the select list.
      if (selectOpts.attributes && selectOpts.attributes.length > 0) {
        queryOptions.attributes = selectOpts.attributes;
      }
    } catch (err) {
      debug(`Error building query for ${entity.modelName} model findById()`, err);
      return Promise.reject(err);
    }

    return Promise.resolve(model.primaryKeyAttribute)
      .then((pkCol) => {
        queryOptions.where = { ...queryOptions.where, [pkCol]: id };

        if (entity.model.options.needsAcl && !skipAcl) {
          // This assigned an undeclared variable (`qry`) before, so every ACL findById
          // failed with a ReferenceError (sent as 400). It now applies the ACL as intended.
          queryOptions = handlerAcl.addAclFind(model, queryOptions, req);
        }

        return model.findOne(queryOptions);
      })
      .then((item) => {
        if (!item) {
          throw createError(404, "Not Found");
        }
        return item;
      })
      .catch((err: unknown) => {
        debug(`Error executing model ${entity.modelName} findById()`, err);
        throw err;
      });
  }

  function modelCount(_server: TransomServerLike, entity: TransomEntity, req: TransomRequest, skipAcl?: boolean) {
    const model = entity.model;
    let query: FindOptions;
    try {
      query = handlerUtils.buildQuery({}, req, entity);
      if (entity.model.options.needsAcl && !skipAcl) {
        query = handlerAcl.addAclFind(model, query, req);
      }
    } catch (err) {
      debug(`Failed to build query for ${entity.modelName} count.`, err);
      return Promise.reject(err);
    }

    return model
      .count(query)
      .then((count) => {
        debug(`Count model ${entity.modelName} completed`);
        return {
          count,
        };
      })
      .catch((err: unknown) => {
        debug(`Error executing model ${entity.modelName} count()`, err);
        throw err;
      });
  }

  function modelInsert(_server: TransomServerLike, entity: TransomEntity, req: TransomRequest, skipAcl?: boolean) {
    const model = entity.model;

    /***************************************************
     * EXAMPLE, do not delete this comment.
     ***************************************************
     * If a table PK is not using AutoIncrement, optionally use
     * a Model static function to fetch the next Pk value with sql.
     * NOTE: Don't use fat-arrow functions, we need access to `this`.
     *
     *  statics: {
     *   nextVal: function() {
     *     return this.sequelize
     *       .query("SELECT max(emp_no)+1 as 'empNo' from employees.employees", {
     *         type: this.sequelize.Sequelize.QueryTypes.SELECT
     *       }).then(results => results[0]);
     *   }
     * },
     */
    let nextValResult: Promise<Record<string, unknown> | undefined>;
    try {
      if (typeof model.nextVal === "function") {
        debug(`Using ${entity.modelName} nextVal during Insert.`);
        nextValResult = model.nextVal();
      } else {
        nextValResult = Promise.resolve(undefined);
      }
    } catch (err) {
      debug(`Failed duing ${entity.modelName} nextVal().`, err);
      return Promise.reject(err);
    }

    const skippedFields: string[] = [];
    const body: unknown = req.body;
    return nextValResult
      .then((nextVal) => {
        debug(`Applying  ${entity.modelName} nextVal result to posted values.`);
        const values: Record<string, unknown> = Object.assign({}, body, nextVal);

        // Check that provided values map to the Entity.
        Object.keys(values || {}).map((path) => {
          if (!Object.prototype.hasOwnProperty.call(model.rawAttributes, path)) {
            delete values[path];
            skippedFields.push(path);
          }
        });

        if (model.options.needsAcl && !skipAcl) {
          // Make sure the user has the insert rights.
          if (!handlerAcl.allowInsert(model, req)) {
            throw createError(403, `Not allowed to insert data into ${entity.modelName}.`);
          }
          debug(`Applying ACL defaults on the data to be inserted.`);
          const aclData = handlerAcl.applyInsertDefaults(model, req);
          Object.assign(values, aclData);
        }

        const userAudit = model.getUserAudit(req, true);
        Object.assign(values, userAudit);

        return model.create(values);
      })
      .then((item) => {
        debug(`Insert model ${entity.modelName} completed.`);
        return {
          item,
          skippedFields,
        };
      })
      .catch((err: unknown) => {
        debug(`Error executing ${entity.modelName} modelInsert`, err);
        throw err;
      });
  }

  function modelDelete(_server: TransomServerLike, entity: TransomEntity, req: TransomRequest, skipAcl?: boolean) {
    const model = entity.model;
    let query: FindOptions & { where: WhereOptions };
    try {
      query = handlerUtils.buildQuery({}, req, entity);
      if (entity.model.options.needsAcl && !skipAcl) {
        query = handlerAcl.addAclDelete(model, query, req);
      }
    } catch (err) {
      debug(`Error building query for ${entity.modelName} delete()`, err);
      return Promise.reject(err);
    }

    return model
      .destroy(query)
      .then((result) => {
        debug(`Delete on model ${entity.modelName} completed.`, query.where, result);
        return {
          data: {
            deleted: result,
          },
        };
      })
      .catch((err: unknown) => {
        debug(`Error executing ${entity.modelName} delete`, err);
        throw err;
      });
  }

  function modelDeleteById(_server: TransomServerLike, entity: TransomEntity, req: TransomRequest, skipAcl?: boolean) {
    const model = entity.model;
    let query: { where: WhereOptions };
    try {
      const id = handlerUtils.getStrongPkValue(req.params.__id, model);
      query = {
        where: {
          [model.primaryKeyAttribute]: id,
        },
      };
      if (entity.model.options.needsAcl && !skipAcl) {
        query = handlerAcl.addAclDelete(model, query, req);
      }
    } catch (err) {
      debug(`Error building query for ${entity.modelName} deleteById()`, err);
      return Promise.reject(err);
    }

    return model
      .destroy(query)
      .then((result) => {
        debug(`Deleted model ${entity.modelName} by Id completed.`, query.where, result);
        return {
          data: {
            deleted: result,
          },
        };
      })
      .catch((err: unknown) => {
        debug(`Error executing model ${entity.modelName} deleteById()`, err);
        throw err;
      });
  }

  function modelDeleteBatch(_server: TransomServerLike, entity: TransomEntity, req: TransomRequest, skipAcl?: boolean) {
    const model = entity.model;
    let query: { where: WhereOptions };
    try {
      // Op as the Sequelize instance exposes it (untyped there; tests inject their own).
      const opIn: unknown = Reflect.get(Object(Reflect.get(sequelize.Sequelize, "Op")), "in");
      if (typeof opIn !== "symbol") {
        throw new TypeError("Cannot read Sequelize.Op.in");
      }

      const body: unknown = req.body;
      let deleteIdList: unknown = Reflect.get(Object(body || {}), model.primaryKeyAttribute);
      if (!deleteIdList) {
        throw new Error(
          `Request body must contain a "${model.primaryKeyAttribute}" field containing the array of PK values to delete.`,
        );
      }
      // If user provided a single string value.
      if (typeof deleteIdList === "string") {
        deleteIdList = [deleteIdList];
      }
      if (!Array.isArray(deleteIdList)) {
        // e.g. a number or an object. Not mappable, so this failed before too.
        throw new TypeError(`"${model.primaryKeyAttribute}" must be an array of PK values or a single string`);
      }
      // Convert Id values to the appropriate type for this PK.
      const inList: unknown[] = [];
      deleteIdList.map((id: unknown) => {
        inList.push(handlerUtils.getStrongPkValue(id, model));
      });
      query = {
        where: {
          [model.primaryKeyAttribute]: { [opIn]: inList },
        },
      };
      if (entity.model.options.needsAcl && !skipAcl) {
        query = handlerAcl.addAclDelete(model, query, req);
      }
    } catch (err) {
      debug(`Failed to create an in-list for ${entity.modelName} batch delete.`, err);
      return Promise.reject(err);
    }

    return model
      .destroy(query)
      .then((result) => {
        debug(`Delete model ${entity.modelName} batch:`, query.where, result);
        return {
          data: {
            deleted: result,
          },
        };
      })
      .catch((err: unknown) => {
        debug(`Error executing model ${entity.modelName} deleteBatch()`, err);
        throw err;
      });
  }

  function modelUpdateById(_server: TransomServerLike, entity: TransomEntity, req: TransomRequest, skipAcl?: boolean) {
    const model = entity.model;
    const newValues: unknown = req.body;
    let query: FindOptions & { where: WhereOptions; returning?: boolean };
    try {
      const id = handlerUtils.getStrongPkValue(req.params.__id, model);
      query = {
        where: {
          [model.primaryKeyAttribute]: id,
        },
        returning: true,
      };
      if (entity.model.options.needsAcl && !skipAcl) {
        query = handlerAcl.addAclUpdate(model, query, req);
      }
    } catch (err) {
      debug(`Failed to build query for ${entity.modelName} updateById.`, err);
      return Promise.reject(err);
    }

    // The audit fields are added to req.body itself (as before). Without a body this
    // throws synchronously, as Object.assign(undefined) did.
    const userAudit = model.getUserAudit(req, false);
    if (newValues === null || newValues === undefined) {
      throw new TypeError("Cannot convert undefined or null to object");
    }
    Object.assign(newValues, userAudit);

    return model
      .findOne(query)
      .then((record) => {
        if (!record) {
          throw createError(404, "Not Found");
        }
        return record.update(newValues);
      })
      .catch((err: unknown) => {
        debug(`Error executing model ${entity.modelName} updateById()`, err);
        throw err;
      });
  }

  return {
    modelFind,
    modelFindById,
    modelCount,
    modelInsert,
    modelDelete,
    modelDeleteById,
    modelDeleteBatch,
    modelUpdateById,
  };
}

export = ModelFunctions;
