import createDebug from "debug";
import type { RouteEntity, TransomServerLike } from "../types";

const debug = createDebug("transom:sequelize:openapi");

declare namespace OpenApiMeta {
  interface Schema {
    type?: string;
    format?: string;
    required?: string[];
    properties?: Record<string, Schema>;
    $ref?: string;
  }

  interface Parameter {
    name?: string;
    in?: "path" | "query";
    description?: string;
    required?: boolean;
    schema?: Schema;
  }

  interface Response {
    description: string;
    content?: Record<string, { schema: Schema }>;
  }

  /** The metadata one endpoint contributes to an OpenAPI document. */
  interface EndpointMeta {
    summary: string;
    description: string | null;
    operationId: string;
    tags: string[];
    parameters: Parameter[];
    schemas: Record<string, Schema>;
    security: Record<string, unknown>;
    responses: Record<string, Response>;
    requestBody?: {
      description?: string;
      required?: boolean;
      content?: Record<string, { schema: Schema }>;
    };
  }

  /** Evaluated after all plugins are loaded, with `this.method` set to the HTTP method. */
  type EndpointMetaFn = (this: { method: string }) => EndpointMeta;

  type MetaBuilder = (route: RouteEntity, routeEntity: string) => EndpointMetaFn;

  interface Options {
    /** Attributes ("attr" or "entity.attr") left out of the metadata. */
    ignore?: string[];
    security?: Record<string, unknown>;
  }

  interface Functions {
    /** The OpenAPI schema for a Sequelize data type instance. */
    instanceTypes(instance: unknown): Schema;
    getSelectParameter(routeEntity: string): Parameter;
    insertMeta: MetaBuilder;
    findBinaryMeta: MetaBuilder;
    findByIdMeta: MetaBuilder;
    findMeta: MetaBuilder;
    findCountMeta: MetaBuilder;
    updateByIdMeta: MetaBuilder;
    deleteMeta: MetaBuilder;
    deleteBatchMeta: MetaBuilder;
    deleteByIdMeta: MetaBuilder;
    endpointMeta(
      route: RouteEntity,
      operationId: string,
      urlParameters: Record<string, Parameter> | null | undefined,
      extraParameters: Record<string, Parameter> | null | undefined,
      ignoreParameters: string | string[] | null | undefined,
      successResponse: Response,
    ): EndpointMetaFn;
  }
}


