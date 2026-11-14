import path from "path";
import createDebug from "debug";
import { ConnectionError, DATE, Model, Sequelize } from "sequelize";
import type { InitOptions, ModelAttributeColumnOptions, ModelAttributes } from "sequelize";
import SequelizeMeta from "./lib/sequelize-meta";
import SequelizeRoutes from "./lib/sequelizeRoutes";
import { sequelizeDefinition } from "./internal/registry";
import type * as Types from "./types";
import type {
  SequelizeDefinition,
  TransomColumnOptions,
  TransomModelOptions,
  TransomRequest,
  TransomSequelizeOptions,
  TransomServerLike,
} from "./types";

const debug = createDebug("transom:sequelize");

/** The package root (this file runs from <root>/dist). */
const PACKAGE_ROOT = path.join(__dirname, "..");

/** The retry settings Sequelize's authenticate() accepts. */
type RetryOptions = NonNullable<NonNullable<Parameters<Sequelize["authenticate"]>[0]>["retry"]>;

/** Generated metadata: column name -> Sequelize column options. */
type GeneratedMeta = Record<string, ModelAttributeColumnOptions>;

/** The DATE type's prototype, where Sequelize keeps its (untyped) _stringify. */
function datePrototype(): object {
  // Sequelize's DATE is a constructor; its prototype holds _stringify.
  return DATE.prototype;
}

/** Narrows a merged definition to one that has `config` and `tables`, as before (no checks then either). */
function asDefinition(options: TransomSequelizeOptions): SequelizeDefinition {
  // initialize() always read options.config and options.tables without checking them.
  return options as SequelizeDefinition;
}

declare namespace transomSequelize {
  // The public types, reachable through `export =`:
  // import type { TableDefinition } from "@transomjs/transom-sequelize";
  export type TransomUser = Types.TransomUser;
  export type TransomUserGroup = Types.TransomUserGroup;
  export type TransomLocals = Types.TransomLocals;
  export type TransomRequest = Types.TransomRequest;
  export type TransomHandler = Types.TransomHandler;
  export type Middleware = Types.Middleware;
  export type RouteArg = Types.RouteArg;
  export type TransomRegistryLike = Types.TransomRegistryLike;
  export type TransomServerLike = Types.TransomServerLike;
  export type TransomColumnOptions = Types.TransomColumnOptions;
  export type TransomModelOptions = Types.TransomModelOptions;
  export type TransomModelStatics = Types.TransomModelStatics;
  export type TransomModel = Types.TransomModel;
  export type TransomEntity = Types.TransomEntity;
  export type TableRouteFx = Types.TableRouteFx;
  export type Responder = Types.Responder;
  export type ResponderData = Types.ResponderData;
  export type TableRouteName = Types.TableRouteName;
  export type OpenApiText = Types.OpenApiText;
  export type TableRouteOptions = Types.TableRouteOptions;
  export type TableAudit = Types.TableAudit;
  export type TableAcl = Types.TableAcl;
  export type TableDefinition = Types.TableDefinition;
  export type TransomSequelizeConfig = Types.TransomSequelizeConfig;
  export type SequelizeDefinition = Types.SequelizeDefinition;
  export type TransomSequelizeOptions = Types.TransomSequelizeOptions;
  export type DateTypeInternals = Types.DateTypeInternals;
  export type RouteEntity = Types.RouteEntity;
}

