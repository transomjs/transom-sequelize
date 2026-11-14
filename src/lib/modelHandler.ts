import createDebug from "debug";
import createError from "http-errors";
import type { Response } from "express";
import type { Sequelize } from "sequelize";
import ModelFunctions from "./modelFunctions";
import type {
  Responder,
  ResponderData,
  TableRouteName,
  TransomEntity,
  TransomHandler,
  TransomModel,
  TransomRequest,
  TransomServerLike,
} from "../types";

const debug = createDebug("transom:sequelize:handler");

declare namespace ModelHandler {
  interface Options {
    server: TransomServerLike;
    sequelize: Sequelize;
  }

  interface Functions {
    /** The model (and any fx/responder override) for the route that matched this request. */
    getEntity(req: TransomRequest, routeName: TableRouteName): TransomEntity;
    handleFind: TransomHandler;
    handleFindById: TransomHandler;
    handleCount: TransomHandler;
    handleInsert: TransomHandler;
    handleDelete: TransomHandler;
    handleDeleteById: TransomHandler;
    handleDeleteBatch: TransomHandler;
    handleUpdateById: TransomHandler;
  }
}

/** True for http-errors and anything else carrying an HTTP status. */
function hasStatus(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (Boolean(Reflect.get(err, "status")) || Boolean(Reflect.get(err, "statusCode")))
  );
}

