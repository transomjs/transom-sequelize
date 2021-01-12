'use strict';
const debug = require('debug')('transom:sequelize:functions');
const HandlerUtils = require('./handlerUtils');
const HandlerAcl = require('./handlerAcl');
const restifyErrors = require('restify-errors');

module.exports = function ModelFunctions(options) {
    const sequelize = options.sequelize;
    const handlerUtils = new HandlerUtils({
        sequelize
    });

    const handlerAcl = new HandlerAcl({
        sequelize
    });

    function modelFind(server, entity, req, skipAcl) {
        const model = entity.model;
        let query;
        try {
            query = handlerUtils.buildQuery({}, req, entity);
            if (entity.model.options.needsAcl && !skipAcl) {
                query = handlerAcl.addAclFind(model, query, req, entity);
            }

            // Used for Select.
            const separated = handlerUtils.separateApiOperations(req.query, model);
            const operations = separated.operands || {};
            const selectOpts = handlerUtils.processSelectOperator(model, operations['_select']);

            // Apply the select list.
            if (selectOpts.attributes && selectOpts.attributes.length > 0) {
                query.attributes = selectOpts.attributes;
            }
        } catch (err) {
            debug(`Error building query for ${entity.modelName} model findAll()`, err);
            return Promise.reject(err);
        }

        return model
            .findAll(query)
            .then(items => {
                debug('Fetching findAll() completed.');
                return {
                    items
                };
            })
            .catch(err => {
                debug(`Error executing ${entity.modelName} model findAll()`, err);
                throw err;
            });
    }

    function modelFindById(server, entity, req, skipAcl) {
        const model = entity.model;
        const queryOptions = {};
        let id;

        try {
            id = handlerUtils.getStrongPkValue(req.params.__id, model);

            // Used for Select.
            const separated = handlerUtils.separateApiOperations(req.query, model);
            const operations = separated.operands || {};
            const selectOpts = handlerUtils.processSelectOperator(model, operations['_select']);

            // Apply the select list.
            if (selectOpts.attributes && selectOpts.attributes.length > 0) {
                queryOptions.attributes = selectOpts.attributes;
            }
        } catch (err) {
            debug(`Error building query for ${entity.modelName} model findById()`, err);
            return Promise.reject(err);
        }

        return model.describe()
            .then((schema) => {
                const pkCols = Object.keys(schema).filter((field) => {
                    return schema[field].primaryKey;
                });
                return pkCols[0]; //Yes we're forcing the single PK col here;
            })
            .then((pkCol) => {
                queryOptions.where = { pkCol: id };

                if (entity.model.options.needsAcl && !skipAcl) {
                    qry = handlerAcl.addAclFind(model, qry, req, entity);
                }

                return model
                    .findOne(queryOptions)
            })
            .then(item => {
                if (!item) {
                    throw new restifyErrors.NotFoundError('Not Found');
                }
                return item;
            })
            .catch(err => {
                debug(`Error executing model ${entity.modelName} findById()`, err);
                throw err;
            });
    }

    function modelCount(server, entity, req, skipAcl) {
        const model = entity.model;
        let query;
        try {
            query = handlerUtils.buildQuery({}, req, entity);
            if (entity.model.options.needsAcl && !skipAcl) {
                query = handlerAcl.addAclFind(model, query, req, entity);
            }
        } catch (err) {
            debug(`Failed to build query for ${entity.modelName} count.`, err);
            return Promise.reject(err);
        }

        return model
            .count(query)
            .then(count => {
                debug(`Count model ${entity.modelName} completed`);
                return {
                    count
                };
            })
            .catch(err => {
                debug(`Error executing model ${entity.modelName} count()`, err);
                throw err;
            });
    }

    function modelInsert(server, entity, req) {
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
        try {
            if (typeof model.nextVal === 'function') {
                debug(`Using ${entity.modelName} nextVal during Insert.`);
                nextValResult = model.nextVal();
            } else {
                nextValResult = Promise.resolve();
            }
        } catch (err) {
            debug(`Failed duing ${entity.modelName} nextVal().`, err);
            return Promise.reject(err);
        }

        const skippedFields = [];
        return nextValResult
            .then(nextVal => {
                debug(`Applying  ${entity.modelName} nextVal result to posted values.`);
                const values = Object.assign({}, req.body, nextVal);

                // Check that provided values map to the Entity.
                Object.keys(values || {}).map(path => {
                    if (!model.rawAttributes.hasOwnProperty(path)) {
                        delete values[path];
                        skippedFields.push(path);
                    }
                });
                return model.create(values);
            })
            .then(item => {
                debug(`Insert model ${entity.modelName} completed.`);
                return {
                    item,
                    skippedFields
                };
            })
            .catch(err => {
                debug(`Error executing ${entity.modelName} modelInsert`, err);
                throw err;
            });
    }

    function modelDelete(server, entity, req, skipAcl) {
        const model = entity.model;
        let query;
        try {
            query = handlerUtils.buildQuery({}, req, entity);
            if (entity.model.options.needsAcl && !skipAcl) {
                query = handlerAcl.addAclDelete(model,query, req, entity);
            }
        } catch (err) {
            debug(`Error building query for ${entity.modelName} delete()`, err);
            return Promise.reject(err);
        }

        return model
            .destroy(query)
            .then(result => {
                debug(`Delete on model ${entity.modelName} completed.`, query.where, result);
                return {
                    data: {
                        deleted: result
                    }
                };
            })
            .catch(err => {
                debug(`Error executing ${entity.modelName} delete`, err);
                throw err;
            });
    }

    function modelDeleteById(server, entity, req, skipAcl) {
        const model = entity.model;
        let query;
        try {
            const id = handlerUtils.getStrongPkValue(req.params.__id, model);
            query = {
                where: {
                    [model.primaryKeyAttribute]: id
                }
            };
            if (entity.model.options.needsAcl && !skipAcl) {
                query = handlerAcl.addAclDelete(model, query, req, entity);
            }
        } catch (err) {
            debug(`Error building query for ${entity.modelName} deleteById()`, err);
            return Promise.reject(err);
        }

        return model
            .destroy(query)
            .then(result => {
                debug(`Deleted model ${entity.modelName} by Id completed.`, query.where, result);
                return {
                    data: {
                        deleted: result
                    }
                };
            })
            .catch(err => {
                debug(`Error executing model ${entity.modelName} deleteById()`, err);
                throw err;
            });
    }

    function modelDeleteBatch(server, entity, req, skipAcl) {
        const model = entity.model;
        let query;
        try {
            const Op = sequelize.Sequelize.Op;

            let deleteIdList = (req.body || {})[model.primaryKeyAttribute];
            if (!deleteIdList) {
                throw new Error(
                    `Request body must contain a "${model.primaryKeyAttribute
                    }" field containing the array of PK values to delete.`
                );
            }
            // If user provided a single string value.
            if (typeof deleteIdList === 'string') {
                deleteIdList = [deleteIdList];
            }
            // Convert Id values to the appropriate type for this PK.
            const inList = [];
            deleteIdList.map(id => {
                inList.push(handlerUtils.getStrongPkValue(id, model));
            });
            query = {
                where: {
                    [model.primaryKeyAttribute]: { [Op.in]: inList }
                }
            };
            if (entity.model.options.needsAcl && !skipAcl) {
                query = handlerAcl.addAclDelete(model, query, req, entity);
            }
        } catch (err) {
            debug(`Failed to create an in-list for ${entity.modelName} batch delete.`, err);
            return Promise.reject(err);
        }

        return model
            .destroy(query)
            .then(result => {
                debug(`Delete model ${entity.modelName} batch:`, query.where, result);
                return {
                    data: {
                        deleted: result
                    }
                };
            })
            .catch(err => {
                debug(`Error executing model ${entity.modelName} deleteBatch()`, err);
                throw err;
            });
    }

    function modelUpdateById(server, entity, req, skipAcl) {
        const model = entity.model;
        const newValues = req.body;
        let query;
        try {
            const id = handlerUtils.getStrongPkValue(req.params.__id, model);
            query = {
                where: {
                    [model.primaryKeyAttribute]: id
                },
                returning: true
            };
            if (entity.model.options.needsAcl && !skipAcl) {
                query = handlerAcl.addAclUpdate(model, query, req, entity);
            }
        } catch (err) {
            debug(`Failed to build query for ${entity.modelName} updateById.`, err);
            return Promise.reject(err);
        }

        return model
            .findOne(query)
            .then(record => {
                if (!record) {
                    throw new restifyErrors.NotFoundError('Not Found');
                }
                return record.update(newValues);
            })
            .catch(err => {
                debug(`Error executing model ${entity.modelName} updateById()`, err);
                throw err;
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
