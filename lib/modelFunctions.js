"use strict";
const async = require('async');
const debug = require('debug')('transom:mongoose:functions');
// const {
//     Types
// } = require('mongoose');
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

        let nextValResult;
        if (typeof model.nextVal === 'function') {
            nextValResult = model.nextVal(); // Model staticFunction to fetch the next sequence number.
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
                    // return Promise.reject(err);
                    throw err;
                });
            // });
        // });
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
            let id = req.params.__id;
            if (id == null) {
                debug(`Id was not provided in ${entity.modelName} findById: ${req.params.__id}`);
                return reject(new restifyErrors.InvalidArgumentError('ID is required'));
            }

            const options = {};
            options.where = {
                [model.primaryKeyAttribute]: id
              };

            model.destroy(options).then(function () {
                resolve(true);
            }).catch(function (err) {
                debug(`Error executing model ${entity.modelName} findById()`, err);
                reject(err);
            });
        });
    }

    function modelUpdateById(entity, req) {
        const model = entity.model;
        return new Promise(function (resolve, reject) {
            let id = req.params.__id;
            if (id == null) {
                debug(`Id was not provided in ${entity.modelName} findById: ${req.params.__id}`);
                return reject(new restifyErrors.InvalidArgumentError('ID is required'));
            }

            const options = {};
            options.where = {
                [model.primaryKeyAttribute]: id
              };
            options.returning = true;  

            // debug(`update options: ${JSON.stringify(options)}`);
            const newValues = req.body;  
            // debug(`update values: ${JSON.stringify(newValues)}`);
            model.findOne(options).then(function (rec) {
                if (!rec) {
                    debug(`Model ${entity.modelName} findById() record not found`);
                    return reject(new restifyErrors.NotFoundError('Not Found'));
                }
                return rec;
                
            }).then(function(recToUpdate) {
                recToUpdate.update(newValues).then(function(result){
                    resolve(result);
                });
            })
            .catch(function (err) {
                debug(`Error executing model ${entity.modelName} findById()`, err);
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