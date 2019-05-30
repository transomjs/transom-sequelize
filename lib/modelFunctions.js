"use strict";
const debug = require('debug')('transom:sequelize:functions');
const HandlerUtils = require('./handlerUtils');
const restifyErrors = require('restify-errors');

module.exports = function ModelFunctions(options) {
    const sequelize = options.sequelize;
    const handlerUtils = new HandlerUtils({
        sequelize
    });

    function modelFind(entity, req) {
        const model = entity.model;
        return new Promise(function (resolve, reject) {
            const query = handlerUtils.buildQuery({}, req, entity);

            // Used for Select & Populate.
            const separated = handlerUtils.separateApiOperations(req.query, model);
            const operations = separated.operands || {};

            // Build the select for this query.
            const selectOpts = handlerUtils.processSelectOperator(model, operations['_select']);

            // Apply the select list *after* we process the _connect operator.
            if (selectOpts.attributes && selectOpts.attributes.length > 0) {
                query.attributes = selectOpts.attributes;
            }

            model.findAll(query).then((items) => {
                debug('Fetching findAll() completed');
                resolve({
                    items
                });
            }).catch(function (err) {
                debug(`Error executing ${entity.modelName} model findAll()`, err);
                reject(err);
            });
        });
    }
    
    function modelFindById(entity, req) {
        const model = entity.model;
        return new Promise(function (resolve, reject) {
            const id = handlerUtils.getStrongPkValue(req.params.__id, model);

            // Used for Select & Populate.
            const separated = handlerUtils.separateApiOperations(req.query, model);
            const operations = separated.operands || {};
            const queryOptions = {};

            // Build the select for this query.
            const selectOpts = handlerUtils.processSelectOperator(model, operations['_select']);

            // Apply the select list *after* we process the _connect operator.
            if (selectOpts.attributes && selectOpts.attributes.length > 0) {
                queryOptions.attributes = selectOpts.attributes;
            }
            
            model.findByPk(id, queryOptions).then(function (item) {
                if (!item) {
                    debug(`Model ${entity.modelName} findById() record not found`);
                    return reject(new restifyErrors.NotFoundError('Not Found'));
                }
                resolve(item);
            }).catch(function (err) {
                debug(`Error executing model ${entity.modelName} findById()`, err);
                reject(err);
            });
        });
    }

    function modelCount(entity, req) {
        const model = entity.model;
        return new Promise( (resolve, reject) => {
            const query = handlerUtils.buildQuery({}, req, entity);

            model.count(query).then((count) => {
                resolve({
                    count
                });
            });
        });
    }

    function modelInsert(entity, req) {
        const model = entity.model;

        /***************************************************
         * EXAMPLE, do not delete this comment.
         ***************************************************
         * If a table PK is not using AutoIncrement, optionally use
         * a Model static function to fetch the next Pk value with sql.
         * NOTE: Don't use fat-arrow functions, we need access to `this`.
         * 
         *  statics: {
         *   nextVal: function() {
         *     return this.sequelize
         *       .query("SELECT max(emp_no)+1 as 'empNo' from employees.employees", {
         *         type: this.sequelize.Sequelize.QueryTypes.SELECT
         *       }).then(results => results[0]);
         *   }
         * },
         */
        let nextValResult;
        if (typeof model.nextVal === 'function') {
            nextValResult = model.nextVal();
        } else {
            nextValResult = Promise.resolve();
        }

        const skippedFields = [];
        return nextValResult.then((nextVal) => {
                const values = Object.assign({}, req.body, nextVal);

                // Check that provided values map to the Entity.
                Object.keys(values || {}).map( (path) => {
                    if (!model.rawAttributes.hasOwnProperty(path)) {
                        delete values[path];
                        skippedFields.push(path);
                    }
                });

                return model.create(values);
            }).then((item) => {
                return {
                        item,
                        skippedFields
                    };
                }).catch((err) => {
                    debug(`Error executing ${entity.modelName} modelInsert`, err);
                    throw err;
                });
    }

    function modelDelete(entity, req) {
        const model = entity.model;
        return new Promise( (resolve, reject) => {
            const query = handlerUtils.buildQuery({}, req, entity);

            model.destroy(query).then((result) => {
                resolve({
                    data: {
                        deleted: result
                    }
                });
            });
        });
    }

    function modelDeleteById(entity, req) {
        const model = entity.model;
        return new Promise(function (resolve, reject) {
            const id = handlerUtils.getStrongPkValue(req.params.__id, model);
            const query = {
                where: {
                    [model.primaryKeyAttribute]: id
                  }
            };
            model.destroy(query).then(function (result) {
                debug(`Delete model ${entity.modelName} by Id: ${id}`, result);
                resolve({
                    data: {
                        deleted: result
                    }
                });
            }).catch(function (err) {
                debug(`Error executing model ${entity.modelName} deleteById()`, err);
                reject(err);
            });
        });
    }

    function modelDeleteBatch(entity, req) {
        const model = entity.model;
        const Op = sequelize.Sequelize.Op;

        return new Promise(function (resolve, reject) {
            const inList = [];
            try {                
                let deleteIdList = (req.body || {})[model.primaryKeyAttribute];
                if (!deleteIdList) {
                    throw new Error(`Request body must contain a "${model.primaryKeyAttribute}" field containing the array of PK values to delete.`);
                }
                // If user provided a single string value.
                if (typeof deleteIdList === 'string') {
                    deleteIdList = [deleteIdList];
                }
                // Convert Id values to the appropriate type for this PK.
                deleteIdList.map(id => {
                    inList.push(handlerUtils.getStrongPkValue(id, model));
                });
            } catch (err) {
                debug(`Failed to create an in-list for ${entity.modelName} batch delete.`, err)
                return reject(err);
            }

            const query = {
                where: {
                    [model.primaryKeyAttribute]: { [Op.in]: inList }
                  }
            };
            model.destroy(query).then(function (result) {
                debug(`Delete model ${entity.modelName} batch:`, query.where, result);
                resolve({
                    data: {
                        deleted: result
                    }
                });
            }).catch(function (err) {
                debug(`Error executing model ${entity.modelName} deleteBatch()`, err);
                reject(err);
            });
        });
    }

    function modelUpdateById(entity, req) {
        const model = entity.model;
        return new Promise(function (resolve, reject) {
            const id = handlerUtils.getStrongPkValue(req.params.__id, model);
            const query = {
                where: {
                    [model.primaryKeyAttribute]: id
                  },
                  returning: true
            };
            const newValues = req.body;
            model.findOne(query).then( (recToUpdate) => {
                if (!recToUpdate) {
                    debug(`Model ${entity.modelName} updateById() record not found: ${id}`);
                    return reject(new restifyErrors.NotFoundError('Not Found'));
                }
                return recToUpdate.update(newValues);
            })
            .then((result) => {
                resolve(result);
            })
            .catch(function (err) {
                debug(`Error executing model ${entity.modelName} updateById()`, err);
                reject(err);
            });
        });
    }

    return {
        modelFind,
        modelFindById,
        modelCount,
        modelInsert,
        modelDelete,
        modelDeleteById,
        modelDeleteBatch,
        modelUpdateById
    };
};