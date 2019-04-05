// const assert = require('assert');
// const {
// 	Schema,
// 	Types
// } = require('mongoose');
const debug = require('debug')('transom:sequelize:routes');
const ModelHandler = require('./modelHandler');
// const modelUtils = require('./modelUtils');

module.exports = function SequelizeRoutes(options) {
    const server = options.server;
    const sequelize = options.sequelize;    
	// const modelPrefix = options.modelPrefix;
	// const customTypeKey = options.typeKey || '$type';
	// const auditablePlugin = options.auditable;
	// const aclPlugin = options.acl;
	// const toCsvPlugin = options.toCsv;
	// const userPlugins = options.plugins || [];

function setupModelHandler() {
    const dbSequelize = server.registry.get('transom-config.definition.sequelize', {});
    const modelHandler = ModelHandler({
        sequelize
    });

    const preMiddleware = options.preMiddleware || [];
    const postMiddleware = options.postMiddleware || [];

    const uriPrefix = server.registry.get('transom-config.definition.uri.prefix');
    // const openApiMeta = new OpenApiMeta(server, {
    //     ignore: openapiIgnore,
    //     security: openapiSecurity
    // });
    const allRoutes = [];

    // Get models based on sequelize.tables in the API definition
    const tables = dbSequelize.tables;
    Object.keys(tables).map((key) => {
        const code = (tables[key].code || key).toLowerCase();
        const model = sequelize.models[code];

        const route = {
            entity: code,
            entityObj: tables[key], // this is just the apiDefinition Object, not the sequelize model!
            modelName: code,
            sequelize,
            versions: tables[key].versions || null // If null, doesn't require the 'Accept-Version' header.
        };
        route.routes = tables[key].routes ? tables[key].routes : { delete: false };
        // route.meta = openApiMeta.endpointMeta(route);
        allRoutes.push(route);
    });

    // Map the known routes to endpoints.
    allRoutes.map(function (route) {
        // Copy the preMiddleware and append one that adds route details to req.locals.__entity
        // This tells the modelHandler which mongoose models to use!
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
            server.post({path: `${uriPrefix}/db/${routeEntity}`, 
                        // meta: openApiMeta.insertMeta(route, routeEntity), 
                        versions: route.versions}, pre, modelHandler.handleInsert, postMiddleware); //insert single
        }

        // *** READ ***********************************************
        if (route.routes.find !== false) {
            // find query
            server.get({path: `${uriPrefix}/db/${routeEntity}`, 
                        // meta: openApiMeta.findMeta(route, routeEntity), 
                        versions: route.versions}, pre, modelHandler.handleFind, postMiddleware);
        }
        if (route.routes.findCount !== false) {
            // count query
            server.get({path: `${uriPrefix}/db/${routeEntity}/count`, 
                        // meta: openApiMeta.findCountMeta(route, routeEntity), 
                        versions: route.versions}, pre, modelHandler.handleCount, postMiddleware); 
        }
        // if (route.routes.findBinary !== false) {
        //     // find single with stored binary
        //     server.get({path: `${uriPrefix}/db/${routeEntity}/:__id/:__attribute/:__filename`, 
        //                 // meta: openApiMeta.findBinaryMeta(route, routeEntity), 
        //                 versions: route.versions}, pre, modelHandler.handleFindBinary, postMiddleware); 
        // }
        if (route.routes.findById !== false) {
            // find single
            debug(`Adding findById route ${uriPrefix}/db/${routeEntity}/:__id`);

            server.get({path: `${uriPrefix}/db/${routeEntity}/:__id`, 
                        // meta: openApiMeta.findByIdMeta(route, routeEntity), 
                        versions: route.versions}, pre, modelHandler.handleFindById, postMiddleware); 
        }

        // *** UPDATE  ********************************************
        if (route.routes.updateById !== false) {
            // update single
            server.put({path: `${uriPrefix}/db/${routeEntity}/:__id`, 
                        // meta: openApiMeta.updateByIdMeta(route, routeEntity), 
                        versions: route.versions}, pre, modelHandler.handleUpdateById, postMiddleware);
        }

        // *** DELETE  ********************************************
        if (route.routes.delete !== false) {
             // delete query - This route is disabled by default ans must be enabled as needed. 
             // 				It's too easy to blow away the whole collection!
            server.del({path: `${uriPrefix}/db/${routeEntity}`, 
                        // meta: openApiMeta.deleteMeta(route, routeEntity), 
                        versions: route.versions}, pre, modelHandler.handleDelete, postMiddleware);
        }
        if (route.routes.deleteBatch !== false) {
             // delete batch
            server.del({path: `${uriPrefix}/db/${routeEntity}/batch`, 
                        // meta: openApiMeta.deleteBatchMeta(route, routeEntity), 
                        versions: route.versions}, pre, modelHandler.handleDeleteBatch, postMiddleware);
        }
        if (route.routes.deleteById !== false) {
            // delete single
            server.del({path: `${uriPrefix}/db/${routeEntity}/:__id`, 
                        // meta: openApiMeta.deleteByIdMeta(route, routeEntity), 
                        versions: route.versions}, pre, modelHandler.handleDeleteById, postMiddleware);
        }
    });
};


	return {
		setupModelHandler
	};
};

