"use strict";
const debug = require('debug')('transom:sequelize:handler');
const ModelFunctions = require('./modelFunctions');
const restifyErrors = require('restify-errors');

module.exports = function ModelHandler(options) {
	const IGNORED_ATTRIBUTES = 'Ignored-Attributes';
	const sequelize = options.sequelize;
	const modelFunctions = ModelFunctions({
		sequelize
	});

	function getEntity(req) {
		const entity = {
			modelName: ''
		};
		// req.locals.__entity is populated with middleware on the dynamic routes.
		if (req.locals.__entity) {
			entity.modelName = req.locals.__entity.modelName;
		}
		// adding the model to the Entity itself
		entity.model = sequelize.model(entity.modelName);
		return entity;
	}

	function handleFind(req, res, next) {
		const entity = getEntity(req);
		debug(`HandleFind on ${entity.modelName}`);

        modelFunctions.modelFind(entity, req)
			.then(function (data) {
				// If the user asked for CSV and the model has a csvHeaderRow() function.
				// if (req.params._type === "csv" && typeof entity.model.csvHeaderRow === 'function') {
				// 	debug('Converting handleFind results to CSV.');
				// 	res.setHeader('content-disposition', `attachment; filename=${entity.modelName}-data.csv`);
				// 	res.setHeader('content-type', 'text/csv');
				// 	// Write the file starting with a header row.
				// 	try {
				// 		const csv = entity.model.csvHeaderRow(data.fields);
				// 		res.write(csv.header);
				// 		data.items.map(function (item) {
				// 			res.write(item.csvDataRow(csv.fields));
				// 		});
				// 	} catch (err) {
				// 		debug('Converting handleFind results to CSV failed', err);
				// 		res.write('There was an error writing to your csv file.\n');
				// 		res.write(err);
				// 	}
				// 	res.end();
				// } else {
					res.json({
						'data': data.items
					});
				// }
				next();
			}).catch(function (err) {
				debug(`HandleFind failed`, err);
				if (!err.statusCode) {
					err = new restifyErrors.BadRequestError(err, `Error executing ${entity.modelName} modelFind()`);
				}
				next(err);
			});
	};

	function handleFindById(req, res, next) {
		const entity = getEntity(req);
		debug(`HandleFindById on ${entity.modelName}`);

		modelFunctions.modelFindById(entity, req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				debug('HandleFindById failed', err);
				if (!err.statusCode) {
					err = new restifyErrors.BadRequestError(err, `Error executing ${entity.modelName} modelFindById()`);
				}
				next(err);
			});
	};

	function handleCount(req, res, next) {
		const entity = getEntity(req);
		debug(`handleCount on ${entity.modelName}`);

		modelFunctions.modelCount(entity, req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				debug('HandleCount failed', err);
				next(new restifyErrors.BadRequestError(err, `Error executing ${entity.modelName} modelCount()`));
			});
	};

	function handleInsert(req, res, next) {
		const entity = getEntity(req);
        debug(`handleInsert on ${entity.modelName}`);
        
		modelFunctions.modelInsert(entity, req)
			.then(function (data) {
				if (data.skippedFields && data.skippedFields.length > 0) {
					res.setHeader(IGNORED_ATTRIBUTES, data.skippedFields.join());
				}
				res.json(data.item);
				next();
			}).catch(function (err) {
				debug('HandleInsert failed', err);
				next(new restifyErrors.BadRequestError(err, `Error executing ${entity.modelName} modelInsert()`));
			});	};

	function handleDelete(req, res, next) {
		const entity = getEntity(req);
        debug(`handleDelete on ${entity.modelName}`);
        
		modelFunctions.modelDelete(entity, req)
			.then(function (data) {
				res.json(data);
				next();
			}).catch(function (err) {
				debug('HandleCount failed', err);
				next(new restifyErrors.BadRequestError(err, `Error executing ${entity.modelName} modelCount()`));
			});
    };
    
	function handleDeleteById(req, res, next) {
		const entity = getEntity(req);
		debug(`handleDeleteById on ${entity.modelName}`);

		modelFunctions.modelDeleteById(entity, req)
		.then(function (data) {
			res.json(data);
			next();
		}).catch(function (err) {
			debug('HandleDeleteById failed', err);
			if (!err.statusCode) {
				err = new restifyErrors.BadRequestError(err, `Error executing ${entity.modelName} modelUpdateById()`);
			}
			next(err);
		});
    };

	function handleDeleteBatch(req, res, next) {
		const entity = getEntity(req);
		debug(`handleDeleteBatch on ${entity.modelName}`);

        next(new restifyErrors.NotImplementedError('modelFunctions.handleDeleteBatch'));
    };

	function handleUpdateById(req, res, next) {
		const entity = getEntity(req);
		debug(`handleUpdateById on ${entity.modelName}`);

        modelFunctions.modelUpdateById(entity, req)
		.then(function (data) {
			res.json(data);
			next();
		}).catch(function (err) {
			debug('HandleUpdateById failed', err);
			if (!err.statusCode) {
				err = new restifyErrors.BadRequestError(err, `Error executing ${entity.modelName} modelUpdateById()`);
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