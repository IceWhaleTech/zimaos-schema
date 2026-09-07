# Porting Applications to ZimaOS

This guide defines the execution workflow for converting an upstream
application into a reviewable, deployable ZimaOS application package. Use it
together with the [deployment decision guide](../deployment/application-deployment.md),
the published JSON Schema, and the target repository's contribution rules.

## Expected result

Porting is complete only when the package has:

- a documented upstream source and selected runtime variant;
- verified images and a correct architecture intersection;
- a Compose manifest that follows ZimaOS runtime conventions;
- accurate top-level `x-casaos` metadata;
- persistence, networking, secrets, security, and hardware decisions backed by
  evidence;
- repository-compatible assets and metadata;
- validation results and an explicit list of remaining risks.

A syntactically valid Compose file is an intermediate artifact, not the final
result.

## Phase 1: Establish scope and sources

1. Identify the official upstream repository, documentation, releases, image
   registry, and support channels.
2. Record the target ZimaOS application repository, branch, schema profile, and
   contribution documentation.
3. Read the current repository rules before inspecting examples. Existing apps
   may use legacy fields or behavior.
4. Create a Porting Decision Record using the template in the deployment
   decision guide.
5. Record inaccessible or conflicting sources immediately. Do not fill gaps by
   inference.

Use immutable or versioned evidence where possible: release URLs, commit paths,
image digests, and manifest output are stronger than an unversioned project
homepage.

## Phase 2: Analyze upstream deployment

Inspect all upstream deployment variants, including production Compose files,
example environment files, Helm charts, container documentation, and release
notes. Determine:

- which variant supplies the primary user-facing function;
- whether upstream expects embedded or external storage;
- whether databases, caches, queues, workers, or model services are required;
- whether initialization and migration jobs are one-shot or long-running;
- which optional services change user-visible features;
- which environment variables are required, secret, internal, or optional;
- which paths contain durable state;
- how health, readiness, backup, restore, and upgrades work;
- which ports are for UI, APIs, client protocols, metrics, or internal traffic;
- which permissions, devices, host integrations, and hardware are required.

Read both documentation and the actual deployment definitions. When they
conflict, prefer the version-matched release artifacts and record the conflict.

## Phase 3: Select a runtime variant

Choose the smallest upstream-supported variant that reliably provides the main
functionality. Prefer stable, published, pinned images and internal service
networking.

Split variants when CPU, CUDA, ROCm, database, or other requirements materially
change images, permissions, device mappings, storage, or user expectations.

For each omitted service or feature, record:

- whether it is optional upstream;
- what functionality is lost;
- whether metadata and screenshots need to mention the difference.

Do not convert a development deployment into a production package by merely
changing `restart` or publishing a port.

## Phase 4: Verify images and architecture support

For every main, helper, database, worker, sidecar, migration, and init image:

1. Verify the repository and tag exist.
2. Match the tag to the selected upstream release.
3. Inspect the OCI manifest or image index.
4. Record architecture and operating-system support.
5. Check whether the image requires CPU instructions, a GPU runtime, devices,
   or a specific kernel feature.
6. Record mutability and digest policy.

Calculate the intersection across all images required for installation and
startup. Set `x-casaos.architectures` only to that verified intersection.

If architecture support cannot be verified, omit the architecture rather than
claiming support. Runtime emulation is not native support unless the target
repository explicitly accepts and documents it.

## Phase 5: Build the Compose model

Start from the version-matched upstream production Compose definition when one
exists. Make the smallest changes needed for ZimaOS packaging.

### Services and dependencies

- Preserve required services, commands, entrypoints, health checks, and
  readiness conditions.
- Use Compose service names for internal endpoints.
- Do not use `localhost` between containers.
- Do not set `container_name` unless an external integration has a verified
  requirement for that exact name.
- Do not assume `depends_on` waits for database or API readiness.
- Keep migration and initialization jobs one-shot when upstream defines them
  that way. Do not apply `restart: unless-stopped` to a successfully completed
  one-shot job.