/** Express route handlers for the generated routes. */
function ModelHandler(options: ModelHandler.Options): ModelHandler.Functions {
  const IGNORED_ATTRIBUTES = "Ignored-Attributes";
  const server = options.server;
  const sequelize = options.sequelize;

  const modelFunctions = ModelFunctions({
    sequelize,
  });

  function getEntity(req: TransomRequest, routeName: TableRouteName): TransomEntity {
    // req.locals.__entity is populated with middleware on the dynamic routes.
    const routeEntity = req.locals.__entity;
    const modelName = routeEntity ? routeEntity.modelName : "";
    const route = routeEntity && routeEntity.routes ? routeEntity.routes[routeName] : undefined;

    // The model was defined by this package's initialize(), which adds the Transom statics.
    const model = sequelize.model(modelName) as TransomModel;
    const entity: TransomEntity = { modelName, model };
    if (route) {
      entity.fx = route.fx;
      entity.responder = route.responder;
    }
    return entity;
  }

  function scrubAclValues(item: unknown): unknown {
    // field == 'aclOwner' || field == 'aclGroup' || field == 'aclGroupPrivs' || field == 'aclPublicPrivs';
    if (item === null || (typeof item !== "object" && typeof item !== "function")) {
      // Assigning a property to a primitive throws in strict mode; it did before too.
      throw new TypeError(`Cannot set ACL properties on ${String(item)}`);
    }
    for (const key of ["aclOwner", "aclGroup", "aclGroupPrivs", "aclPublicPrivs"]) {
      if (!Reflect.set(item, key, undefined)) {
        throw new TypeError(`Cannot assign to read only property '${key}'`);
      }
    }
    return item;
  }

  const jsonResponder: Responder = (_server, _entity, _req, res: Response, data: ResponderData) => {
    if (data.skippedFields && data.skippedFields.length > 0) {
      res.setHeader(IGNORED_ATTRIBUTES, data.skippedFields.join());
    }
    res.json(scrubAclValues(data.item));
    return Promise.resolve();
  };

  const jsonArrayResponder: Responder = (_server, _entity, _req, res: Response, data: ResponderData) => {
    const items = data.items;
    if (!Array.isArray(items)) {
      throw new TypeError("Cannot read properties of undefined (reading 'map')");
    }
    res.json({
      data: items.map((item) => scrubAclValues(item)),
    });
    return Promise.resolve();
  };

  /** The fx result as a ResponderData (find and insert results already have that shape). */
  function asResponderData(data: unknown): ResponderData {
    return typeof data === "object" && data !== null ? data : {};
  }

  const handleFind: TransomHandler = (req, res, next) => {
    const entity = getEntity(req, "find");
    debug(`HandleFind on ${entity.modelName}`);

    const modelFx = entity.fx || modelFunctions.modelFind;
    modelFx(server, entity, req)
      .then((data) => {
        const responder = entity.responder || jsonArrayResponder;
        return responder(server, entity, req, res, asResponderData(data));
      })
      .then(() => {
        next();
      })
      .catch(function (err: unknown) {
        debug(`HandleFind failed`, err);
        if (!hasStatus(err)) {
          err = createError(400, `Error executing ${entity.modelName} modelFind()`);
        }
        next(err);
      });
  };

  const handleFindById: TransomHandler = (req, res, next) => {
    const entity = getEntity(req, "findById");
    debug(`HandleFindById on ${entity.modelName}`);

    const modelFx = entity.fx || modelFunctions.modelFindById;
    modelFx(server, entity, req)
      .then((data) => {
        const responder = entity.responder || jsonResponder;
        return responder(server, entity, req, res, { item: data });
      })
      .then(() => {
        next();
      })
      .catch(function (err: unknown) {
        debug("HandleFindById failed", err);
        if (!hasStatus(err)) {
          err = createError(400, `Error executing ${entity.modelName} modelFindById()`);
        }
        next(err);
      });
  };

  const handleCount: TransomHandler = (req, res, next) => {
    const entity = getEntity(req, "findCount");
    debug(`handleCount on ${entity.modelName}`);

    const modelFx = entity.fx || modelFunctions.modelCount;
    modelFx(server, entity, req)
      .then((data) => {
        const responder = entity.responder || jsonResponder;
        return responder(server, entity, req, res, { item: data });
      })
      .then(() => {
        next();
      })
      .catch(function (err: unknown) {
        debug("HandleCount failed", err);
        next(createError(400, `Error executing ${entity.modelName} modelCount()`));
      });
  };

  const handleInsert: TransomHandler = (req, res, next) => {
    const entity = getEntity(req, "insert");
    debug(`handleInsert on ${entity.modelName}`);

    const modelFx = entity.fx || modelFunctions.modelInsert;
    modelFx(server, entity, req)
      .then((data) => {
        const responder = entity.responder || jsonResponder;
        return responder(server, entity, req, res, asResponderData(data));
      })
      .then(() => {
        next();
      })
      .catch(function (err: unknown) {
        debug("HandleInsert failed", err);
        next(createError(400, `Error executing ${entity.modelName} modelInsert()`));
      });
  };

  const handleDelete: TransomHandler = (req, res, next) => {
    const entity = getEntity(req, "delete");
    debug(`handleDelete on ${entity.modelName}`);

    const modelFx = entity.fx || modelFunctions.modelDelete;
    modelFx(server, entity, req)
      .then((data) => {
        const responder = entity.responder || jsonResponder;
        return responder(server, entity, req, res, { item: data });
      })
      .then(() => {
        next();
      })
      .catch(function (err: unknown) {
        debug("HandleCount failed", err);
        next(createError(400, `Error executing ${entity.modelName} modelCount()`));
      });
  };

  const handleDeleteById: TransomHandler = (req, res, next) => {
    const entity = getEntity(req, "deleteById");
    debug(`handleDeleteById on ${entity.modelName}`);

    const modelFx = entity.fx || modelFunctions.modelDeleteById;
    modelFx(server, entity, req)
      .then((data) => {
        const responder = entity.responder || jsonResponder;
        return responder(server, entity, req, res, { item: data });
      })
      .then(() => {
        next();
      })
      .catch(function (err: unknown) {
        debug("HandleDeleteById failed", err);
        if (!hasStatus(err)) {
          err = createError(400, `Error executing ${entity.modelName} modelDeleteById()`);
        }
        next(err);
      });
  };

  const handleDeleteBatch: TransomHandler = (req, res, next) => {
    const entity = getEntity(req, "deleteBatch");
    debug(`handleDeleteBatch on ${entity.modelName}`);

    const modelFx = entity.fx || modelFunctions.modelDeleteBatch;
    modelFx(server, entity, req)
      .then((data) => {
        const responder = entity.responder || jsonResponder;
        return responder(server, entity, req, res, { item: data });
      })
      .then(() => {
        next();
      })
      .catch(function (err: unknown) {
        debug("HandleDeleteBatch failed", err);
        if (!hasStatus(err)) {
          err = createError(400, `Error executing ${entity.modelName} modelDeleteBatch()`);
        }
        next(err);
      });
  };

  const handleUpdateById: TransomHandler = (req, res, next) => {
    const entity = getEntity(req, "updateById");
    debug(`handleUpdateById on ${entity.modelName}`);

    const modelFx = entity.fx || modelFunctions.modelUpdateById;
    modelFx(server, entity, req)
      .then((data) => {
        const responder = entity.responder || jsonResponder;
        return responder(server, entity, req, res, { item: data });
      })
      .then(() => {
        next();
      })
      .catch(function (err: unknown) {
        debug("HandleUpdateById failed", err);
        if (!hasStatus(err)) {
          err = createError(400, `Error executing ${entity.modelName} modelUpdateById()`);
        }
        next(err);
      });
  };

  return {
    getEntity,
    handleFind,
    handleFindById,
    handleCount,
    handleInsert,
    handleDelete,
    handleDeleteById,
    handleDeleteBatch,
    handleUpdateById,
  };
}

export = ModelHandler;
