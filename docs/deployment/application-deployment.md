# ZimaOS Application Deployment Decisions

This guide defines how to make reliable deployment decisions for a ZimaOS
application. Its goal is not merely to produce a Docker Compose file that
passes schema validation. The resulting package must have a well-supported
chance of starting correctly, preserving user data, matching the target
hardware, and avoiding unnecessary exposure or privileges.

## Rule hierarchy

Use sources of truth in this order:

1. Published ZimaOS JSON Schemas define accepted structure, field types, and
   enumerations.
2. The target application repository's contribution profile defines submission,
   metadata, asset, packaging, and versioning requirements.
3. Upstream application documentation defines supported runtime behavior.
4. Upstream Compose files, container documentation, release artifacts, and OCI
   image metadata define concrete deployment details.
5. Existing ZimaOS applications may be used as examples, but cannot override a
   current schema, repository rule, or upstream requirement.

These layers answer different questions:

| Layer | Question answered |
|---|---|
| JSON Schema | Is the document structure and field value valid? |
| Repository profile | Can the package be submitted to this AppStore repository? |
| Deployment practice | Can the application run reliably and safely? |

Do not infer that a field is required only because it appears in an example.
Do not infer that a field is optional for repository submission only because a
JSON Schema does not require it.

Schema validation does not prove that:

- `x-casaos.main` names an existing service;
- `x-casaos.port_map` matches a published port on the main service;
- every required image supports every declared architecture;
- mounted volumes contain the application's real persistent state;
- credentials shared by services are consistent;
- the application has safe authentication defaults;
- privileged mode, host networking, devices, or Docker socket access are needed;
- migrations complete successfully or containers become healthy.

## Evidence-first decisions

Do not guess deployment information. Every material decision must cite an
upstream source or be marked as unknown.

Before selecting a deployment, collect:

- official source, documentation, release, issue, and support URLs;
- supported installation methods and available Compose variants;
- image registries, repositories, tags, digests, and release mapping;
- architectures supported by every service image;
- the primary browser-facing service, protocol, entry path, and container port;
- databases, caches, queues, workers, model servers, and initialization jobs;
- required, optional, internal, and secret environment variables;
- persistent configuration, content, database, certificate, plugin, model, and
  cache paths;
- health checks, startup dependencies, migrations, and first-run initialization;
- authentication flow, default credentials, and administrator creation rules;
- CPU, memory, disk, GPU, kernel, device, and instruction-set requirements;
- privileged mode, capabilities, Docker socket, host namespace, host network,
  device, and host filesystem requirements;
- backup, restore, and upgrade implications.

Use a decision record for complex applications:

## Porting Decision Record

| Decision | Selected value | Evidence | Confidence |
|---|---|---|---|
| Upstream version | `1.2.3` | Official release URL | High |
| Main service | `web` | Upstream production Compose file | High |
| Web container port | `8080` | Image documentation | High |
| Persistent data | `/app/data` | Upstream volume declaration | High |
| `amd64` support | Yes | OCI image manifest | High |
| `arm64` support | Unknown | No matching manifest found | Low |
| Authentication | First-user setup | Upstream administration guide | High |
| Memory requirement | Unknown | Not documented | Low |

The evidence column should contain a URL, repository path and revision, image
manifest result, or another reproducible reference. Confidence never replaces
evidence.

## Runtime variant selection

Select the smallest reliable variant that provides the application's primary
user-facing functionality.

Prefer:

- upstream-published images over local builds;
- stable releases over development branches;
- pinned release tags over `latest`;
- CPU-compatible variants for general-purpose installations;
- internal Compose networking over published helper-service ports;
- upstream-supported embedded storage only when appropriate for the expected
  workload;
- the upstream-recommended production database when an external database is
  required.

Create separate CPU, CUDA, ROCm, database, or other specialized packages when
their images, devices, permissions, or operating requirements differ
materially. Do not combine incompatible hardware variants unless upstream
provides and documents a reliable selection mechanism.

Do not silently remove an upstream service. If an optional service is excluded,
record the resulting feature difference in the package metadata.

## Images, versions, and architectures

For every image needed to install or start the application:

1. Verify that the selected tag exists.
2. Determine whether the tag maps to the intended upstream release.
3. Inspect its OCI manifest or image index.
4. Record supported operating systems and CPU architectures.
5. Determine whether the tag is mutable and whether a digest is required by the
   target repository policy.
6. Repeat the checks for databases, workers, sidecars, migration jobs, and init
   containers.

The package architecture list is the intersection of architectures supported
by all required images. Never declare `arm64` only because the main image
supports it when a required helper image does not.

Do not replace an official image with an unofficial image without documenting:

- why the replacement is necessary;
- who publishes and maintains it;
- how it maps to an upstream source revision or release;
- the resulting trust, update, and support implications.

Keep these values distinct:

- Compose project `name`;
- top-level `x-casaos.id`;
- source directory name;
- display `title`;
- upstream application version;
- package revision;
- container image tag or digest.

Use a stable reverse-domain value for `x-casaos.id`. Use the upstream release
for `x-casaos.version` when possible. If packaging changes without a new
upstream release, follow the repository's package-version policy rather than
inventing a misleading upstream version.

## Persistence and upgrades

Determine persistent state from upstream image documentation, source code, and
Compose definitions. A directory named `/data`, `/config`, or `/var/lib` is not
evidence by itself.

Persist state that must survive container replacement, including as applicable:

- databases and transaction logs;
- uploaded or user-created content;
- application configuration;
- encryption keys and authentication state;
- generated certificates;
- plugins and extensions;
- model files and expensive model caches;
- indexes that cannot be safely or cheaply rebuilt.

