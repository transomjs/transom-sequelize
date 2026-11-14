import createDebug from "debug";
import type { RequestHandler } from "express";
import TransomCore from "@transomjs/transom-core";
import ModelHandler from "./modelHandler";
import OpenApiMeta from "./openApiMeta";
import { sequelizeDefinition, sequelizeInstance, uriPrefix as readUriPrefix } from "../internal/registry";
import type { RouteArg, RouteEntity, TransomHandler, TransomRequest, TransomSequelizeOptions, TransomServerLike } from "../types";

const debug = createDebug("transom:sequelize:routes");

/**
 * transom-core's withMeta() for this package's handlers. They take a TransomRequest;
 * withMeta() takes a plain Express handler.
 */
function withMeta(metadata: Record<string, unknown>, handler: TransomHandler): RequestHandler {
  return TransomCore.withMeta(metadata, (req, res, next) => {
    // Boundary: transom-core creates req.locals before any plugin's routes run, so
    // every request reaching these routes is a TransomRequest.
    handler(req as TransomRequest, res, next);
  });
}

declare namespace SequelizeRoutes {
  interface Functions {
    /** Adds the REST routes for every table in definition.sequelize.tables. */
    setupModelHandler(): void;
  }
}

/** Creates the generated REST routes. Reads the Sequelize instance from the registry. */
function SequelizeRoutes(server: TransomServerLike, options: TransomSequelizeOptions): SequelizeRoutes.Functions {
  const regKey = options.sequelizeKey || "sequelize";
  const sequelize = sequelizeInstance(server.registry, regKey);
  const openapiIgnore = options.openapiIgnore || [];
  const openapiSecurity = options.openapiSecurity || {};

  function setupModelHandler(): void {
    const dbSequelize = sequelizeDefinition(server.registry, {});
    const modelHandler = ModelHandler({
      server,
      sequelize,
    });

    const preMiddleware: RouteArg[] = options.preMiddleware || [];
    const postMiddleware: RouteArg[] = options.postMiddleware || [];

    const uriPrefix = readUriPrefix(server.registry);
    const openApiMeta = OpenApiMeta(server, {
      ignore: openapiIgnore,
      security: openapiSecurity,
    });
    const allRoutes: RouteEntity[] = [];

    // Get models based on sequelize.tables in the API definition
    const tables = dbSequelize.tables;
    if (tables === undefined) {
      // Object.keys(undefined) threw here before, too.
      throw new TypeError("Cannot convert undefined or null to object");
    }
    Object.keys(tables).map((key) => {
      const table = tables[key];
      if (table === undefined) {
        return;
      }
      // If routes === false, don't create *any* routes for this Model.
      if (table.routes === false) {
        debug(`Table '${key}' routes not created.`);
      } else {
        const code = (table.code || key).toLowerCase();
        const route: RouteEntity = {
          entity: code,
          entityObj: table, // this is just the apiDefinition Object, not the sequelize model!
          modelName: code,
          sequelize,
          versions: table.versions || null, // If null, doesn't require the 'Accept-Version' header.
          routes: Object.assign({ delete: false as const }, table.routes),
        };

        allRoutes.push(route);
      }
    });

    // Map the known routes to endpoints.
    allRoutes.map(function (route) {
      // Copy the preMiddleware and append one that adds route details to req.locals.__entity
      // This tells the modelHandler which models to use!
      const pre = preMiddleware.slice(0);
      const addEntity: TransomHandler = function (req: TransomRequest, _res, next) {
        const r = Object.assign({}, route); // Don't modify route as it stays in scope
        req.locals.__entity = r;
        next();
      };
      pre.push(addEntity);

      //
      const routeEntity = route.entity;

      // *** CREATE *********************************************
      if (route.routes.insert !== false) {
        //insert single
        const path = `${uriPrefix}/db/${routeEntity}`;
        debug(`Adding insert route ${path}`);
        const metadata = {
          path,
          openApi: openApiMeta.insertMeta(route, routeEntity),
          operation: "insert",
          entity: routeEntity,
          versions: route.versions,
        };
        server.post(path, pre, withMeta(metadata, modelHandler.handleInsert), postMiddleware);
      }

      // *** READ ***********************************************
      if (route.routes.find !== false) {
        // find query
        const path = `${uriPrefix}/db/${routeEntity}`;
        const metadata = {
          path,
          openApi: openApiMeta.findMeta(route, routeEntity),
          operation: "find",
          entity: routeEntity,
          versions: route.versions,
        };
        debug(`Adding find route ${path}`);

        server.get(path, pre, withMeta(metadata, modelHandler.handleFind), postMiddleware);
      }

      if (route.routes.findCount !== false) {
        // count query
        const path = `${uriPrefix}/db/${routeEntity}/count`;
        const metadata = {
          path,
          openApi: openApiMeta.findCountMeta(route, routeEntity),
          operation: "findCount",
          entity: routeEntity,
          versions: route.versions,
        };
        debug(`Adding findCount route ${path}`);
        server.get(path, pre, withMeta(metadata, modelHandler.handleCount), postMiddleware);
      }

      if (route.routes.findById !== false) {
        // find single
        const path = `${uriPrefix}/db/${routeEntity}/:__id`;
        const metadata = {
          path,
          openApi: openApiMeta.findByIdMeta(route, routeEntity),
          operation: "findById",
          entity: routeEntity,
          versions: route.versions,
        };
        debug(`Adding findById route ${path}`);
        server.get(path, pre, withMeta(metadata, modelHandler.handleFindById), postMiddleware);
      }

      // *** UPDATE  ********************************************
      if (route.routes.updateById !== false) {
        // update single
        const path = `${uriPrefix}/db/${routeEntity}/:__id`;
        const metadata = {
          path,
          openApi: openApiMeta.updateByIdMeta(route, routeEntity),
          operation: "updateById",
          entity: routeEntity,
          versions: route.versions,
        };
        debug(`Adding updateById route ${path}`);
        server.put(path, pre, withMeta(metadata, modelHandler.handleUpdateById), postMiddleware);
      }

      // *** DELETE  ********************************************
      if (route.routes.delete !== false) {
        // delete query - This route is disabled by default and must be enabled as needed.
        // 				It's too easy to blow away the whole collection!
        const path = `${uriPrefix}/db/${routeEntity}`;
        const metadata = {
          path,
          openApi: openApiMeta.deleteMeta(route, routeEntity),
          operation: "delete",
          entity: routeEntity,
          versions: route.versions,
        };
        debug(`Adding delete route ${path}`);
        server.del(path, pre, withMeta(metadata, modelHandler.handleDelete), postMiddleware);
      }

      if (route.routes.deleteBatch !== false) {
        // delete batch
        const path = `${uriPrefix}/db/${routeEntity}/batch`;
        const metadata = {
          path,
          openApi: openApiMeta.deleteBatchMeta(route, routeEntity),
          operation: "deleteBatch",
          entity: routeEntity,
          versions: route.versions,
        };
        debug(`Adding deleteBatch route ${path}`);
        server.del(path, pre, withMeta(metadata, modelHandler.handleDeleteBatch), postMiddleware);
      }

      if (route.routes.deleteById !== false) {
        // delete single
        const path = `${uriPrefix}/db/${routeEntity}/:__id`;
        const metadata = {
          path,
          openApi: openApiMeta.deleteByIdMeta(route, routeEntity),
          operation: "deleteById",
          entity: routeEntity,
          versions: route.versions,
        };
        debug(`Adding deleteById route ${path}`);
        server.del(path, pre, withMeta(metadata, modelHandler.handleDeleteById), postMiddleware);
      }
    });
  }

  return {
    setupModelHandler,
  };
}

export = SequelizeRoutes;
