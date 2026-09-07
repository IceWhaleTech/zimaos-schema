import { execFileSync } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "reops", "ZimaOS-AppManagement");
const sourceDirectory = path.join(sourceRoot, "schema", "zimaapp", "v2");
const composeSourceRoot = path.join(root, "reops", "compose-go");
const composeSourceSchema = path.join(composeSourceRoot, "schema", "compose-spec.json");
const targetDirectory = path.join(root, "schema", "zimaapp", "v2");
const composeSchema = path.join(root, "schema", "compose-go", "v1.20.2", "compose-spec.json");
const expectedSchemas = [
  "repository.schema.json",
  "x-casaos.schema.json",
  "zimaapp-v2app.schema.json",
];
const localComposeRef = "../../compose-go/v1.20.2/compose-spec.json";
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "zimaapp-schema-"));
const generator = path.join(temporaryDirectory, "zimaapp-schema");
const oxfmt = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "oxfmt.cmd" : "oxfmt");

try {
  verifySubmoduleCommit("reops/ZimaOS-AppManagement", sourceRoot);
  verifySubmoduleCommit("reops/compose-go", composeSourceRoot);
  await requireRegularDirectory(path.join(root, "schema", "zimaapp"));
  await requireRegularDirectory(targetDirectory);
  await lstat(composeSourceSchema);
  await cp(composeSourceSchema, composeSchema);

  run("go", ["build", "-o", generator, "./cmd/zimaapp-schema"], sourceRoot);
  await removeSchemas(sourceDirectory);
  run(generator, [], sourceRoot);
  await verifyGeneratedFiles();
  run("go", ["test", "./cmd/zimaapp-schema", "./internal/zimaappschema"], sourceRoot);

  await mkdir(targetDirectory, { recursive: true });
  await removeSchemas(targetDirectory);
  const sourceReadme = await readFile(path.join(sourceDirectory, "README.md"), "utf8");
  const publishedReadme = sourceReadme
    .replace(
      "Go types and profile definitions are the source of truth for these generated JSON schemas. Regenerate artifacts with `go generate ./...`; normal `go build` does not generate files, and generated artifacts are intentionally ignored by Git.",
      "Go types and profile definitions in `reops/ZimaOS-AppManagement` are the source of truth for these generated JSON schemas. Run `npm run generate:zimaapp` from the repository root to regenerate, format with `oxfmt`, and sync the published artifacts.",
    )
    .replace(
      "https://raw.githubusercontent.com/compose-spec/compose-go/v1.20.2/schema/compose-spec.json",
      localComposeRef,
    )
    .replace(
      "The upstream schema is referenced directly and is not copied or generated here, so consumers must be able to reach `raw.githubusercontent.com`. When the project's Docker Compose dependency changes, update `ComposeSchemaURL` to the schema version selected by that Docker Compose release.",
      "The upstream schema is copied from the fixed `reops/compose-go` submodule into `schema/compose-go/v1.20.2/compose-spec.json`, so published consumers do not need network access. When the project's Docker Compose dependency changes, update the submodule gitlink, published copy, and relative reference together.",
    );
  await writeFile(path.join(targetDirectory, "README.md"), publishedReadme);

  for (const name of expectedSchemas) {
    await cp(path.join(sourceDirectory, name), path.join(targetDirectory, name));
  }

  const profilePath = path.join(targetDirectory, "zimaapp-v2app.schema.json");
  const profile = JSON.parse(await readFile(profilePath, "utf8"));
  profile.allOf[0].$ref = localComposeRef;
  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`);
  run(oxfmt, [composeSchema, ...expectedSchemas.map((name) => path.join(targetDirectory, name))], root);

  console.log(`Synced ${expectedSchemas.length} ZimaApp schemas from ${path.relative(root, sourceRoot)}.`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

function verifySubmoduleCommit(submodulePath, worktree) {
  const expected = capture("git", ["rev-parse", `:${submodulePath}`], root);
  const actual = capture("git", ["rev-parse", "HEAD"], worktree);

  if (actual !== expected) {
    throw new Error(
      `${submodulePath} commit mismatch: index records ${expected}, but the worktree is at ${actual}. Update or stage the submodule gitlink first.`,
    );
  }
}

async function requireRegularDirectory(directory) {
  const stats = await lstat(directory);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`${path.relative(root, directory)} must be a regular directory.`);
  }
}

async function removeSchemas(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".schema.json"))
      .map((entry) => rm(path.join(directory, entry.name))),
  );
}

async function verifyGeneratedFiles() {
  const actual = (await readdir(sourceDirectory))
    .filter((name) => name.endsWith(".schema.json"))
    .sort();

  if (JSON.stringify(actual) !== JSON.stringify(expectedSchemas)) {
    throw new Error(`Unexpected generated schemas: ${actual.join(", ") || "none"}`);
  }
}

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function capture(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
}
