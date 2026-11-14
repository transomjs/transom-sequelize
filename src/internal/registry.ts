/**
 * Typed reads of registry entries. The registry stores unknown values, so these are
 * the casts at that boundary, in one place.
 */
import type { Sequelize } from "sequelize";
import type { SequelizeDefinition, TransomRegistryLike } from "../types";

/** The `definition.sequelize` section of the API definition (or the default given). */
export function sequelizeDefinition(
  registry: TransomRegistryLike,
  defaultValue: Partial<SequelizeDefinition>,
): Partial<SequelizeDefinition> {
  // transom-core stores the API definition the application passed to initialize().
  return registry.get("transom-config.definition.sequelize", defaultValue) as Partial<SequelizeDefinition>;
}

/** The Sequelize instance initialize() registered under `key`. */
export function sequelizeInstance(registry: TransomRegistryLike, key: string): Sequelize {
  // Set by this package's initialize() before any routes are created.
  return registry.get(key) as Sequelize;
}

/** The URI prefix (transom-core always sets it, default "/api/v1"). */
export function uriPrefix(registry: TransomRegistryLike): string {
  return String(registry.get("transom-config.definition.uri.prefix"));
}
