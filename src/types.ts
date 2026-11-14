/**
 * Public types for @transomjs/transom-sequelize.
 *
 * The server and registry types here are structural: they describe only what this
 * package uses from the transom-core server wrapper, so this package doesn't depend on
 * transom-core shipping types. A transom-core server is assignable to TransomServerLike.
 *
 * Nothing here augments Express's global Request type. Applications often declare
 * their own `req.locals`, and two declarations would conflict. Handlers receive a
 * TransomRequest instead, which adds the `locals` fields this package reads.
 */
import type { NextFunction, Request, RequestHandler, ErrorRequestHandler, Response } from "express";
import type {
  InitOptions,
  Model,
  ModelAttributeColumnOptions,
  ModelStatic,
  Options as SequelizeOptions,
  Sequelize,
} from "sequelize";

// ---- Requests --------------------------------------------------------------

/** A group membership, read by the ACL checks. */
export interface TransomUserGroup {
  groupCode: string;
}

/** The fields of `req.locals.user` this package reads (audit columns and ACL). */
export interface TransomUser {
  id?: string | number;
  email?: string;
  groups?: TransomUserGroup[];
}

/** The fields of `req.locals` this package reads or sets. */
export interface TransomLocals {
  user?: TransomUser;
  /** Set by a per-route middleware so the handlers know which model to use. */
  __entity?: RouteEntity;
}

/** An Express request after transom-core has initialized `req.locals`. */
export type TransomRequest = Request & { locals: TransomLocals };

/** A request handler as this package writes them. */
export type TransomHandler = (req: TransomRequest, res: Response, next: NextFunction) => void;

/** Anything Express accepts as middleware in a route definition. */
export type Middleware = RequestHandler | ErrorRequestHandler | TransomHandler;

/** Express accepts handlers and arrays of handlers, nested to any depth. */
export type RouteArg = Middleware | readonly RouteArg[];

// ---- Server ----------------------------------------------------------------

/** The registry calls this package makes (pocket-registry, as exposed by transom-core). */
export interface TransomRegistryLike {
  /** Throws for a missing key when no default is given. */
  get(key: string, defaultValue?: unknown): unknown;
  set(key: string, value: unknown): unknown;
  has(key: string): boolean;
}

/** The parts of the transom-core server wrapper this package uses. */
export interface TransomServerLike {
  readonly registry: TransomRegistryLike;
  get(path: string, ...handlers: RouteArg[]): unknown;
  post(path: string, ...handlers: RouteArg[]): unknown;
  put(path: string, ...handlers: RouteArg[]): unknown;
  del(path: string, ...handlers: RouteArg[]): unknown;
}

// ---- Models ----------------------------------------------------------------

/** A column definition: Sequelize's options plus the ones this package reads. */
export interface TransomColumnOptions extends Partial<ModelAttributeColumnOptions> {
  /** false keeps the column out of query-string filters (400 if used). */
  queryable?: boolean;
  /** false on MSSQL VARCHAR columns, so string values skip the "N" prefix. */
  unicode?: boolean;
}

/** Audit and ACL settings stored on every model's options. */
export interface TransomModelOptions extends InitOptions {
  needsAcl?: boolean;
  acl?: TableAcl;
  createdBy?: string;
  updatedBy?: string;
}

/** Static helpers this package adds to every model it defines. */
export interface TransomModelStatics {
  /** The merged column metadata (generated metadata overlaid with `attributes`). */
  __meta: Record<string, TransomColumnOptions>;
  /** createdBy/updatedBy values from req.locals.user (or "unknown"), when the table is audited. */
  getUserAudit(req: TransomRequest, isInsert: boolean): Record<string, string>;
  /** Optional static from `statics`: returns extra values (usually the next PK) for inserts. */
  nextVal?: () => Promise<Record<string, unknown> | undefined>;
}

/** A model defined by this package. */
export type TransomModel = ModelStatic<Model> &
  TransomModelStatics & {
    readonly options: TransomModelOptions;
  };

// ---- Route functions -------------------------------------------------------

/** What a route handler passes to an fx and a responder. */
export interface TransomEntity {
  modelName: string;
  model: TransomModel;
  fx?: TableRouteFx;
  responder?: Responder;
}

/**
 * Replaces a generated route's model function. Called as fx(server, entity, req).
 * The result goes to the responder (wrapped as {item} for all routes except find
 * and insert, whose results are passed as they are).
 */
export type TableRouteFx = (
  server: TransomServerLike,
  entity: TransomEntity,
  req: TransomRequest,
  skipAcl?: boolean,
) => Promise<unknown>;

