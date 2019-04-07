"use strict";
const debug = require('debug')('transom:mongoose:functions');
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

            // Make sure the model uses ACL before calling it.
            // if (typeof query.aclRead === 'function') {
            //     debug(`Adding ACL Read to ${entity.modelName} find() query`);
            //     query.aclRead(req);
            // }

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
                // **********************************
                // Setup a ReversePopulate query!
                // **********************************
                // try {
                //     const funcs = handlerUtils.buildReversePopulateFunctions(query, items);
                //     if (funcs.length > 0) {
                //         debug(`Executing ${funcs.length} functions for reverse populate`);
                //         async.waterfall(funcs,
                //             // The final callback sends the response.
                //             function (err, items) {
                //                 if (err) {
                //                     debug('Error executing reverse populate', err);
                //                     reject(err);
                //                     return;
                //                 }
                //                 debug('Fetching find() with reverse populate completed');
                //                 resolve({
                //                     // fields is an array of selected attributes that gets used when outputting to CSV.
                //                     fields: query._fields,
                //                     items
                //                 });
                //             });
                //     } else {
                        debug('Fetching findAll() completed');
                        resolve({
                            // fields is an array of selected attributes that gets used when outputting to CSV.
                            // fields: query._fields,
                            items
                        });
                //     }
                // } catch (err) {
                //     reject(err);
                // }
            }).catch(function (err) {
                debug(`Error executing ${entity.modelName} model findAll()`, err);
                reject(err);
            });
        });
    }

    
    function modelFindById(entity, req) {
        const model = entity.model;
        return new Promise(function (resolve, reject) {
            let id = req.params.__id;
            if (id == null) {
                debug(`Id was not provided in ${entity.modelName} findById: ${req.params.__id}`);
                return reject(new restifyErrors.InvalidArgumentError('ID is required'));
            }

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
            
/*
            // Connect related models
            if (operations['_connect']) {
                debug(`Adding Connect operation to ${entity.modelName} findById query`);
                // Will setup the query to call populate or setup details required for reversePopulate!
                const connect = handlerUtils.processConnectOperator({
                    query,
                    operations,
                    entity,
                    selectOpts
                });
                query = handlerUtils.applyConnectOperator({
                    query,
                    connect,
                    modelPrefix: entity.modelPrefix
                });

                // We need to add the connected attribute(s) to our select list.
                if (connect.rootSelect && selectOpts.applyRoot) {
                    for (let i in connect.rootSelect) {
                        const path = connect.rootSelect[i];
                        selectOpts.root[path] = 1;
                    }
                }
            }

            // Make sure the model uses ACL before calling it.
            if (typeof query.aclRead === 'function') {
                debug(`Adding ACL Read to ${entity.modelName} findById query`);
                query.aclRead(req);
            }
*/
            model.findByPk(id, queryOptions).then(function (item) {
                if (!item) {
                    debug(`Model ${entity.modelName} findById() record not found`);
                    return reject(new restifyErrors.NotFoundError('Not Found'));
                }
                // const funcs = []; // handlerUtils.buildReversePopulateFunctions(query, item);
                // if (funcs.length > 0) {
                //     debug(`Executing ${funcs.length} functions for reverse populate`);
                //     async.waterfall(funcs,
                //         // The final callback sends the response.
                //         function (err, items) {
                //             if (err) {
                //                 return reject(err);
                //             }
                //             resolve(items[0]);
                //         }
                //     );
                // } else {
                    resolve(item);
                // }
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

            // Make sure the model uses ACL before calling it.
            // if (typeof query.aclRead === 'function') {
            //     debug(`Adding ACL Read to ${entity.modelName} modelCount query`);
            //     query.aclRead(req);
            // }

            model.count(query).then((count) => {
                resolve({
                    count
                });
            });
        });
    }

    function modelInsert(entity, req) {
        const model = entity.model;

        /**
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

            // Make sure the model uses ACL before calling it.
            // if (typeof query.aclRead === 'function') {
            //     debug(`Adding ACL Read to ${entity.modelName} modelCount query`);
            //     query.aclRead(req);
            // }

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
            const id = req.params.__id;
            if (id == null) {
                debug(`Id was not provided in ${entity.modelName} deleteById: ${id}`);
                return reject(new restifyErrors.InvalidArgumentError('ID is required'));
            }

            const query = {
                where: {
                    [model.primaryKeyAttribute]: id
                  }
            };
            model.destroy(query).then(function (result) {
                debug(`Delete model ${entity.modelName} by Id: ${id}`, result);
                resolve(true);
            }).catch(function (err) {
                debug(`Error executing model ${entity.modelName} deleteById()`, err);
                reject(err);
            });
        });
    }

    function modelUpdateById(entity, req) {
        const model = entity.model;
        return new Promise(function (resolve, reject) {
            const id = req.params.__id;
            if (id == null) {
                debug(`Id was not provided in ${entity.modelName} updateById: ${id}`);
                return reject(new restifyErrors.InvalidArgumentError('ID is required'));
            }

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
                recToUpdate.update(newValues).then((result) => {
                    resolve(result);
                });
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
        // modelDeleteBatch,
        modelUpdateById
    };
};