/** The TransomJS plugin. The package exports one instance; pass it to transom.configure(). */
class TransomSequelize {
  /**
   * Connects (with retries), regenerates and loads the table metadata, defines a model
   * per table, registers the Sequelize instance and adds the REST routes.
   *
   * Startup errors are logged and the returned promise still resolves (as in every
   * 5.x release); see the CHANGELOG.
   */
  initialize = function (server: TransomServerLike, pluginOptions?: TransomSequelizeOptions): Promise<void> {
    let sequelize: Sequelize;
    let database: string | undefined;
    let retryOptions: RetryOptions;
    let options: SequelizeDefinition;

    return new Promise<void>((resolve) => {
      const sequelizeDefn = sequelizeDefinition(server.registry, {});
      options = asDefinition(Object.assign({}, sequelizeDefn, pluginOptions));

      // Generate lowercase codes on each table entry. Used for file and model names!
      Object.keys(options.tables).map((t) => {
        const table = options.tables[t];
        if (table !== undefined) {
          table.name = t;
          table.code = (table.code || t).toLowerCase();
        }
      });

      // Configure Promise retries on the initial database connection.
      retryOptions = Object.assign({}, options.config.retryOptions, {
        max: 10, // maximum amount of tries
        timeout: 10000, // throw if no response or error within millisecond timeout
        match: [
          // Must match error signature (ala bluebird catch) to continue
          ConnectionError,
        ],
        backoffBase: 1000, // Initial backoff duration in ms.
        backoffExponent: 1.05, // Exponent to increase backoff each try.
        report: (msg: string) => {
          console.log(msg);
        }, // the function used for reporting; must have a (string, object) argument signature, where string is the message.
        name: "Transom.sequelize connection attempt",
      });
      delete options.config.retryOptions;

      // Sequelize wants them split out.
      database = options.config.database;
      delete options.config.database;

      const username = options.config.username;
      delete options.config.username;

      const password = options.config.password;
      delete options.config.password;

      sequelize = new Sequelize(database ?? "", username ?? "", password, options.config);

      const regKey = options.sequelizeKey || "sequelize";
      server.registry.set(regKey, sequelize);

      const dialect = options.config.dialect;
      const dateStringify = options.config.dateStringify;

      if (dialect === "mssql") {
        // Apply fix for inserting dates on MS SQL Server, override timezone formatting.
        Reflect.set(
          datePrototype(),
          "_stringify",
          dateStringify ||
            function _stringify(this: Types.DateTypeInternals, date: unknown, options: unknown) {
              return this._applyTimezone(date, options).format("YYYY-MM-DD HH:mm:ss.SSS");
            },
        );
      } else if (options.config.dateStringify) {
        Reflect.set(datePrototype(), "_stringify", dateStringify);
      }
      resolve();
    })
      .then(() => {
        // return retry(() => sequelize.authenticate(), retryOptions);
        return sequelize.authenticate({ retry: retryOptions });
      })
      .then(() => {
        console.log(`Connection to ${database} has been established.`);

        return new Promise<void>((resolve, reject) => {
          const overwrite = options.overwrite === false ? false : true;
          // <app root>/node_modules/@transomjs/transom-sequelize -> <app root>
          const metaPath = path.join(PACKAGE_ROOT, "..", "..", "..", options.directory || "sequelize-metadata");

          const sequelizeMeta = new SequelizeMeta(sequelize, {
            directory: metaPath,
            overwrite,
            additional: {
              timestamps: false,
            },
            tables: Object.keys(options.tables),
          });

          // Generates metadata for all the tables.
          sequelizeMeta.run(function (err) {
            if (err) {
              return reject(err);
            }
            // For each table we have meta.
            const allTables = options.tables;
            const tables = Object.keys(allTables);
            tables.map((tbl) => {
              const tableDefn = allTables[tbl];
              if (tableDefn === undefined) {
                return;
              }
              // Load the generated metadata files
              const metadataFile = path.join(metaPath, tbl);
              debug(`Loading metadata from ${metadataFile}`);

              // Get column metadata from generated files and the api definition.
              // The generated files are written by SequelizeMeta just above.
              const generatedMeta = require(metadataFile) as GeneratedMeta;
              const attributeMeta: Record<string, TransomColumnOptions> = tableDefn.attributes || {};
              const attributeHooks = tableDefn.hooks || {};

              // Lay the attributeMeta overtop of the generatedMeta.
              const comboMeta: Record<string, TransomColumnOptions> = {};
              for (const column in generatedMeta) {
                comboMeta[column] = Object.assign({}, generatedMeta[column], attributeMeta[column]);
              }

              // Create model options to help define behaviours of the Model.
              const modelOptions: TransomModelOptions & InitOptions = {
                sequelize,
                tableName: tbl,
                modelName: tableDefn.code, // These must be in LowerCase!
                hooks: attributeHooks,
                timestamps: false,
                freezeTableName: true,
                needsAcl: !!tableDefn.acl,
                acl: tableDefn.acl,
              };

              if (tableDefn.audit === false) {
                modelOptions.timestamps = false;
              } else {
                const audit = (tableDefn.audit = tableDefn.audit || {});
                modelOptions.timestamps = true;
                modelOptions.createdAt = audit.createdAt || "createdDate";
                modelOptions.updatedAt = audit.updatedAt || "updatedDate";
                modelOptions.createdBy = audit.createdBy || "createdBy";
                modelOptions.updatedBy = audit.updatedBy || "updatedBy";
              }

              // No duplicate model names in Sequelize!
              const modelName = String(modelOptions.modelName);
              if (sequelize.models[modelName]) {
                throw new Error(`'${modelName}' already exists in Sequelize.`);
              }

              debug(`Initializing ${tbl} Model [${Object.keys(attributeHooks).join(", ")}]`);

              // Create and initialize the model with sequelize.
              class model extends Model {}
              // comboMeta is the generated column definitions plus the app's overrides.
              model.init(comboMeta as ModelAttributes, modelOptions);

              // Copy the meta to the model for custom querying options later!
              Reflect.set(model, "__meta", comboMeta);

              // Adding class level (Static) methods
              const statics = tableDefn.statics || {};
              for (const staticKey in statics) {
                if (Reflect.get(model, staticKey)) {
                  throw new Error(`Failed to add static function, '${staticKey}' already exists on the ${tbl} Model.`);
                }
                debug(`Adding static function ${staticKey} to ${tbl} Model.`);
                const value = statics[staticKey];
                Reflect.set(
                  model,
                  staticKey,
                  typeof value === "function"
                    ? value
                    : function () {
                        return statics[staticKey];
                      },
                );
              }

              //create a static function on the model that handles the user related audit fields
              Reflect.set(model, "getUserAudit", function (req: TransomRequest, isInsert: boolean) {
                const ret: Record<string, string> = {};
                // The options passed to init() above, including createdBy/updatedBy.
                const opts = model.options as TransomModelOptions;
                if (opts.timestamps) {
                  const user = req.locals.user || {};
                  if (isInsert) {
                    ret[String(opts.createdBy)] = user.email || "unknown";
                  }
                  ret[String(opts.updatedBy)] = user.email || "unknown";
                }
                return ret;
              });

              // Adding instance level methods.
              // ********************************************************************
              // ** DO NOT use fat arrow functions when creating instance methods!
              // ** It loses context of `this`.
              // ********************************************************************
              const methods = tableDefn.methods || {};
              for (const methodKey in methods) {
                if (Reflect.get(model.prototype, methodKey)) {
                  throw new Error(
                    `Failed to add instance method, '${methodKey}' already exists on the ${tbl} Model.`,
                  );
                }
                debug(`Adding instance method ${methodKey} to ${tbl} Model.`);
                const value = methods[methodKey];
                Reflect.set(
                  model.prototype,
                  methodKey,
                  typeof value === "function"
                    ? value
                    : function () {
                        return methods[methodKey];
                      },
                );
              }
            });
            resolve();
          });
        });
      })
      .then(() => {
        const sequelizeRoutes = SequelizeRoutes(server, options);
        sequelizeRoutes.setupModelHandler();
      })
      .catch((err: unknown) => {
        const message = typeof err === "object" && err !== null && Reflect.get(err, "message") ? Reflect.get(err, "message") : err;
        console.error("Unable to connect to the database:", message);
        // Unchanged from 5.x: this rejection isn't returned, so initialize() resolves
        // even when startup fails, and Node reports an unhandled rejection.
        void Promise.reject(err);
      });
  };
}

// One shared instance, as in 5.x (module.exports = new TransomSequelize()).
const transomSequelize = new TransomSequelize();

export = transomSequelize;
