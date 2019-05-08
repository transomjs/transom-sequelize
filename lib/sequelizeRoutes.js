const debug = require('debug')('transom:sequelize:routes');
const ModelHandler = require('./modelHandler');
const OpenApiMeta = require('./openApiMeta');

module.exports = function SequelizeRoutes(server, options) {
    const regKey = options.sequelizeKey || 'sequelize';
    const sequelize = server.registry.get(regKey);    
    const openapiIgnore = options.openapiIgnore || [];
    const openapiSecurity = options.openapiSecurity || {};

function setupModelHandler() {
    const dbSequelize = server.registry.get('transom-config.definition.sequelize', {});
    const modelHandler = ModelHandler({
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
            debug(`Table '$key' routes not created.`)
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
            debug(`Adding insert route ${uriPrefix}/db/${routeEntity}`);

            server.post({path: `${uriPrefix}/db/${routeEntity}`, 
                        meta: openApiMeta.insertMeta(route, routeEntity), 
                        versions: route.versions}, pre, modelHandler.handleInsert, postMiddleware); //insert single
        }

        // *** READ ***********************************************
        if (route.routes.find !== false) {
            // find query
            debug(`Adding find route ${uriPrefix}/db/${routeEntity}`);

            server.get({path: `${uriPrefix}/db/${routeEntity}`, 
                        meta: openApiMeta.findMeta(route, routeEntity), 
                        versions: route.versions}, pre, modelHandler.handleFind, postMiddleware);
        }

        if (route.routes.findCount !== false) {
            // count query
            debug(`Adding findCount route ${uriPrefix}/db/${routeEntity}/count`);

            server.get({path: `${uriPrefix}/db/${routeEntity}/count`, 
                        meta: openApiMeta.findCountMeta(route, routeEntity), 
                        versions: route.versions}, pre, modelHandler.handleCount, postMiddleware); 
        }

        if (route.routes.findById !== false) {
            // find single
            debug(`Adding findById route ${uriPrefix}/db/${routeEntity}/:__id`);

            server.get({path: `${uriPrefix}/db/${routeEntity}/:__id`, 
                        meta: openApiMeta.findByIdMeta(route, routeEntity), 
                        versions: route.versions}, pre, modelHandler.handleFindById, postMiddleware); 
        }

        // *** UPDATE  ********************************************
        if (route.routes.updateById !== false) {
            // update single
            debug(`Adding updateById route ${uriPrefix}/db/${routeEntity}/:__id`);

            server.put({path: `${uriPrefix}/db/${routeEntity}/:__id`, 
                        meta: openApiMeta.updateByIdMeta(route, routeEntity), 
                        versions: route.versions}, pre, modelHandler.handleUpdateById, postMiddleware);
        }

        // *** DELETE  ********************************************
        if (route.routes.delete !== false) {
             // delete query - This route is disabled by default and must be enabled as needed. 
             // 				It's too easy to blow away the whole collection!
             debug(`Adding delete route ${uriPrefix}/db/${routeEntity}`);

             server.del({path: `${uriPrefix}/db/${routeEntity}`, 
                        meta: openApiMeta.deleteMeta(route, routeEntity), 
                        versions: route.versions}, pre, modelHandler.handleDelete, postMiddleware);
        }

        if (route.routes.deleteBatch !== false) {
             // delete batch
             debug(`Adding deleteBatch route ${uriPrefix}/db/${routeEntity}/batch`);

             server.del({path: `${uriPrefix}/db/${routeEntity}/batch`, 
                        meta: openApiMeta.deleteBatchMeta(route, routeEntity), 
                        versions: route.versions}, pre, modelHandler.handleDeleteBatch, postMiddleware);
        }

        if (route.routes.deleteById !== false) {
            // delete single
            debug(`Adding deleteById route ${uriPrefix}/db/${routeEntity}/:__id`);

            server.del({path: `${uriPrefix}/db/${routeEntity}/:__id`, 
                        meta: openApiMeta.deleteByIdMeta(route, routeEntity), 
                        versions: route.versions}, pre, modelHandler.handleDeleteById, postMiddleware);
        }
    });
};


	return {
		setupModelHandler
	};
};