/** OpenAPI metadata builders for the generated routes. The server argument is unused. */
function OpenApiMeta(_server: TransomServerLike, options: OpenApiMeta.Options): OpenApiMeta.Functions {
  const openapiIgnore = options.ignore || [];
  const openapiSecurity = options.security || {};

  // Map Transom datatypes to OpenApi datatype schemas.
  function instanceTypes(instance: unknown): OpenApiMeta.Schema {
    const schema: OpenApiMeta.Schema = {};
    const instanceStr = readConstructorName(instance);
    switch (instanceStr.toLowerCase()) {
      case "boolean":
        schema.type = "boolean";
        break;
      case "date":
        schema.type = "string";
        schema.format = "date";
        break;
      case "datetime":
        schema.type = "string";
        schema.format = "date-time";
        break;
      case "number":
      case "integer":
      case "int32":
        schema.type = "integer";
        schema.format = "int32";
        break;
      case "int64":
        schema.type = "integer";
        schema.format = "int64";
        break;
      case "float":
        schema.type = "number";
        schema.format = "float";
        break;
      case "double":
        schema.type = "number";
        schema.format = "double";
        break;
      case "string":
      case "connector":
      case "objectid":
      default:
        schema.type = "string";
    }
    return schema;
  }

  function getSelectParameter(routeEntity: string): OpenApiMeta.Parameter {
    return {
      description: `A comma delimited list of ${routeEntity} attributes to be included in the results.`,
    };
  }

  function insertMeta(route: RouteEntity, routeEntity: string): OpenApiMeta.EndpointMetaFn {
    const urlParameters = {};
    const extraParameters = {};
    const ignoreParameters = ["*"];
    const successResponse = {
      description: `A copy of the newly inserted ${routeEntity} object`,
      content: {
        "application/json": {
          schema: {
            // TODO: Provide a schema that excludes the _id and timestamps!
            $ref: `#/components/schemas/${routeEntity}-single`,
          },
        },
      },
    };
    return endpointMeta(route, "insert", urlParameters, extraParameters, ignoreParameters, successResponse);
  }

  function findBinaryMeta(route: RouteEntity, routeEntity: string): OpenApiMeta.EndpointMetaFn {
    const urlParameters = {
      ":__id": {
        description: `Id of the ${routeEntity} record with a binary attachment.`,
      },
      ":__attribute": {
        description: `Field on the ${routeEntity} where binary data is stored.`,
      },
      ":__filename": {
        description: `The name of the file uploaded into to the binary data attribute.`,
      },
    };
    const extraParameters = {
      _select: getSelectParameter(routeEntity),
    };
    const ignoreParameters = ["*"]; // ignore all the model attributes
    const successResponse = {
      description: `A file object whose mime-type depends on the name of the uploaded file.`,
      content: {
        "*": {
          schema: {
            type: "string",
            format: "binary",
          },
        },
      },
    };
    return endpointMeta(
      route,
      `find${routeEntity}Binary`,
      urlParameters,
      extraParameters,
      ignoreParameters,
      successResponse,
    );
  }

  function findByIdMeta(route: RouteEntity, routeEntity: string): OpenApiMeta.EndpointMetaFn {
    const urlParameters = {
      ":__id": {
        description: `Id of the ${routeEntity} to fetch.`,
      },
    };
    const extraParameters = {
      _select: getSelectParameter(routeEntity),
    };
    const ignoreParameters = ["*"]; // ignore all the model attributes
    const successResponse = {
      description: `A ${routeEntity} object`,
      content: {
        "application/json": {
          schema: {
            $ref: `#/components/schemas/${routeEntity}-single`,
          },
        },
      },
    };
    return endpointMeta(route, "findById", urlParameters, extraParameters, ignoreParameters, successResponse);
  }

  function findMeta(route: RouteEntity, routeEntity: string): OpenApiMeta.EndpointMetaFn {
    const urlParameters = {};
    const extraParameters = {
      _select: getSelectParameter(routeEntity),
      _skip: {
        description: `The number of records to be skipped in the results.`,
      },
      _limit: {
        description: `Limit the number of ${routeEntity} records to be returned in the results.`,
      },
      _sort: {
        description: `The name of an attribute to sort the results. Prefix with "-" to sort descending.`,
      },
    };
    const ignoreParameters: string[] = [];
    const successResponse = {
      description: `An Array of ${routeEntity} objects`,
      content: {
        "application/json": {
          schema: {
            $ref: `#/components/schemas/${routeEntity}-list`,
          },
        },
      },
    };
    return endpointMeta(route, "find", urlParameters, extraParameters, ignoreParameters, successResponse);
  }

  function findCountMeta(route: RouteEntity, routeEntity: string): OpenApiMeta.EndpointMetaFn {
    const urlParameters = {};
    const extraParameters = {};
    const ignoreParameters: string[] = [];
    const successResponse = {
      description: `An Array of ${routeEntity} objects`,
      content: {
        "application/json": {
          schema: {
            $ref: `#/components/schemas/${routeEntity}-list`,
          },
        },
      },
    };
    return endpointMeta(route, "findCount", urlParameters, extraParameters, ignoreParameters, successResponse);
  }

  function updateByIdMeta(route: RouteEntity, routeEntity: string): OpenApiMeta.EndpointMetaFn {
    const urlParameters = {
      ":__id": {
        description: `Id of the ${routeEntity} to update.`,
      },
    };
    const extraParameters = {};
    const ignoreParameters = ["*"];
    const successResponse = {
      description: `A ${routeEntity} object`,
      content: {
        "application/json": {
          schema: {
            // TODO: Provide a schema that excludes the _id and timestamps!
            $ref: `#/components/schemas/${routeEntity}-single`,
          },
        },
      },
    };
    return endpointMeta(route, "updateById", urlParameters, extraParameters, ignoreParameters, successResponse);
  }

  function deleteMeta(route: RouteEntity, routeEntity: string): OpenApiMeta.EndpointMetaFn {
    const urlParameters = {};
    const extraParameters = {};
    const ignoreParameters: string[] = [];
    const successResponse = {
      description: `An Array of ${routeEntity} objects`,
      content: {
        "application/json": {
          schema: {
            $ref: `#/components/schemas/${routeEntity}-list`,
          },
        },
      },
    };
    return endpointMeta(route, "delete", urlParameters, extraParameters, ignoreParameters, successResponse);
  }

  function deleteBatchMeta(route: RouteEntity, routeEntity: string): OpenApiMeta.EndpointMetaFn {
    const urlParameters = {};
    const extraParameters = {};
    const ignoreParameters: string[] = [];
    const successResponse = {
      description: `An Array of ${routeEntity} Ids`,
      content: {
        "application/json": {
          schema: {
            $ref: `#/components/schemas/${routeEntity}-list`,
          },
        },
      },
    };
    return endpointMeta(route, "deleteBatch", urlParameters, extraParameters, ignoreParameters, successResponse);
  }

  function deleteByIdMeta(route: RouteEntity, routeEntity: string): OpenApiMeta.EndpointMetaFn {
    const urlParameters = {
      ":__id": {
        description: `Id of the ${routeEntity} to update.`,
      },
    };
    const extraParameters = {};
    const ignoreParameters = ["*"];
    const successResponse = {
      description: `An object that indicates the number of {routeEntity} records deleted.`,
      content: {
        "application/json": {
          schema: {
            $ref: `#/components/schemas/delete`,
          },
        },
      },
    };
    return endpointMeta(route, "deleteById", urlParameters, extraParameters, ignoreParameters, successResponse);
  }

  // Return a function to be evaluated *after* all plugins are loaded.
  function endpointMeta(
    route: RouteEntity,
    operationId: string,
    urlParameters: Record<string, OpenApiMeta.Parameter> | null | undefined,
    extraParameters: Record<string, OpenApiMeta.Parameter> | null | undefined,
    ignoreParameters: string | string[] | null | undefined,
    successResponse: OpenApiMeta.Response,
  ): OpenApiMeta.EndpointMetaFn {
    const entity = route.entity;
    const entityObj = route.entityObj;
    // operationId is usually a route name, but findBinaryMeta passes "find<entity>Binary".
    const routeOptions: unknown = Reflect.get(route.routes, operationId);
    const routeMeta =
      (typeof routeOptions === "object" && routeOptions !== null ? readMeta(routeOptions) : null) || {};
    const sequelize = route.sequelize;
    const urlParams = urlParameters || {};
    const extraParams = extraParameters || {};
    const ignoreParams = (typeof ignoreParameters === "string" ? [ignoreParameters] : ignoreParameters) || [];

    return function (this: { method: string }): OpenApiMeta.EndpointMeta {
      debug(`OpenApi ${this.method} endpoint meta for ${entity}.`);
      const entityMeta = entityObj.meta || {};
      const meta: OpenApiMeta.EndpointMeta = {
        summary: routeMeta.summary || entityMeta.summary || `Execute ${this.method} request with ${entity}.`,
        description: routeMeta.description || entityMeta.description || null,
        operationId: `${operationId}-${entity}`,
        tags: [entity],
        parameters: [],
        schemas: {},
        security: {},
        responses: {},
      };
      if (this.method === "post" || this.method === "put" || this.method === "patch") {
        meta.requestBody = {};
        meta.requestBody.description = `${this.method === "post" ? "Insert" : "Update"} a ${entity}.`;
        meta.requestBody.required = true;
        meta.requestBody.content = {
          "application/json": {
            schema: {
              $ref: `#/components/schemas/${entity}-single`,
            },
          },
          "application/x-www-form-urlencoded": {
            schema: {
              $ref: `#/components/schemas/${entity}-single`,
            },
          },
        };
      }
      // Add any url parameters!
      for (const [param, parameter] of Object.entries(urlParams)) {
        parameter.name = param;
        parameter.in = "path";
        parameter.required = true;
        meta.parameters.push(parameter);
      }
      // Add any extra parameters!
      for (const [param, parameter] of Object.entries(extraParams)) {
        parameter.name = param;
        parameter.in = "query";
        parameter.required = false;
        meta.parameters.push(parameter);
      }
      // Add any security!
      Object.keys(openapiSecurity).map((param) => {
        meta.security[param] = openapiSecurity[param];
      });

      const model = sequelize.models[route.modelName];
      if (model) {
        if (ignoreParams.includes("*")) {
          debug(`OpenApi skipping all attributes from ${entity}`);
        } else {
          const required: string[] = []; // array of mandatory attribute names
          const properties: Record<string, OpenApiMeta.Schema> = {}; // attributes w/ openapi datatype schemas
          const schema: OpenApiMeta.Schema = { required, properties };

          // Every attribute, named as the API uses it (e.g. fullName). An ignore entry may
          // use the attribute or the column name (full_name), with or without the entity.
          for (const [attribute, fieldAttr] of Object.entries(model.rawAttributes)) {
            const names = [attribute, fieldAttr.field ?? attribute];
            if (
              names.some(
                (name) =>
                  ignoreParams.includes(name) || openapiIgnore.includes(name) || openapiIgnore.includes(`${entity}.${name}`),
              )
            ) {
              debug(`OpenApi skipping attribute ${entity}.${attribute}`);
            } else {
              if (!fieldAttr.allowNull) {
                required.push(attribute);
              }
              const transomSchemaType = fieldAttr.type;
              properties[attribute] = instanceTypes(transomSchemaType);
              const parameter: OpenApiMeta.Parameter = {
                name: attribute,
                in: "query",
                description: fieldAttr.comment || `${attribute} comment not provided`,
                required: false,
                schema: instanceTypes(transomSchemaType),
              };
              meta.parameters.push(parameter);
            }
          }
          meta.schemas[`${entity}-single`] = schema;
        }
        // These schemas should always get included.
        meta.schemas["error"] = {
          required: ["code", "message"],
          properties: {
            code: {
              type: "string",
            },
            message: {
              type: "string",
            },
          },
        };
        meta.schemas["delete"] = {
          required: ["deleted"],
          properties: {
            deleted: {
              type: "integer",
            },
          },
        };
        meta.responses["200"] = successResponse;
        meta.responses["default"] = {
          description: "unexpected error",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/error",
              },
            },
          },
        };
      } else {
        debug(`OpenApi did not find a sequelize model for '${String(Reflect.get(route, "modelPrefix")) + route.modelName}'.`);
      }
      return meta;
    };
  }

  return {
    instanceTypes,
    getSelectParameter,
    insertMeta,
    findBinaryMeta,
    findByIdMeta,
    findMeta,
    findCountMeta,
    updateByIdMeta,
    deleteMeta,
    deleteBatchMeta,
    deleteByIdMeta,
    endpointMeta,
  };
}

/** instance.constructor.name, failing (as before) when there's no constructor. */
function readConstructorName(instance: unknown): string {
  if (instance === null || instance === undefined) {
    throw new TypeError(`Cannot read properties of ${String(instance)} (reading 'constructor')`);
  }
  const ctor: unknown = Reflect.get(Object(instance), "constructor");
  const name: unknown = typeof ctor === "function" ? ctor.name : undefined;
  if (typeof name !== "string") {
    throw new TypeError("Cannot read properties of undefined (reading 'toLowerCase')");
  }
  return name;
}

/** A route option's `meta` (OpenAPI summary/description), if it has one. */
function readMeta(routeOptions: object): { summary?: string; description?: string } | null {
  const meta: unknown = Reflect.get(routeOptions, "meta");
  if (typeof meta !== "object" || meta === null) {
    return null;
  }
  const summary: unknown = Reflect.get(meta, "summary");
  const description: unknown = Reflect.get(meta, "description");
  return {
    summary: typeof summary === "string" ? summary : undefined,
    description: typeof description === "string" ? description : undefined,
  };
}

export = OpenApiMeta;