/**
 * Sends the response for a route. The default responders send `data.item` (or
 * `data.items` for find) as JSON, with the ACL columns removed.
 */
export type Responder = (
  server: TransomServerLike,
  entity: TransomEntity,
  req: TransomRequest,
  res: Response,
  data: ResponderData,
) => Promise<void>;

/** The data passed to a responder. */
export interface ResponderData {
  item?: unknown;
  items?: unknown[];
  /** Body fields that weren't columns of the model (sent as the Ignored-Attributes header). */
  skippedFields?: string[];
}

// ---- API definition --------------------------------------------------------

export type TableRouteName =
  | "insert"
  | "find"
  | "findCount"
  | "findById"
  | "updateById"
  | "delete"
  | "deleteById"
  | "deleteBatch";

/** OpenAPI summary/description overrides. */
export interface OpenApiText {
  summary?: string;
  description?: string;
}

export interface TableRouteOptions {
  fx?: TableRouteFx;
  responder?: Responder;
  meta?: OpenApiText;
}

/** Per-table audit column names. Defaults: createdDate, updatedDate, createdBy, updatedBy. */
export interface TableAudit {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

/** Bit flags: 1 = read, 2 = write, 4 = delete. */
export interface TableAcl {
  /** The group code allowed to insert. */
  create?: string;
  default?: {
    /** A user id, or "CURRENT_USER". */
    owner?: string | number;
    /** Group code -> privileges. Only the first entry is used. */
    group?: Record<string, string | number>;
    public?: string | number;
  };
}

export interface TableDefinition {
  /** Model name and URL segment. Lower-cased; defaults to the table name. */
  code?: string;
  /** Set by initialize() to the table key. */
  name?: string;
  /** false turns off the audit columns. */
  audit?: TableAudit | false;
  acl?: TableAcl;
  /** false = no routes at all. A route set to false is not created. delete is off unless enabled. */
  routes?: false | Partial<Record<TableRouteName, false | TableRouteOptions>>;
  /** Added to the model class. Non-function values become functions returning the value. */
  statics?: Record<string, unknown>;
  /** Added to the model prototype. Don't use arrow functions (they lose `this`). */
  methods?: Record<string, unknown>;
  /** Overlaid on the generated column metadata. */
  attributes?: Record<string, TransomColumnOptions>;
  hooks?: InitOptions["hooks"];
  /** Accepted API versions. null/undefined = no Accept-Version header required. */
  versions?: string[] | null;
  /** OpenAPI text for every route of this table. */
  meta?: OpenApiText;
}

/** Sequelize connection settings, with the credentials this package splits out. */
export interface TransomSequelizeConfig extends SequelizeOptions {
  database?: string;
  username?: string;
  password?: string;
  /** Merged over this package's defaults for the first connection attempts. */
  retryOptions?: Record<string, unknown>;
  /** Replaces Sequelize's DATE formatting (always replaced on MSSQL). */
  dateStringify?: (this: DateTypeInternals, date: unknown, options: unknown) => string;
}

/** The `definition.sequelize` section of a Transom API definition, and the plugin options. */
export interface SequelizeDefinition {
  /** Regenerate the metadata files at startup. Only false turns it off. */
  overwrite?: boolean;
  /** Metadata folder, relative to the application root. Default "sequelize-metadata". */
  directory?: string;
  /** Registry key for the Sequelize instance. Default "sequelize". */
  sequelizeKey?: string;
  config: TransomSequelizeConfig;
  tables: Record<string, TableDefinition>;
  preMiddleware?: RouteArg[];
  postMiddleware?: RouteArg[];
  /** Attributes ("attr" or "entity.attr") left out of OpenAPI metadata. */
  openapiIgnore?: string[];
  openapiSecurity?: Record<string, unknown>;
}

/** Plugin options: any part of the definition, overriding the registry's. */
export type TransomSequelizeOptions = Partial<SequelizeDefinition>;

/** Sequelize's DATE type internals, as seen by a dateStringify override. */
export interface DateTypeInternals {
  _applyTimezone(date: unknown, options: unknown): { format(pattern: string): string };
}

// ---- Routes ----------------------------------------------------------------

/** The per-table route description stored in req.locals.__entity. */
export interface RouteEntity {
  entity: string;
  /** The table's API definition (not the Sequelize model). */
  entityObj: TableDefinition;
  modelName: string;
  sequelize: Sequelize;
  versions: string[] | null;
  routes: Partial<Record<TableRouteName, false | TableRouteOptions>>;
}
