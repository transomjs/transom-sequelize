# @transomjs/transom-sequelize change log

## Unreleased
- Ported to TypeScript. The package now ships type definitions: the plugin, the API
  definition shapes (`SequelizeDefinition`, `TableDefinition`, `TableRouteFx`, `Responder`,
  `TableAcl`...), `TransomModel`/`TransomEntity`, and every `lib/*` module.
  `import transomSequelize = require("@transomjs/transom-sequelize")` and use
  `transomSequelize.TableDefinition` etc.
- The compiled code is in `dist/` (`main` is now `dist/index.js`). `lib/*.js` are kept as
  shims, so `require("@transomjs/transom-sequelize/lib/modelFunctions")` and the other deep
  imports still work.
- The server types are structural (`TransomServerLike`), so this package doesn't need
  transom-core to ship types. No global Express `Request` augmentation is added; handlers
  receive `TransomRequest` (`Request & { locals }`).
- `lodash` and `debug` are now declared dependencies (they were used but only installed
  through sequelize). `@types/express` is a dependency because the public types use it.
- Fixed: `findById` on a table with an `acl` always failed with a 400 (it assigned an
  undeclared variable). It now applies the ACL to the lookup.
- The npm package no longer includes `.claude/settings.local.json` or `CLAUDE.md`.
- **Fixed: startup failures now reject.** `initialize()` used to log the error and resolve,
  leaving an unhandled rejection, so transom-core's `initialize()` (and any retry loop around
  it) couldn't tell startup had failed. It now rejects with the error. That includes errors
  defining the models (e.g. a static or method that already exists), which used to escape as
  uncaught exceptions.
- **Fixed: `config.retryOptions` is honoured.** The plugin's defaults (`max: 10`,
  `timeout: 10000`, ...) used to overwrite it; now it overrides the defaults.
- **Fixed: sqlite foreign keys no longer hang startup.** sqlite reports `references` and
  `unique` on each column; the metadata generator choked on the first (startup never
  finished) and wrote the second as the string `"false"`. It now writes `references: {model,
  key}` and `unique: true` where they apply. Any column the generator can't handle now fails
  startup with an error instead of hanging.

## 1.0.16
- Adding tests for handlerUtils

## 1.0.15
- refactored modelFunction to cleanup Promises
- stripped commented code
- using strong types for query values
- fixed like operator queries
- many others

## 1.0.6
- adding sequelize to the transom server registry


## 1.0.5
- fixed the output path for generated metadata files

## 1.0.4
- Added delete batch support
- Added _select support on find queries

## 1.0.0
- First release