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


	function addAclFind(model, query, req) {
		return addClause(model, query, req, READ);
	}
	function addAclUpdate(model, query, req) {
		return addClause(model, query, req, WRITE);
	}
	function addAclDelete(model, query, req) {
		return addClause(model, query, req, DELETE);
	}

	function allowInsert(model, req){
		const groupCodes = getUserGroupCodes(req);
		const createGroup = model.options.acl.create; 
		
		return groupCodes.indexOf(createGroup) >= 0;
	}

	function applyInsertDefaults(model, req, data){
		const acldefault = model.options.acl.default;
		let owner = null;
		if (acldefault?.owner?.CURRENT_USER) {
			owner = req.locals.user.id
		}
		data.aclOwner = owner; 
		data.aclPublicPrivs = acldefault.public
		
		let group = null;
		let groupPriv = 0;
		if (acldefault.group ) {
			const groups = Object.keys(acldefault.group);
			if (groups.length > 0) {
				group = groups[0];
				groupPriv = acldefault.group[group];
			}
		}
		data.aclGroup = group;
		data.aclGroupPrivs = groupPriv;
		return data;
	}

	function getUserGroupCodes(req) {
		const user = req.locals.user;
		const userGroups = req.locals.user.groups || [];
		return userGroups.map(g => g.groupCode);
	}

	function addClause(model, query, req, priv) {

		const user = req.locals.user;

		checkForAclColumns(model);

		const where = query.where || {}

		const groupCodes = getUserGroupCodes(req);

		const aclConditions = {
			[Op.or]: [
				{ acl_owner: user.id },
				{ [Op.and]: [{ acl_group: groupCodes }, Sequelize.literal(`acl_group_privs & ${priv} >= ${priv}`)] },
				{ [Op.and]: Sequelize.literal(`acl_public_privs & ${priv} >= ${priv}`) }
			]
		};

		query.where = { [Op.and]: [where, aclConditions] };

		return query;
	}

	function checkForAclColumns(model) {
		const aclCols = Object.keys(model.rawAttributes).filter(function (field) {
			return field == 'aclOwner' || field == 'aclGroup' || field == 'aclGroupPrivs' || field == 'aclPublicPrivs';
		});
		if (aclCols.length != 4) {
			throw new Error(`${model.name} does not have all acl columns: acl_owner, acl_group, acl_group_privs, acl_public_privs`);
		}
	}

	return {
		allowInsert,
		applyInsertDefaults,
		addAclFind,
		addAclUpdate,
		addAclDelete
	};
};