Store application-owned state under:

```text
/DATA/AppData/$AppID/<component>
```

Use separate subdirectories for independent services or data classes. Do not
mount the whole container filesystem or broad parent directories. Do not
persist temporary files, package caches, or rebuildable runtime state unless
upstream requires it or rebuilding has a material operational cost.

For each volume, record:

- owning service and container path;
- content and expected size;
- required UID, GID, and permissions;
- whether it is included in backups;
- upgrade or migration behavior;
- whether rollback remains possible after a schema migration.

Do not assume `$AppID` is ordinary shell expansion. Use it only where the
ZimaOS installation mechanism documents interpolation support.

## Environment variables and secrets

Classify environment values as:

| Class | Handling |
|---|---|
| Required runtime setting | Provide a verified value or require user input |
| Safe user setting | Expose only when users benefit from changing it |
| Optional tuning | Keep the upstream default unless there is a deployment reason |
| Secret | Generate securely or require an explicit user-provided value |
| Internal connection value | Keep private and consistent across related services |

Inline safe defaults required for installation. Do not copy sample passwords,
placeholder API keys, development secrets, or empty credentials into a
production package.

Do not expose internal database passwords as user-adjustable settings unless
users must provide them. Ensure a credential has exactly the same value in the
client and server services that share it.

Preserve an `env_file` only when the installed package includes the referenced
file and the runtime can resolve it. Otherwise expand verified non-secret values
into the manifest and provide an installation-time mechanism for secrets. Do
not convert a missing secret file into hard-coded credentials.

If secure generation is unavailable, document the limitation and require the
user to replace the value before public exposure. Never silently configure an
empty password when upstream expects authentication.

## Ports, entry points, and networking

Publish only ports needed by users or external integrations. Publish the main UI
by default. A client protocol port may also be published when it is part of the
application's core function; document its purpose.

For the primary UI:

- set `x-casaos.main` to the service that serves the UI;
- set `x-casaos.port_map` to the actual published host port;
- set `x-casaos.index` to the real entry path;
- set `x-casaos.scheme` to the protocol the application actually serves;
- verify that the published mapping reaches the main service's listening
  container port.

Do not publish database, Redis, queue, worker, metrics, or internal API ports
unless direct access is a documented user requirement.

Use Compose service names for communication between containers. `localhost`
inside a container refers to that container, not another service. Do not
hard-code `localhost` into browser-facing public URLs when users access the
application through a LAN address, domain, or reverse proxy.

Preserve health checks and readiness-based dependency conditions when they are
needed for reliable startup. `depends_on` startup ordering alone does not prove
that a dependency is ready.

Avoid `container_name` by default. Compose service names already provide stable
internal DNS, while fixed container names can conflict with another project or
installation.

Avoid host networking unless functionally required. Document why it is needed,
which ports the process binds, and how it changes isolation and port management.

## Security review

Treat these capabilities as high risk and require explicit upstream evidence
and package documentation:

- `privileged: true`;
- Docker socket access;
- host networking;
- host PID or IPC namespaces;
- broad host filesystem mounts;
- device access;
- added Linux capabilities;
- disabled security profiles;
- root execution when upstream supports an unprivileged user.

Do not add a high-risk permission to bypass a configuration, ownership, or
networking problem.

State clearly when:

- the application has no authentication;
- default credentials are configured;
- the first registered user becomes administrator;
- public exposure is unsafe without a reverse proxy or access control;
- the application can execute commands or manage Docker;
- the application reads sensitive files from the host.

Review whether credentials appear in Compose output, logs, UI metadata, or
generated artifacts. Security-sensitive packaging differences belong in the
application description or pre-install warning, not only in reviewer notes.

## Hardware and resources

Document material runtime requirements:

- minimum and recommended memory;
- supported CPU architectures;
- AVX or other instruction-set requirements;
- NVIDIA GPU model, driver, and CUDA requirements;
- ROCm support and compatible devices;
- required device mappings;
- expected application and database disk usage;
- model download and cache size;
- large first-start downloads or long initialization;
- kernel modules, sysctls, or host services.

Do not add arbitrary limits or reservations without upstream evidence or
measured justification. A GPU package must not be presented as generally
installable when it requires a specific driver stack or device mapping.

## Metadata and assets

Metadata must describe the packaged deployment, not only the upstream project.
Mention important differences such as:

- bundled database or cache;
- CPU-only or GPU-specific images;
- omitted optional services;
- large first-start downloads;
- missing authentication or first-user administration;
- required API keys;
- unsupported architectures.

Prefer local assets that the repository build pipeline can package. Use
upstream branding only when its source and reuse are appropriate. Screenshots
must represent the packaged UI and must not imply unavailable features.

Only declare locales that contain meaningful translations. Use current
repository field names and enum values. In particular, do not copy legacy
service-level `x-casaos` metadata into new v2 packages; current metadata belongs
at the top level unless a repository explicitly documents otherwise.

## Required deployment report

Every completed deployment analysis should report:

- chosen upstream version and image tags or digests;
- declared and verified architecture intersection;
- primary service, host port, container port, scheme, and index path;
- persistent host and container paths;
- required user configuration and secrets handling;
- security-sensitive permissions and exposure warnings;
- hardware and storage requirements;
- validation performed;
- assumptions, unknowns, and unverified runtime risks.

Do not claim successful ZimaOS deployment unless the application was installed
and tested on a ZimaOS device. Otherwise state exactly which static,
container-level, or runtime checks were completed.
