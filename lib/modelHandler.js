"use strict";
const debug = require('debug')('transom:sequelize:handler');
const ModelFunctions = require('./modelFunctions');
const createError = require('http-errors');

module.exports = function ModelHandler(options) {
	const IGNORED_ATTRIBUTES = 'Ignored-Attributes';
	const server = options.server;
	const sequelize = options.sequelize;

	const modelFunctions = ModelFunctions({
		sequelize
	});

	function getEntity(req, routeName) {
		const entity = {
			modelName: ''
		};
		// req.locals.__entity is populated with middleware on the dynamic routes.
		if (req.locals.__entity) {
			entity.modelName = req.locals.__entity.modelName;
			if (req.locals.__entity.routes && req.locals.__entity.routes[routeName]) {
				entity.fx = req.locals.__entity.routes[routeName].fx;
				entity.responder = req.locals.__entity.routes[routeName].responder;
			}
		}
		// adding the model to the Entity itself
		entity.model = sequelize.model(entity.modelName);
		return entity;
	}

	function scrubAclValues(item){
		// field == 'aclOwner' || field == 'aclGroup' || field == 'aclGroupPrivs' || field == 'aclPublicPrivs';
		item.aclOwner = undefined;
		item.aclGroup = undefined;
		item.aclGroupPrivs = undefined;
		item.aclPublicPrivs = undefined;

		return item;
	}

	function jsonResponder(server, entity, req, res, data) {
		if (data.skippedFields && data.skippedFields.length > 0) {
			res.setHeader(IGNORED_ATTRIBUTES, data.skippedFields.join());
		}
		res.json(scrubAclValues(data.item));
		return Promise.resolve();
	}

	function jsonArrayResponder(server, entity, req, res, data) {
		res.json({
			'data': data.items.map(item => scrubAclValues(item))
		});
		return Promise.resolve();
	}	

	function handleFind(req, res, next) {
		const entity = getEntity(req, "find");
		debug(`HandleFind on ${entity.modelName}`);

		const modelFx = entity.fx || modelFunctions.modelFind;
		modelFx(server, entity, req)
			.then((data) => {
				const responder = entity.responder || jsonArrayResponder;
				return responder(server, entity, req, res, data);
			}).then(() => {
				next();
			}).catch(function (err) {
				debug(`HandleFind failed`, err);
				if (!err.status && !err.statusCode) {
					err = createError(400, `Error executing ${entity.modelName} modelFind()`);
				}
				next(err);
			});
	};

	function handleFindById(req, res, next) {
		const entity = getEntity(req, "findById");
		debug(`HandleFindById on ${entity.modelName}`);

		const modelFx = entity.fx || modelFunctions.modelFindById;
		modelFx(server, entity, req)
			.then((data) => {
				const responder = entity.responder || jsonResponder;
				return responder(server, entity, req, res, {item: data});
			}).then(() => {
				next();
			}).catch(function (err) {
				debug('HandleFindById failed', err);
				if (!err.status && !err.statusCode) {
					err = createError(400, `Error executing ${entity.modelName} modelFindById()`);
				}
				next(err);
			});
	};

	function handleCount(req, res, next) {
		const entity = getEntity(req, "findCount");
		debug(`handleCount on ${entity.modelName}`);

		const modelFx = entity.fx || modelFunctions.modelCount;
		modelFx(server, entity, req)
			.then((data) => {
				const responder = entity.responder || jsonResponder;
				return responder(server, entity, req, res, {item: data});
			}).then(() => {
				next();	
			}).catch(function (err) {
				debug('HandleCount failed', err);
				next(createError(400, `Error executing ${entity.modelName} modelCount()`));
			});
	};

	function handleInsert(req, res, next) {
		const entity = getEntity(req, "insert");
        debug(`handleInsert on ${entity.modelName}`);
        
		const modelFx = entity.fx || modelFunctions.modelInsert;
		modelFx(server, entity, req)
			.then((data) => {
				const responder = entity.responder || jsonResponder;
				return responder(server, entity, req, res, data);
			}).then(() => {
				next();
			}).catch(function (err) {
				debug('HandleInsert failed', err);
				next(createError(400, `Error executing ${entity.modelName} modelInsert()`));
			});	
	};

	function handleDelete(req, res, next) {
		const entity = getEntity(req, "delete");
        debug(`handleDelete on ${entity.modelName}`);
        
		const modelFx = entity.fx || modelFunctions.modelDelete;
		modelFx(server, entity, req)
			.then((data) => {
				const responder = entity.responder || jsonResponder;
				return responder(server, entity, req, res, {item: data});
			}).then(() => {
				next();
			}).catch(function (err) {
				debug('HandleCount failed', err);
				next(createError(400, `Error executing ${entity.modelName} modelCount()`));
			});
    };
    
	function handleDeleteById(req, res, next) {
		const entity = getEntity(req, "deleteById");
		debug(`handleDeleteById on ${entity.modelName}`);

		const modelFx = entity.fx || modelFunctions.modelDeleteById;
		modelFx(server, entity, req)
		.then((data) => {
			const responder = entity.responder || jsonResponder;
			return responder(server, entity, req, res, {item: data});
		}).then(() => {
			next();
		}).catch(function (err) {
			debug('HandleDeleteById failed', err);
			if (!err.status && !err.statusCode) {
				err = createError(400, `Error executing ${entity.modelName} modelDeleteById()`);
			}
			next(err);
		});
    };

	function handleDeleteBatch(req, res, next) {
		const entity = getEntity(req, "deleteBatch");
		debug(`handleDeleteBatch on ${entity.modelName}`);

		const modelFx = entity.fx || modelFunctions.modelDeleteBatch;
		modelFx(server, entity, req)
		.then((data) => {
			const responder = entity.responder || jsonResponder;
			return responder(server, entity, req, res, {item: data});
		}).then(() => {
			next();
		}).catch(function (err) {
			debug('HandleDeleteBatch failed', err);
			if (!err.status && !err.statusCode) {
				err = createError(400, `Error executing ${entity.modelName} modelDeleteBatch()`);
			}
			next(err);
		});		
    };

	function handleUpdateById(req, res, next) {
		const entity = getEntity(req, "updateById");
		debug(`handleUpdateById on ${entity.modelName}`);

		const modelFx = entity.fx || modelFunctions.modelUpdateById;
		modelFx(server, entity, req)
		.then((data) => {
			const responder = entity.responder || jsonResponder;
			return responder(server, entity, req, res, {item: data});
		}).then(() => {
			next();
		}).catch(function (err) {
			debug('HandleUpdateById failed', err);
			if (!err.status && !err.statusCode) {
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
		handleUpdateById
	};
};