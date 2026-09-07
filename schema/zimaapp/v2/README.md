# ZimaApp v2App schemas

Go types and profile definitions in `reops/ZimaOS-AppManagement` are the source of truth for these generated JSON schemas. The GitHub workflow builds and runs the schema generator in that submodule, then syncs the artifacts into this directory.

## Choose a profile

- `zimaapp-v2app.schema.json` validates general v2App Compose files. Top-level `x-casaos` and its `id` are optional.
- `repository.schema.json` validates repository submissions. Top-level `x-casaos` and canonical `x-casaos.id` are required. `repo_id` and `version` remain optional.
- `x-casaos.schema.json` validates the extension alone.

The generated profiles extend the vendored upstream schema used by Docker Compose `v2.23.3`, which resolves to `compose-go v1.20.2`:

```text
../../compose-go/v1.20.2/schema/compose-spec.json
```

The upstream schema is committed at `schema/compose-go/v1.20.2/schema/compose-spec.json`, so schema consumers do not need network access. CI verifies that this copy still matches the immutable upstream tag. When the project's Docker Compose dependency changes, update the vendored file and relative reference to the schema version selected by that Docker Compose release.

For VS Code with YAML Language Server, put this at the top of a repository Compose file:

```yaml
# yaml-language-server: $schema=./schema/zimaapp/v2/repository.schema.json
```

For a general v2App file, use:

```yaml
# yaml-language-server: $schema=./schema/zimaapp/v2/zimaapp-v2app.schema.json
```

Adjust the relative path when the Compose file is in another directory.

## Application IDs

Canonical `id` values are lowercase, namespaced identifiers matching `^[a-z0-9_-]+(?:\.[a-z0-9_-]+)+$`, for example `com.example.demo`. Runtime parsing remains compatible with older behavior and may normalize surrounding whitespace and uppercase input, but authored repository files must already be canonical.

`store_app_id` is deprecated and never substitutes for `id`. Migrate it to `id` using the canonical naming rule. A historical single-segment value such as `demo` needs a namespace, for example `com.example.demo`; do not copy `demo` directly into `id`.

## Field status

`autostart` is reserved; do not set it directly. `image_drift_check` is reserved and managed by ZimaOS; do not set it directly. Reserved fields are not deprecated.

`store_app_id` is deprecated in favor of canonical `id`. `is_uncontrolled` is deprecated and should be removed directly without replacement. Unknown top-level `x-casaos` properties remain allowed for forward compatibility.

## Scope

Only the top-level `x-casaos` extension is typed. A service-level `services.<name>.x-casaos` remains a generic Compose `x-*` extension and is intentionally neither defined nor forbidden here.

These schemas do not describe or expose installation/update override behavior, internal handling of `name`, `x-zima-app`, `pull_policy`, or `labels`, OpenAPI contracts, runtime schema validation, or legacy DTOs.
