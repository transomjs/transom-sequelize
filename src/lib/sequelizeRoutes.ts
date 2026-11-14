const debug = require('debug')('transom:sequelize:routes');
const ModelHandler = require('./modelHandler');
const OpenApiMeta = require('./openApiMeta');
const TransomCore = require('@transomjs/transom-core');

module.exports = function SequelizeRoutes(server, options) {
    const regKey = options.sequelizeKey || 'sequelize';
    const sequelize = server.registry.get(regKey);    
    const openapiIgnore = options.openapiIgnore || [];
    const openapiSecurity = options.openapiSecurity || {};

function setupModelHandler() {
    const dbSequelize = server.registry.get('transom-config.definition.sequelize', {});
    const modelHandler = ModelHandler({
        server,
        sequelize
    });

    const preMiddleware = options.preMiddleware || [];
    const postMiddleware = options.postMiddleware || [];

    const uriPrefix = server.registry.get('transom-config.definition.uri.prefix');
    const openApiMeta = new OpenApiMeta(server, {
        ignore: openapiIgnore,
        security: openapiSecurity
    });
    const allRoutes = [];

    // Get models based on sequelize.tables in the API definition
    const tables = dbSequelize.tables;
    Object.keys(tables).map((key) => {
        // If routes === false, don't create *any* routes for this Model.
        if (tables[key].routes === false) {
            debug(`Table '${key}' routes not created.`)
        } else {
            const code = (tables[key].code || key).toLowerCase();
            const route = {
                entity: code,
                entityObj: tables[key], // this is just the apiDefinition Object, not the sequelize model!
                modelName: code,
                sequelize,
                versions: tables[key].versions || null // If null, doesn't require the 'Accept-Version' header.
            };
            route.routes = Object.assign({ delete: false }, tables[key].routes);

            allRoutes.push(route);
        }
    });

    // Map the known routes to endpoints.
    allRoutes.map(function (route) {
        // Copy the preMiddleware and append one that adds route details to req.locals.__entity
        // This tells the modelHandler which models to use!
        const pre = preMiddleware.slice(0);
        pre.push(function (req, res, next) {
            const r = Object.assign({}, route); // Don't modify route as it stays in scope
            req.locals.__entity = r;
            next();
        });

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
                operation: 'insert',
                entity: routeEntity,
                versions: route.versions
            }
            server.post(path, pre, TransomCore.withMeta(metadata, modelHandler.handleInsert), postMiddleware); 
        }

        // *** READ ***********************************************
        if (route.routes.find !== false) {
            // find query
            const path = `${uriPrefix}/db/${routeEntity}`;
            const metadata = {
                path,
                openApi: openApiMeta.findMeta(route, routeEntity),
                operation: 'find',
                entity: routeEntity,
                versions: route.versions
            }
            debug(`Adding find route ${path}`);

            server.get(path, pre, TransomCore.withMeta(metadata, modelHandler.handleFind), postMiddleware);
        }

        if (route.routes.findCount !== false) {
            // count query
            const path = `${uriPrefix}/db/${routeEntity}/count`;
            const metadata = {
                path,
                openApi: openApiMeta.findCountMeta(route, routeEntity),
                operation: 'findCount',
                entity: routeEntity,
                versions: route.versions
            }
            debug(`Adding findCount route ${path}`);
            server.get(path, pre, TransomCore.withMeta(metadata, modelHandler.handleCount), postMiddleware);
        }

        if (route.routes.findById !== false) {
            // find single
            const path = `${uriPrefix}/db/${routeEntity}/:__id`;
            const metadata = {
                path,
                openApi: openApiMeta.findByIdMeta(route, routeEntity),
                operation: 'findById',
                entity: routeEntity,
                versions: route.versions
            }
            debug(`Adding findById route ${path}`);
            server.get(path, pre, TransomCore.withMeta(metadata, modelHandler.handleFindById), postMiddleware);
        }

        // *** UPDATE  ********************************************
        if (route.routes.updateById !== false) {
            // update single
            const path = `${uriPrefix}/db/${routeEntity}/:__id`;
            const metadata = {
                path,
                openApi: openApiMeta.updateByIdMeta(route, routeEntity),
                operation: 'updateById',
                entity: routeEntity,
                versions: route.versions
            }
            debug(`Adding updateById route ${path}`);
            server.put(path, pre, TransomCore.withMeta(metadata, modelHandler.handleUpdateById), postMiddleware);
        }

        // *** DELETE  ********************************************
        if (route.routes.delete !== false) {
             // delete query - This route is disabled by default and must be enabled as needed. 
             // 				It's too easy to blow away the whole collection!
             const path = `${uriPrefix}/db/${routeEntity}`;
             const metadata = {
                path,
                openApi: openApiMeta.deleteMeta(route, routeEntity),
                operation: 'delete',
                entity: routeEntity,
                versions: route.versions
            }
             debug(`Adding delete route ${path}`);
             server.del(path, pre, TransomCore.withMeta(metadata, modelHandler.handleDelete), postMiddleware);
        }

        if (route.routes.deleteBatch !== false) {
             // delete batch
             const path = `${uriPrefix}/db/${routeEntity}/batch`;
            const metadata = {
                path,
                openApi: openApiMeta.deleteBatchMeta(route, routeEntity),
                operation: 'deleteBatch',
                entity: routeEntity,
                versions: route.versions
            }
             debug(`Adding deleteBatch route ${path}`);
             server.del(path, pre, TransomCore.withMeta(metadata, modelHandler.handleDeleteBatch), postMiddleware);
        }

        if (route.routes.deleteById !== false) {
            // delete single
            const path = `${uriPrefix}/db/${routeEntity}/:__id`;
            const metadata = {
                path,
                openApi: openApiMeta.deleteByIdMeta(route, routeEntity),
                operation: 'deleteById',
                entity: routeEntity,
                versions: route.versions
            }
            debug(`Adding deleteById route ${path}`);
            server.del(path, pre, TransomCore.withMeta(metadata, modelHandler.handleDeleteById), postMiddleware);
        }
    });
};


	return {
		setupModelHandler
	};
};

