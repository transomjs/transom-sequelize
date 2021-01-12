'use strict';
const debug = require('debug')('transom:sequelize:handlerUtils');
const restifyErrors = require('restify-errors');
const { DataTypes, Op, Sequelize } = require('sequelize');

const READ = 1;
const WRITE = 2;
const DELETE = 4;

module.exports = function HandlerAcl(options) {
	options = options || {};
	const sequelize = options.sequelize;

    
    function addAclFind(query, req){
		return addClause(query, req, READ);
	}
	function addAclUpdate(query, req){
		return addClause(query, req, WRITE);
	}
	function addAclDelete(query, req){
		return addClause(query, req, DELETE);
	}
	
	function addClause(query, req, priv) {
		const where = query.where || {}

		const user = req.locals.user;
		const userGroups = req.locals.user.groups || [];
		const groupIds = userGroups.map(g => g.id);

		const aclConditions = {
            [Op.or]: [
                {acl_owner : user.id},
                {[Op.and]:[{acl_group : groupIds}, Sequelize.literal(`acl_group_privs & ${priv} >= ${priv}`)]},
            ]
		};

		query.where = {[Op.and]:[where, aclConditions]};

		return query;
	}

	return {
		addAclFind,
		addAclUpdate,
		addAclDelete
	};
};