- Use a restart policy appropriate to each service. `unless-stopped` is a common
  default for long-running services, not a universal rule.

Migration commands must be safe to rerun or follow upstream's documented
deployment sequence. Determine what happens during first install, ordinary
restart, upgrade, failed migration, and rollback.

### ZimaOS paths and interpolation

Use application-owned persistent paths in this form:

```text
/DATA/AppData/$AppID/<component>
```

Use one subdirectory per independent service or data class. Verify every target
container path and its ownership requirements.

Only use ZimaOS variables in fields where the installation system documents
interpolation. Do not assume shell, Compose, and ZimaOS interpolation have the
same syntax or evaluation time. Avoid host paths outside application-owned data
unless the application's core function requires them and the security impact is
documented.

### Environment and secrets

- Copy only settings required by the selected production variant.
- Keep safe defaults inline when they are needed for unattended installation.
- Keep internal credentials consistent across all dependent services.
- Generate secrets securely or require user input; never reuse example values.
- Preserve `env_file` only when the package includes the file and installation
  can resolve it.
- When an `env_file` cannot be packaged, expand verified non-secret settings and
  handle secrets separately.
- Do not expose internal-only tuning or credentials as user options without a
  concrete need.

Inspect the fully rendered Compose output to ensure placeholders, empty
passwords, and development URLs did not survive packaging.

### Ports and networks

- Publish the primary UI port and any client protocol port required for the
  application's core function.
- Keep databases, caches, queues, workers, metrics, and internal APIs private by
  default.
- Map the selected host port to the service's real listening container port.
- Avoid host networking unless the application cannot function without it.
- Record the purpose of every published port.

Check for port collisions and for upstream settings that advertise a public URL
or callback address. Do not hard-code `localhost` when the browser or an
external integration must reach ZimaOS through a LAN address, domain, or reverse
proxy.

### Persistence

Map every required durable path to `/DATA/AppData/$AppID/<component>`. Include
databases, uploads, configuration, keys, authentication state, certificates,
plugins, and non-rebuildable or expensive model data when applicable.

Do not persist a directory based on its name alone. Do not mount broad parent
directories as a shortcut. Document backup and upgrade behavior for each data
class.

## Phase 6: Add ZimaOS application metadata

Use top-level `x-casaos` metadata. New v2 packages should not depend on legacy
service-level `x-casaos.ports`, `x-casaos.envs`, or `x-casaos.volumes`; repository
build systems may remove service-level legacy metadata.

At minimum for a repository manifest:

- include a canonical reverse-domain `x-casaos.id`;
- set `main` to an existing browser-facing service;
- set `port_map` to the actual published host port;
- set `scheme` to `http` or `https` as actually served;
- set `index` to the real entry path;
- use the verified architecture intersection;
- use accurate title, description, version, category, and assets according to
  repository policy.

Repository requirements can be stricter than the JSON Schema. In current v2
repository documentation, use current snake_case source fields such as
`update_at` and `release_notes` when those fields belong to repository metadata.
Do not copy legacy example names such as `updateAt` or `releaseNotes`.

Use a category value accepted by the current repository documentation, including
`Others` when no more specific category applies. Treat the icon as an expected
package asset when required by repository tooling. Screenshots are optional
unless the target repository explicitly requires them.

Metadata must disclose material package behavior: bundled dependencies,
hardware-specific variants, missing authentication, required keys, first-start
downloads, omitted features, and architecture limitations.

## Phase 7: Perform a security and hardware review

For each of the following, either remove it or provide explicit evidence and a
user-facing explanation:

- privileged mode;
- Docker socket access;
- host networking or host namespaces;
- broad host filesystem access;
- devices and GPU mappings;
- added capabilities or disabled security profiles;
- root execution when upstream supports an unprivileged mode.

Check authentication and secret behavior:

- no-authentication applications must carry an exposure warning;
- default credentials must be replaced or clearly disclosed;
- first-user administrator behavior must be stated;
- public exposure requirements must be documented;
- database and application credentials must agree;
- generated Compose and metadata must not leak secrets unnecessarily.

Record memory, disk, instruction-set, GPU, driver, CUDA or ROCm, model download,
and first-start requirements. Do not invent resource limits when upstream does
not provide or justify them.

## Phase 8: Validate in layers

Validation must proceed from cheap static checks to package and runtime checks:

1. Parse the YAML.
2. Validate the source manifest against the target repository ZimaOS schema.
3. Run `docker compose config` with the same variables and files available at
   install time.
4. Verify every image tag and architecture manifest.
5. Run the repository's public build entrypoint. For the current AppStore
   workflow, prefer `./scripts/build_dist.sh` over directly invoking internal
   implementation scripts such as `scripts/build_appstore.py`.
6. Inspect generated Compose, metadata, environment, asset, and package output.
7. If feasible, start the package and verify container health and application
   behavior.
8. If a ZimaOS device is available, install the generated package and test the
   actual installation and upgrade flow.

The generated output, not only the source file, must be reviewed. Repository
build logic may normalize, remove, or transform fields.

### Runtime smoke test

When runtime testing is feasible, verify:

- all required long-running containers become healthy;
- one-shot init and migration jobs complete successfully and do not restart
  forever;
- the primary UI responds at the declared scheme, port, and index path;
- internal services are not unintentionally exposed;
- required client protocol ports remain reachable;
- authentication and initial administrator behavior match the documentation;
- data survives container recreation;
- a clean installation does not depend on unbundled files;
- restart and upgrade do not corrupt or discard state;
- logs do not reveal unresolved placeholders, missing secrets, or permission
  failures.

Schema validation alone is never evidence that an application starts.

## Phase 9: Report results

The final porting report must contain:

| Item | Required content |
|---|---|
| Upstream selection | Version, release URL, variant, and omitted features |
| Images | Image tags or digests and publisher |
| Architectures | Declared intersection and verification method |
| Entry point | Main service, host/container ports, scheme, and index |
| Persistence | Host path, container path, purpose, and upgrade implications |
| Configuration | Required user settings and secret handling |
| Security | Authentication state, exposed ports, and sensitive permissions |
| Hardware | CPU, memory, disk, GPU, devices, and first-start requirements |
| Validation | Exact static, build, container, and ZimaOS checks completed |
| Risks | Unknowns, assumptions, conflicts, and untested behavior |

Use precise claims:

- Say "schema validation passed" only for schema validation.
- Say "Compose rendered successfully" only after `docker compose config`.
- Say "containers started" only after runtime startup.
- Say "tested on ZimaOS" only after installation on a ZimaOS device.

If a value cannot be verified, report it as unknown. Do not invent a port,
volume, credential, architecture, hardware requirement, URL, version, or
permission to make the package appear complete.

## Review checklist

- [ ] Official upstream and version are recorded.
- [ ] The selected variant provides the primary function.
- [ ] Every required image tag exists.
- [ ] Declared architectures equal the all-image intersection.
- [ ] Main service, published port, scheme, and index agree.
- [ ] Internal services are not exposed without a reason.
- [ ] Every persistent mount has upstream evidence.
- [ ] Secrets are generated or explicitly requested, not copied from examples.
- [ ] Health checks, dependencies, migrations, and init jobs are preserved.
- [ ] Restart policies distinguish long-running and one-shot services.
- [ ] High-risk permissions have explicit justification.
- [ ] Hardware and first-start requirements are documented.
- [ ] Top-level `x-casaos.id` is present and canonical.
- [ ] Current repository field names, categories, assets, and locale rules are
      followed.
- [ ] `docker compose config` and repository build output are inspected.
- [ ] Runtime and ZimaOS test claims match the checks actually performed.
- [ ] Unknowns and remaining risks are listed.
