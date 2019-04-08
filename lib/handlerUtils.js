'use strict';
const debug = require('debug')('transom:mongoose:handlerUtils');
const restifyErrors = require('restify-errors');
// const fs = require('fs');
const { DataTypes, Op } = require('sequelize');

module.exports = function HandlerUtils(options) {
	options = options || {};
	const sequelize = options.sequelize;

	// Where _type == "csv" or "json", default json.
	const OPERANDS = {
        _skip: '_skip', 
		_limit: '_limit', 
		_sort: '_sort', 
		_populate: '_populate', 
		_select: '_select', 
		_connect: '_connect', 
		_keywords: '_keywords', 
        _type: '_type'
    };

	function separateApiOperations(options, model) {
		const result = {
			operands: {},
			attributes: {},
			extras: {}
		};

		// Split up the query into Attributes and Operands.
		for (var key in options) {
			if (model.rawAttributes.hasOwnProperty(key)) {
				// Collecting Attributes.
				result.attributes[key] = options[key];
			} else if (OPERANDS[key]) {
				// Collecting Operands.
				result.operands[key] = options[key];
			} else {
				// Anything else gets put on extras.
				result.extras[key] = options[key];
			}
		}
		return result;
	}


	function processSelectOperator(model, select) {
        const result = {
            attributes: []
        };
        // add selected columns only!
        if (select) {
            const selectAttribs = select.split(',');
            selectAttribs.map((attrib) => {
                if (model.rawAttributes[attrib]) {
                    result.attributes.push(attrib);
                } else {
                    throw new restifyErrors.InvalidArgumentError('Invalid entry in the _select list: ' + attrib);
                }
            });
        }
        return result;
    }
	// 	const result = {
	// 		root: {},
	// 		applyRoot: false
	// 	};
	// 	// If we ever start using Virtuals, we'll hafta combine them.
	// 	// const paths = Object.assign({}, model.schema.paths, model.schema.virtuals);
	// 	const paths = model.schema.paths;
	// 	if (select) {
	// 		if (typeof select === 'string') {
	// 			select = select.split(',');
	// 		}
	// 		for (let attrib of select) {
	// 			// Build a select list for connected models too.
	// 			const subSelect = attrib.split('.');
	// 			if (subSelect.length === 1 && paths.hasOwnProperty(subSelect[0])) {
	// 				// Build a select list for the model being queried.
	// 				result.applyRoot = true;
	// 				result.root[attrib] = 1;
	// 			} else if (subSelect.length === 2 && paths.hasOwnProperty(subSelect[0])) {
	// 				// Used with .populate() for subdocument fields.
	// 				result[subSelect[0]] = result[subSelect[0]] || [];
	// 				result[subSelect[0]].push(subSelect[1]);
	// 			} else if (subSelect.length === 2) {
	// 				// Used with .reversePopulate() for subdocument fields.
	// 				// These aren't checked against the connected model...
	// 				result[subSelect[0]] = result[subSelect[0]] || [];
	// 				result[subSelect[0]].push(subSelect[1]);
	// 			} else {
	// 				throw new restifyErrors.InvalidArgumentError('Invalid entry in the _select list: ' + attrib);
	// 			}
	// 		}
	// 	} else {
	// 		// _Select list not provided, build one from the Schema.
	// 		const typeKey = model.schema.options.typeKey;
	// 		for (let path in paths) {
	// 			const pathOpts = model.schema.path(path).options;
	// 			if (pathOpts[typeKey] && pathOpts[typeKey].__type === 'binary') {
	// 				result.applyRoot = true;
	// 				// *Do NOT fetch* selectObj.root[`${path}.binaryData`]
	// 				result.root[`${path}.filename`] = 1;
	// 				result.root[`${path}.mimetype`] = 1;
	// 				result.root[`${path}.size`] = 1;
	// 			} else if (pathOpts[typeKey] && pathOpts[typeKey].__type === 'point') {
	// 				result.applyRoot = true;
	// 				result.root[`${path}.type`] = 1;
	// 				result.root[`${path}.coordinates`] = 1;
	// 			} else {
	// 				result.applyRoot = true;
	// 				result.root[path] = 1;
	// 			}
	// 		}
	// 	}
	// 	// Always remove __v from the Select list of a Mongoose model.
	// 	delete result.root[model.schema.options.versionKey];
	// 	return result;
	// }

	// /**
	//  * Extract details from the URL and return an object that can
	//  * be applied to the query to resolve connected models.
	//  */
	// function processConnectOperator(options) {

	// 	const query = options.query;
	// 	const currentOps = options.operations;
	// 	const model = options.entity.model;
	// 	const modelPrefix = options.entity.modelPrefix;
	// 	const select = options.selectOpts;
	// 	const connectors = (typeof currentOps._connect == 'string' ? currentOps._connect.split(',') : currentOps._connect);

	// 	const connect = {
	// 		populateRegular: [],
	// 		populateReverse: [],
	// 		rootSelect: [] // These need to be added to the _select list on the root query.
	// 	};

	// 	for (let connector of connectors) {
	// 		if (connector.indexOf('.') === -1) {
	// 			// *******************************************
	// 			// This is for a normal _connect operator.
	// 			// *******************************************
	// 			if (!model.schema.paths.hasOwnProperty(connector)) {
	// 				throw new restifyErrors.InvalidArgumentError('Invalid attribute code in _connect: ' + connector);
	// 			}

	// 			const tmp = {
	// 				path: connector
	// 			};
	// 			// Add this path to the root _select list
	// 			connect.rootSelect.push(tmp.path);

	// 			// If the _select operator has an entry for this _connect value
	// 			// Leaving tmp.select undefined will populate *all* the attributes.
	// 			if (select[connector]) {
	// 				const sel = [];
	// 				for (let selected of select[connector]) {
	// 					sel.push(selected);
	// 				}
	// 				if (sel.length > 0) {
	// 					let tmpModel;
	// 					if (model.schema.paths[tmp.path] && model.schema.paths[tmp.path].options) {
	// 						const typeKey = model.schema.options.typeKey;
	// 						if (model.schema.paths[tmp.path].options[typeKey] instanceof Array) {
	// 							tmpModel = mongoose.model(model.schema.paths[tmp.path].options[typeKey][0].ref);
	// 						} else {
	// 							tmpModel = mongoose.model(model.schema.paths[tmp.path].options.ref);
	// 						}
	// 					}
	// 					if (!tmpModel) {
	// 						throw new restifyErrors.InvalidArgumentError('Attribute cannot be used with _connect: ' + connector);
	// 					}
	// 				}
	// 				tmp.select = sel.join(',');
	// 			}
	// 			connect.populateRegular.push(tmp);
	// 		} else {
	// 			// *******************************************
	// 			// This is for a REVERSE _connect operator!
	// 			// *******************************************
	// 			var parts = connector.split('.');

	// 			// Where parts[0] is the entity code, parts[1] is the attribute
	// 			if (!mongoose.model(modelPrefix + parts[0])) {
	// 				throw new restifyErrors.InvalidArgumentError('Invalid entity code in _connect: ' + connector);
	// 			}

	// 			// Verify Entity name and User has read permissions.
	// 			// if (!user.hasReadPrivs('db', parts[0])) {
	// 			// 	throw new restifyErrors.ForbiddenError('No read permissions on: ' + parts[0]);
	// 			// }

	// 			var reverseSelectPrefix = parts.join('_'); // _select requires a "_", not a "."
	// 			var sel = [];
	// 			if (select[reverseSelectPrefix]) {
	// 				for (let selected of select[reverseSelectPrefix]) {
	// 					sel.push(selected);
	// 				}
	// 			}

	// 			// Looks good, we'll add it to the Array and apply it later.
	// 			connect.populateReverse.push({
	// 				entity: parts[0],
	// 				attribute: parts[1],
	// 				select: sel.join(' ') // mongoose-reverse-populate uses a SPACE delimiter!
	// 			});
	// 		}
	// 	}
	// 	return connect;
    // }
    
	/**
	 * build the sequelize query based on the parameters, operators and values specified on the request
	 * @param {Object} query - The sequelize query object that is having clauses added to it
	 * @param {Request} req - The request object
	 * @param {Entity} entity - An Object that represents the entity we are querying.
	 * @return query
	 */
	function buildQuery(query, req, entity) {
		const model = entity.model;
		const meta = model.__meta;
		const options = req.params;

		// Apply User query criteria first.
		// if (typeof model.schema.statics.userQuery === 'function') {
		// 	const userQry = model.schema.statics.userQuery();
		// 	Object.keys(userQry).map(function(key) {
		// 		options[key] = userQry[key];
		// 	});
		// }

		const user = req.locals.user;
		const separated = separateApiOperations(options, model);
		const currentOps = separated.operands;
		const currentAttribs = separated.attributes;

		const args = {
            where: {}
        };

		try {
            for (let key in currentAttribs) {
                const attribValue = currentAttribs[key];
				const value = (Array.isArray(attribValue) ? attribValue : [attribValue]);
				const isQueryable = meta[key].queryable === false ? false : true;
				if (!isQueryable) {
					throw new Error(`${model.name}.${key} is not a queryable attribute.`);
				}
                const attribWhere = [];
                for (let val in value) {
                    // Add each value to the query clause
                    const argWhere = getDataTypeClause(model, key, value[val], user);
                    attribWhere.push(argWhere);
                }
                if (attribWhere.length === 1) {
                    args.where[key] = attribWhere[0];
                } else if (attribWhere.length > 1) {
                    args.where[key] = { [Op.and]: attribWhere };
                }
            }
		} catch (err) {
			throw new restifyErrors.BadRequestError(err, 'Unable to build query');
		}

		// Add text search keywords to the query args.
		// if (currentOps._keywords) {
		// 	args.push({
		// 		'$text': {
		// 			'$search': currentOps._keywords
		// 		}
		// 	});
		// }

		// Now put all the arguments together on an 'And' clause on the query.
		// console.log("Query args", args);

		// ALWAYS use And() so that we are adding to anything that's already there.
		// E.g. ACL query details from a pre-find etc.
		// if (args.length > 0) {
		// 	query.and(args);
		// }
		
		//Apply the current query options
		if (query.op == "count") {
			//No Skip on count queries
			//No Limit on count queries
			//No Sort on count queries
			//No Select list on count queries
		} else {
			//Include Skip on query
			args.offset = Number(currentOps._skip || 0); // Don't skip any rows if amount not specified.

			//Include Limit on query
			args.limit = Number(currentOps._limit || 1000); // Apply a limit of 1000 if limit is not specified.

			//Apply Sort to the query by attribute(s).
			if (currentOps._sort) {
                args.order = args.order || [];
				const sortFields = (typeof currentOps._sort === "string" ? currentOps._sort.split(',') : currentOps._sort);
				// Check that each field is valid, even the negated ones.
				for (let sort of sortFields) {
					if (!model.rawAttributes.hasOwnProperty(sort.replace("-", ""))) {
						throw new restifyErrors.InvalidArgumentError('Invalid sort attribute: ' + sort);
                    }
                    if (sort.charAt(0) == '-') {                        
                        args.order.push([sort.substr(1), 'DESC']); // Descending sort
                    } else {
                        args.order.push([sort]); // Ascending sort
                    }
				}
			// } else if (currentOps._keywords) {
			// 	// An unsorted text search sort is always by score.
			// 	query.sort({
			// 		'_score': {
			// 			'$meta': 'textScore'
			// 		}
			// 	});
			}

			//Deal with the select list
			//var applySelect = false;
			//var selObj = {};

			//try {
			// const selObj = processSelectOperator(model, currentOps._select);
			// if (currentOps._keywords) {
			// 	// If we're text-searching, always add the _score.
			// 	selObj.root['_score'] = {
			// 		'$meta': 'textScore'
			// 	};
			// }

			// if (currentOps._connect) {
			// 	// modifies the query object as needed.
			// 	var connectOptions = {
			// 		query,
			// 		operations: currentOps,
			// 		selectOpts: selObj,
			// 		entity
			// 	};
			// 	var connect = processConnectOperator(connectOptions);
			// 	var applyOptions = {
			// 		query,
			// 		connect,
			// 		modelPrefix: entitattribValuemodelPrefix
			// 	};
			// 	query = applyConnectOpattribValueator(applyOptions);

			// 	// We need to add the attribValuennected attribute(s) to our (already limited) select list.
			// 	if (connect.rootSelectattribValue& selObj.applyRoot) {
			// 		for (var i in connattribValuet.rootSelect) {
			// 			var path = conattribValuect.rootSelect[i];
			// 			selObj.root[paattribValue] = 1;
			// 		}
			// 	}
			// }

			// if (selObj.applyRoot) {attribValue
			// 	query = query.select(selObj.root);
			// }
			// } catch (err) {
			// 	return next(err);
			// }
		}
		return args;
	} // End of buildQuery

	// /**
	//  * Apply connect (populate) info the the Mongoose queries.
	//  */
	// function applyConnectOperator(options) {

	// 	const query = options.query;
	// 	const connect = options.connect;
	// 	const modelPrefix = options.modelPrefix;

	// 	for (var k = 0; k < connect.populateRegular.length; k++) {
	// 		query.populate(connect.populateRegular[k]);
	// 	}
	// 	if (connect.populateReverse.length > 0) {
	// 		query.__reversePopulate = [];
	// 		for (var i = 0; i < connect.populateReverse.length; i++) {
	// 			var pr = connect.populateReverse[i];
	// 			var model = mongoose.model(modelPrefix + pr.entity);
	// 			if (!model) {
	// 				throw new restifyErrors.InvalidArgumentError(`Invalid Entity used in _connect: ${pr.entity}.${pr.attribute}`);
	// 			}
	// 			if (!model.schema.paths.hasOwnProperty(pr.attribute)) {
	// 				throw new restifyErrors.InvalidArgumentError(`Invalid Attribute used in _connect: ${pr.entity}.${pr.attribute}`);
	// 			}
	// 			// Build an Array of Reverse Lookup options to be used after the query returns.
	// 			var revOptions = {
	// 				modelArray: [],
	// 				storeWhere: `${pr.entity}_${pr.attribute}`,
	// 				arrayPop: true,
	// 				mongooseModel: model,
	// 				idField: pr.attribute,
	// 				select: pr.select
	// 			};
	// 			query.__reversePopulate.push(revOptions);
	// 		}
	// 	}
	// 	return query;
	// }

	// /**
	//  * Used to build the functions required for a reverse-populate.
	//  * Options parameter array must be pre-built & passed in.
	//  */
	// function buildReversePopulateFunctions(q, resultData) {
	// 	var items = (resultData instanceof Array ? resultData : [resultData]);
	// 	var funcs = [];
	// 	if (q.__reversePopulate && q.__reversePopulate.length > 0) {
	// 		funcs.push(function (callback) {
	// 			callback(null, items); // Pass in the pre-reversePopulate query results.
	// 		});

	// 		// Build an Array of functions to call for each of the reversePopulate queries on a request.
	// 		for (var i = 0; i < q.__reversePopulate.length; i++) {
	// 			// Use the closure to capture the options to be used when the reversePopulate fires.
	// 			var myClosure = function (opts) {
	// 				funcs.push(function (items, callback) {
	// 					opts.modelArray = items; // Update the options with new results data.

	// 					reversePopulate(opts, function (err, data) {
	// 						// Copy the reverseLookup data to _reverse that it's easy to access in one place.
	// 						// In the toJSON model function we can copy it into the resulting document.
	// 						for (var k = 0; k < data.length; k++) {
	// 							data[k]._reverse = data[k]._reverse || {}; // make sure it's initialised but not overwritten!
	// 							if (data[k][opts.storeWhere] && data[k][opts.storeWhere].length > 0) {
	// 								data[k]._reverse[opts.storeWhere] = [];
	// 								for (var p = 0; p < data[k][opts.storeWhere].length; p++) {
	// 									data[k]._reverse[opts.storeWhere].push(data[k][opts.storeWhere][p].toJSON());
	// 								}
	// 							}
	// 						}
	// 						callback(err, data);
	// 					});
	// 				});
	// 			};
	// 			myClosure(q.__reversePopulate[i]);
	// 		}
	// 	}
	// 	return funcs;
	// }

	/**
	 * Attempt to return the strongly typed value based on a string value.
	 * 
	 * @param {*} val 
	 * @param {*} datatype 
	 */
	function getStrongTypeValue(val, datatype) {
		let retval;
        const lcDatatype = datatype.constructor.name.toLowerCase();
        switch (lcDatatype) {
            case "boolean":
                val = val.toLowerCase();
                if (val === "true" || val === "false") {
                    if (val === "true") {
                        retval = Boolean(true);
                    } else {
                        retval = Boolean(false);
                    }
                } else {
                    throw new Error("Boolean arguments can only be 'true' or 'false'");
                }
                break;
            case "number":
                retval = parseFloat(val);
                if (!isFinite(retval)) {
                    throw new Error("Invalid numeric format");
                }
                break;
            case "date":
                // Sample "2014-01-31" or "2014-01-31T12:30:58.123Z"
                if (val.length == 10 || val.length == 24) {
                    //parse the year month date.
                    if (val.length == 10) {
                        retval = new Date(val + "T00:00:00.000Z");
                    } else {
                        retval = new Date(val);
                    }
                    if (retval.toString() === "Invalid Date") {
                        throw new Error("Invalid date string");
                    }
                } else {
                    throw new Error("Invalid string length for date parsing"); // Bad format, don't bother
                }

                break;
            case "string":
            default:
                retval = val;
                break;
        }
		return retval;
	} // End of getStrongTypeValue

	/**
	 * returns the clause using the strongly typed value for the operand, according to the datatype in the model.
	 * will throw an error when the datatype is invalid.
     * 
     Project.findAll({
  where: {
    id: {
      [Op.and]: {a: 5},           // AND (a = 5)
      [Op.or]: [{a: 5}, {a: 6}],  // (a = 5 OR a = 6)
      [Op.gt]: 6,                // id > 6
      [Op.gte]: 6,               // id >= 6
      [Op.lt]: 10,               // id < 10
      [Op.lte]: 10,              // id <= 10
      [Op.ne]: 20,               // id != 20
      [Op.between]: [6, 10],     // BETWEEN 6 AND 10
      [Op.notBetween]: [11, 15], // NOT BETWEEN 11 AND 15
      [Op.in]: [1, 2],           // IN [1, 2]
      [Op.notIn]: [1, 2],        // NOT IN [1, 2]
      [Op.like]: '%hat',         // LIKE '%hat'
      [Op.notLike]: '%hat',       // NOT LIKE '%hat'
      [Op.iLike]: '%hat',         // ILIKE '%hat' (case insensitive)  (PG only)
      [Op.notILike]: '%hat',      // NOT ILIKE '%hat'  (PG only)
      [Op.overlap]: [1, 2],       // && [1, 2] (PG array overlap operator)
      [Op.contains]: [1, 2],      // @> [1, 2] (PG array contains operator)
      [Op.contained]: [1, 2],     // <@ [1, 2] (PG array contained by operator)
      [Op.any]: [2,3]            // ANY ARRAY[2, 3]::INTEGER (PG only)
    },
    status: {
      [Op.not]: false           // status NOT FALSE
    }* 
	 */
	function getDataTypeClause(model, key, value, user) {
		let arg = {};
		const datatype = model.rawAttributes[key].type;
        if ('~' === value[0]) {
			if (datatype.key === "STRING" || datatype.key === "TEXT") {
				if ('>' === value[1]) {
					// Begins with
					arg = { [Op.like]: `${value.substring(2)}%` };
				} else if ('<' === value[1]) {
					// Ends with
					arg = { [Op.like]: `%${value.substring(2)}` };
				} else {
					// Contains
					arg = { [Op.like]: `%${value.substring(2)}%` };
				}
			} else {
				throw new Error("Like operator is only allowed on string/text attributes");
			}
		} else if ('>' === value[0]) {
			if ('=' === value[1]) {
				// Greater than or Equals
				arg = {
					[Op.gte]: getStrongTypeValue(value.substr(2), datatype)
				};
			} else {
				// Greater than
				arg = {
					[Op.gt]: getStrongTypeValue(value.substr(1), datatype)
				};
			}
		} else if ('<' === value[0]) {
			if ('=' === value[1]) {
				// Less than or Equals
				arg = {
					[Op.lte]: getStrongTypeValue(value.substr(2), datatype)
				};
			} else {
				// Less than
				arg = {
					[Op.lt]: getStrongTypeValue(value.substr(1), datatype)
				};
			}
		} else if (String(value).toLowerCase() === "!isnull") {
			// Not Null
			arg = {
				[Op.ne]: null
			};
		} else if ('!' === value[0]) { //}&& '=' === value[1]) {
			//Not Equals
			arg = {
				[Op.ne]: getStrongTypeValue(value.substr(1), datatype)
			};
		} else if ('[' === value[0] && ']' === value[value.length - 1]) {
			// In-list
			//value is an array of strings, need to change that to array of datatype? TODO here
			arg = {
				[Op.in]: value.substr(1, value.length - 2).split(',')
			};
		} else {
			// Simple Equals
			if (String(value).toLowerCase() === "isnull") {
				arg = null;
			} else {
				arg = getStrongTypeValue(value, datatype);
			}
		}
        // console.log("key=" + key + ", arg=" + arg);
        
        // what's this use-case?
		// Substitute the actual Username for "CURRENT_USERNAME"
		// if (arg[key] === "CURRENT_USERNAME" && user) {
		// 	arg[key] = user.username;
		// }
		return arg;
	}

	// function tryParseJSON(newValue, key) {
	// 	let result = newValue;
	// 	if (typeof newValue === "string" && newValue.length > 0){
	// 		const pair = newValue[0] + newValue[newValue.length-1];
	// 	 	if ( pair === "{}" || pair === "[]" ){
	// 			try {
	// 				result = JSON.parse(newValue);
	// 			} catch (e) {
	// 				throw new Error(`Failed to parse JSON value for '${key}'.`);
	// 			}
	// 		}
	// 	}
	// 	return result;
	// }

	// // used for Insert & Update
	// function applyValues(doc, values, model, isInsert) {
	// 	const typeKey = model.schema.options.typeKey;

	// 	// Apply provided values to the Document.
	// 	for (let key in values) {
	// 		const newValue = values[key];
	// 		if (key === '_id') {
	// 			if (isInsert && newValue) {
	// 				doc[key] = newValue;
	// 			}
	// 		} else if((key === model.schema.options.versionKey || key === model.schema.options.aclKey)) {
	// 			// Noop
	// 		} else if (model.schema.path(key)) {
	// 			const pathOpts = model.schema.path(key).options;
	// 			if (newValue && pathOpts[typeKey] && pathOpts[typeKey].__type === 'point') {
	// 				const pointValue = tryParseJSON(newValue, key);
	// 				if (typeof pointValue === 'object' && pointValue.coordinates) {
	// 					doc[key] = {
	// 						type: 'Point',
	// 						coordinates: pointValue.coordinates
	// 					};
	// 				}
	// 			} else if (newValue && pathOpts[typeKey] && pathOpts[typeKey].__type === 'binary') {
	// 				if (typeof newValue === 'object' && newValue.path) {
	// 					doc[key] = {
	// 						binaryData: fs.readFileSync(newValue.path),
	// 						filename: newValue.name,
	// 						mimetype: newValue.type,
	// 						size: newValue.size
	// 					};
	// 				}
	// 			} else if (newValue && pathOpts[typeKey] && pathOpts[typeKey].constructor.name === 'Array') {
	// 				const arrayValue = tryParseJSON(newValue, key);
	// 				doc[key] = (typeof arrayValue === 'string' ? [arrayValue] : arrayValue);

	// 			} else if (newValue && pathOpts[typeKey] && pathOpts[typeKey] === 'mixed') {
	// 				const mixedValue = tryParseJSON(newValue, key);
	// 				doc[key] = mixedValue;
	// 			} else {
	// 				switch (newValue) {
	// 					case "NULL":
	// 						doc[key] = undefined; // whack it from the Object
	// 						break;
	// 						//case "NOW":
	// 						//	doc[key] = undefined; // timestamp
	// 						//	break;
	// 						// case "CURRENT_USERNAME":
	// 						// 	doc[key] = req.locals.user.username || req.locals.user.email;
	// 						// 	break;
	// 					default:
	// 						doc[key] = newValue;
	// 						break;
	// 				}
	// 			}
	// 		}
	// 	} // End for...loop
	// 	return doc;
	// }

	return {
		OPERANDS,
		separateApiOperations,
		processSelectOperator,
		// processConnectOperator,
		buildQuery,
		// applyConnectOperator,
		// buildReversePopulateFunctions,
		getStrongTypeValue,
		getDataTypeClause
		// tryParseJSON,
		// applyValues
	};
};