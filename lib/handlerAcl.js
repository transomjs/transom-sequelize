'use strict';
const debug = require('debug')('transom:sequelize:handlerAcl');
const { Op, Sequelize } = require('sequelize');

const READ = 1;
const WRITE = 2;
const DELETE = 4;

module.exports = function HandlerAcl(options) {
    options = options || {};

    function addAclFind(model, query, req) {
        return addClause(model, query, req, READ);
    }

    function addAclUpdate(model, query, req) {
        return addClause(model, query, req, WRITE);
    }
    
    function addAclDelete(model, query, req) {
        return addClause(model, query, req, DELETE);
    }

    function allowInsert(model, req) {
        const groupCodes = getUserGroupCodes(req);
        const createGroup = model.options.acl.create ? model.options.acl.create : 'THIS_IS_NOT_HAPPENING';

        return groupCodes.indexOf(createGroup) >= 0;
    }

    function applyInsertDefaults(model, req) {
        debug('Getting default acl values for model insert.');
        const data = {};
        const aclDefault = model.options.acl.default || {};

        // Owner is always considered to have priv of 7!
        let owner = null;
        if (aclDefault.owner == 'CURRENT_USER' && req.locals.user) {
            owner = req.locals.user.id;
        } else {
            // Assign a hardcoded userId, or 0.
            owner = aclDefault.owner || 0;
        }
        data.aclOwner = owner;
        data.aclPublicPrivs = parseInt(aclDefault.public) || 0;

        let group = null;
        let groupPriv = null;
        const groups = Object.keys(aclDefault.group || {});
        if (groups.length > 0) {
            group = groups[0];
            groupPriv = parseInt(aclDefault.group[group]) || 0;
        }
        data.aclGroup = group || 'none';
        data.aclGroupPrivs = groupPriv || 0;
        return data;
    }

    function getUserGroupCodes(req) {
        const user = req.locals.user || {};
        const userGroups = user.groups || [];
        return userGroups.map(g => g.groupCode);
    }

    function addClause(model, query, req, priv) {
        debug('Adding acl to model query');
        checkForAclColumns(model);
        const user = req.locals.user || {};
        const where = query.where || {};
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
        const aclCols = Object.keys(model.rawAttributes).filter((attrib) => {
            return attrib == 'aclOwner' || attrib == 'aclGroup' || attrib == 'aclGroupPrivs' || attrib == 'aclPublicPrivs';
        });
        if (aclCols.length != 4) {
            throw new Error(`${model.name} does include the required acl columns: acl_owner(string), acl_group(string), acl_group_privs(int), acl_public_privs(int).`);
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