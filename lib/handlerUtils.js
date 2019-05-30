'use strict';
const debug = require('debug')('transom:sequelize:handlerUtils');
const restifyErrors = require('restify-errors');
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
    } // End of processSelectOperator

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
                    const argWhere = getDataTypeClause(model, key, value[val]);
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
			}
		}
		return args;
	} // End of buildQuery

	/**
	 * Attempt to return the strongly typed value based on a string value.
	 * 
	 * @param {*} val 
	 * @param {*} datatype 
	 */
	function getStrongTypeValue(val, attrMeta) {
		let retval;
		const datatype = attrMeta.type;

        switch (datatype.key.toLowerCase()) {
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
			case "tinyint": 
			case "smallint": 
			case "mediumint": 
			case "integer": 
			case "bigint": 
			case "float": 
			case "real": 
			case "double precision": 
			case "double": 
			case "decimal": 
			case "numeric": 
				retval = parseFloat(val);
                if (!isFinite(retval)) {
                    throw new Error("Invalid numeric format");
                }
				break;

			case "dateonly":
            case "date":
			case "time":
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
				
			case "char":
			case "text":
			case "string":
				if (attrMeta.unicode === false) {
					// Sidestep the default "N" prefix in MSSQL on VARCHAR columns!
					retval = new String(val);
				} else {
					retval = val; // no change
				}
				break;
            default:
                retval = val;
                break;
        }
		return retval;
	} // End of getStrongTypeValue

	/**
	 * Convert string PK value to the appropriate datatype based on Model metadata.
	 * Throw errors if the model defines anything other than a single PK column.
	 * 
	 * @param {*} id A string representation PK value
	 * @param {*} model The Sequelize model for this PK
	 */
    function getStrongPkValue(id, model) {
        if (id == null) {
            debug(`Id was not provided in ${entity.modelName} operation.`);
            return reject(new restifyErrors.InvalidArgumentError('ID is required'));
        }
        if (model.primaryKeyAttributes.length === 0) {
            debug(`Sequelize model ${entity.modelName} does not include an attribute identified as the primary key.`);
            throw new restifyErrors.InternalError('Primary key not defined');
        }
        if (model.primaryKeyAttributes.length > 1) {
            debug(`Sequelize model ${entity.modelName} has multiple attributes(${model.primaryKeyAttributes.join(', ')}) defined as primary key.`);
            throw new restifyErrors.InternalError('PK operations not currently supported on compound keys');
        }
        const pkMeta = model.rawAttributes[model.primaryKeyAttributes[0]];
        const pkId = handlerUtils.getStrongTypeValue(id, pkMeta);
        return pkId;
    } // End of getStrongPkValue

	/**
	 * returns the clause using the strongly typed value for the operand, according to the datatype in the model.
	 * will throw an error when the datatype is invalid.
     * 
	 */
	function getDataTypeClause(model, key, value) {
		let arg = {};
		const attribMeta = model.rawAttributes[key];
		const datatype = attribMeta.type;
        if ('~' === value[0]) {
			if (datatype.key === DataTypes.STRING.key || datatype.key === DataTypes.TEXT.key || datatype.key === DataTypes.CHAR.key) {
				let likeStr;
				if ('>' === value[1]) {
					// Begins with
					likeStr = `${value.substring(2)}%`;
				} else if ('<' === value[1]) {
					// Ends with
					likeStr = `%${value.substring(2)}`;
				} else {
					// Contains
					likeStr = `%${value.substring(1)}%`;
				}
				arg = { [Op.like]: getStrongTypeValue(likeStr, attribMeta) };
			} else {
				throw new Error("Like operator is only allowed on string/text/char attributes");
			}
		} else if ('>' === value[0]) {
			if ('=' === value[1]) {
				// Greater than or Equals
				arg = {
					[Op.gte]: getStrongTypeValue(value.substr(2), attribMeta)
				};
			} else {
				// Greater than
				arg = {
					[Op.gt]: getStrongTypeValue(value.substr(1), attribMeta)
				};
			}
		} else if ('<' === value[0]) {
			if ('=' === value[1]) {
				// Less than or Equals
				arg = {
					[Op.lte]: getStrongTypeValue(value.substr(2), attribMeta)
				};
			} else {
				// Less than
				arg = {
					[Op.lt]: getStrongTypeValue(value.substr(1), attribMeta)
				};
			}
		} else if (String(value).toLowerCase() === "!isnull") {
			// Not Null
			arg = {
				[Op.ne]: null
			};
		} else if ('!' === value[0]) {
			//Not Equals
			arg = {
				[Op.ne]: getStrongTypeValue(value.substr(1), attribMeta)
			};
		} else if ('[' === value[0] && ']' === value[value.length - 1]) {
			// In-list
			const list = value.substr(1, value.length - 2).split(',');
			const strongList = [];
			for (var i=0; i < list.length; i++) {
				const strongItem = getStrongTypeValue(list[i], attribMeta);
				strongList.push(strongItem);
			}
			arg = {
				[Op.in]: strongList
			};
		} else {
			// Simple Equals
			if (String(value).toLowerCase() === "isnull") {
				arg = null;
			} else {
				arg = getStrongTypeValue(value, attribMeta);
			}
		}
		return arg;
	} // End of getDataTypeClause
	

	return {
		OPERANDS,
		separateApiOperations,
		processSelectOperator,
		buildQuery,
		getStrongTypeValue,
		getStrongPkValue,
		getDataTypeClause
	};
};