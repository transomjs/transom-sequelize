/**
 * Compile-only check of the published types (`npm run typecheck`). It imports the
 * package root and the lib/modelFunctions deep path the way a consumer does, so it
 * reads dist/*.d.ts through package.json "types" and the lib/ shims.
 */
import type { Request, RequestHandler } from "express";
import type { Model, Sequelize } from "sequelize";
import transomSequelize = require("../..");
import ModelFunctions = require("../../lib/modelFunctions");
import HandlerUtils = require("../../lib/handlerUtils");

type TableDefinition = transomSequelize.TableDefinition;
type TableRouteFx = transomSequelize.TableRouteFx;
type SequelizeDefinition = transomSequelize.SequelizeDefinition;
type TransomServerLike = transomSequelize.TransomServerLike;

// The plugin instance.
const initialize: (server: TransomServerLike, options?: transomSequelize.TransomSequelizeOptions) => Promise<void> =
  transomSequelize.initialize;
void initialize;

// A route fx written against plain Express types is accepted.
const updateDeal: TableRouteFx = async (_server, entity, req: Request) => {
  const found = await entity.model.findByPk(String(req.params.__id));
  return found ? found.get() : null;
};

// Middleware typed as Express RequestHandlers is accepted in pre/postMiddleware.
const mapQueryToParams: RequestHandler = (req, _res, next) => {
  Object.assign(req.params, req.query);
  next();
};

const deal: TableDefinition = {
  code: "Deal",
  audit: { createdBy: "created_by" },
  routes: { updateById: { fx: updateDeal }, delete: false, find: { meta: { summary: "List deals" } } },
  statics: { nextVal: () => Promise.resolve({ id: 1 }) },
  attributes: { notes: { queryable: false } },
  versions: null,
};

export const definition: SequelizeDefinition = {
  overwrite: false,
  config: { host: "localhost", database: "app", username: "app", password: "app", dialect: "mysql", port: 3306 },
  tables: { deal, setting: { routes: false }, broker: { audit: false } },
  preMiddleware: [mapQueryToParams, [mapQueryToParams]],
};

// The deep import consumers use for custom fx functions.
export async function findDeals(server: TransomServerLike, sequelize: Sequelize, req: transomSequelize.TransomRequest) {
  const fx = ModelFunctions({ sequelize });
  const model = sequelize.model("deal") as transomSequelize.TransomModel;
  const entity: transomSequelize.TransomEntity = { modelName: "deal", model };
  const { items }: { items: Model[] } = await fx.modelFind(server, entity, req, true);
  const { count }: { count: number } = await fx.modelCount(server, entity, req);
  const { item, skippedFields }: { item: Model; skippedFields: string[] } = await fx.modelInsert(server, entity, req);
  const deleted: number = (await fx.modelDeleteById(server, entity, req)).data.deleted;
  return { items, count, item, skippedFields, deleted };
}

export const utils = HandlerUtils().OPERANDS;
