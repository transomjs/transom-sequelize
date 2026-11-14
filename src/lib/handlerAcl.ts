import createDebug from "debug";
import { Op, Sequelize } from "sequelize";
import type { WhereOptions } from "sequelize";
import type { TransomModel, TransomRequest } from "../types";

const debug = createDebug("transom:sequelize:handlerAcl");

const READ = 1;
const WRITE = 2;
const DELETE = 4;

declare namespace HandlerAcl {
  /** A query that the ACL clause is added to. Its `where` is replaced. */
  interface AclQuery {
    where?: WhereOptions;
  }

  /** ACL columns set on an inserted row. */
  interface AclInsertDefaults {
    /** undefined when acl.default.owner is "CURRENT_USER" and the user has no id. */
    aclOwner: string | number | undefined;
    aclPublicPrivs: number;
    aclGroup: string;
    aclGroupPrivs: number;
  }

  interface Functions {
    /** The user belongs to the table's acl.create group. */
    allowInsert(model: TransomModel, req: TransomRequest): boolean;
    /** The owner, group and privilege columns for a new row, from acl.default. */
    applyInsertDefaults(model: TransomModel, req: TransomRequest): AclInsertDefaults;
    /** Restricts the query to rows the user may read. */
    addAclFind<Q extends AclQuery>(model: TransomModel, query: Q, req: TransomRequest): Q;
    /** Restricts the query to rows the user may update. */
    addAclUpdate<Q extends AclQuery>(model: TransomModel, query: Q, req: TransomRequest): Q;
    /** Restricts the query to rows the user may delete. */
    addAclDelete<Q extends AclQuery>(model: TransomModel, query: Q, req: TransomRequest): Q;
  }

  interface Options {
    sequelize?: Sequelize;
  }
}

/** Access control for tables with an `acl` definition. Options are accepted but unused. */
function HandlerAcl(_options?: HandlerAcl.Options): HandlerAcl.Functions {
  function addAclFind<Q extends HandlerAcl.AclQuery>(model: TransomModel, query: Q, req: TransomRequest): Q {
    return addClause(model, query, req, READ);
  }

  function addAclUpdate<Q extends HandlerAcl.AclQuery>(model: TransomModel, query: Q, req: TransomRequest): Q {
    return addClause(model, query, req, WRITE);
  }

  function addAclDelete<Q extends HandlerAcl.AclQuery>(model: TransomModel, query: Q, req: TransomRequest): Q {
    return addClause(model, query, req, DELETE);
  }

  function allowInsert(model: TransomModel, req: TransomRequest): boolean {
    const groupCodes = getUserGroupCodes(req);
    const acl = model.options.acl ?? {};
    const createGroup = acl.create ? acl.create : "THIS_IS_NOT_HAPPENING";

    return groupCodes.indexOf(createGroup) >= 0;
  }

  function applyInsertDefaults(model: TransomModel, req: TransomRequest): HandlerAcl.AclInsertDefaults {
    debug("Getting default acl values for model insert.");
    const aclDefault = (model.options.acl ?? {}).default || {};

    // Owner is always considered to have priv of 7!
    let owner: string | number | undefined;
    const user = req.locals.user;
    if (aclDefault.owner == "CURRENT_USER" && user) {
      owner = user.id;
    } else {
      // Assign a hardcoded userId, or 0.
      owner = aclDefault.owner || 0;
    }
    const aclPublicPrivs = parseInt(String(aclDefault.public)) || 0;

    let group: string | null = null;
    let groupPriv: number | null = null;
    const groupDefaults = aclDefault.group || {};
    const groups = Object.keys(groupDefaults);
    const firstGroup = groups[0];
    if (firstGroup !== undefined) {
      group = firstGroup;
      groupPriv = parseInt(String(groupDefaults[firstGroup])) || 0;
    }
    return {
      aclOwner: owner,
      aclPublicPrivs,
      aclGroup: group || "none",
      aclGroupPrivs: groupPriv || 0,
    };
  }

  function getUserGroupCodes(req: TransomRequest): string[] {
    const user = req.locals.user || {};
    const userGroups = user.groups || [];
    return userGroups.map((g) => g.groupCode);
  }

  function addClause<Q extends HandlerAcl.AclQuery>(model: TransomModel, query: Q, req: TransomRequest, priv: number): Q {
    debug("Adding acl to model query");
    checkForAclColumns(model);
    const user = req.locals.user || {};
    const where = query.where || {};
    const groupCodes = getUserGroupCodes(req);

    const aclConditions: WhereOptions = {
      [Op.or]: [
        { acl_owner: user.id },
        { [Op.and]: [{ acl_group: groupCodes }, Sequelize.literal(`acl_group_privs & ${priv} >= ${priv}`)] },
        { [Op.and]: Sequelize.literal(`acl_public_privs & ${priv} >= ${priv}`) },
      ],
    };

    query.where = { [Op.and]: [where, aclConditions] };
    return query;
  }

  function checkForAclColumns(model: TransomModel): void {
    const aclCols = Object.keys(model.rawAttributes).filter((attrib) => {
      return attrib == "aclOwner" || attrib == "aclGroup" || attrib == "aclGroupPrivs" || attrib == "aclPublicPrivs";
    });
    if (aclCols.length != 4) {
      throw new Error(
        `${model.name} does include the required acl columns: acl_owner(string), acl_group(string), acl_group_privs(int), acl_public_privs(int).`,
      );
    }
  }

  return {
    allowInsert,
    applyInsertDefaults,
    addAclFind,
    addAclUpdate,
    addAclDelete,
  };
}

export = HandlerAcl;
