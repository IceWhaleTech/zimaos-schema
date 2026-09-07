import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourceDirectory = path.join(root, "schema");
const documentationSourceDirectory = path.join(root, "docs");
const outputDirectory = path.join(root, "dist");
const checkOnly = process.argv.includes("--check");
const quiet = process.argv.includes("--quiet");

const schemaFiles = await collectJSON(sourceDirectory);
if (schemaFiles.length === 0) {
  throw new Error("No JSON Schema files found under schema/");
}

for (const file of schemaFiles) {
  JSON.parse(await readFile(file, "utf8"));
}

if (checkOnly) {
  if (!quiet) {
    console.log(`Validated ${schemaFiles.length} JSON Schema files.`);
  }
  process.exit(0);
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const file of schemaFiles) {
  const relativePath = path.relative(root, file);
  const outputPath = path.join(outputDirectory, relativePath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await cp(file, outputPath);
}

const publicPaths = schemaFiles.map((file) =>
  `/${path.relative(root, file).split(path.sep).join("/")}`,
);

await writeFile(path.join(outputDirectory, "index.html"), renderHome(publicPaths));
await writeFile(path.join(outputDirectory, "404.html"), renderNotFound());
const origin = (process.env.SCHEMA_SITE_ORIGIN ?? "https://schema.zimaos.com").replace(/\/$/, "");
const documentationInput = path.join(outputDirectory, "docs", "schema");
await mkdir(path.join(outputDirectory, "docs"), { recursive: true });
await cp(documentationSourceDirectory, path.join(outputDirectory, "docs"), {
  recursive: true,
});
await mkdir(documentationInput, { recursive: true });
await cp(
  path.join(sourceDirectory, "zimaapp", "v2", "x-casaos.schema.json"),
  path.join(documentationInput, "x-casaos.schema.json"),
);
execFileSync(
  process.execPath,
  [
    path.join(root, "node_modules", "@adobe", "jsonschema2md", "cli.js"),
    "-d",
    documentationInput,
    "-o",
    path.join(outputDirectory, "docs"),
    "-x",
    "-",
    "-f",
    "yaml",
    "-p",
    "x-zimaapp-status",
    "-p",
    "x-zimaapp-warning",
    "-p",
    "x-zimaapp-replacement",
  ],
  { stdio: quiet ? "ignore" : "inherit" },
);
await writeFile(path.join(outputDirectory, "llms.txt"), renderLlms(origin));
await writeFile(
  path.join(outputDirectory, "llms-full.txt"),
  await readFile(path.join(outputDirectory, "docs", "x-casaos.md"), "utf8"),
);
await writeFile(
  path.join(outputDirectory, "_headers"),
  [
    "/*",
    "  Access-Control-Allow-Origin: *",
    "  X-Content-Type-Options: nosniff",
    "  Referrer-Policy: no-referrer",
    "",
    "/schema/*",
    "  Cache-Control: public, max-age=300, must-revalidate",
    "",
    "/schema/compose-go/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
  ].join("\n"),
);

console.log(`Built ${schemaFiles.length} JSON Schema files and Markdown documentation into dist/.`);

async function collectJSON(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJSON(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

function renderHome(paths) {
  const links = paths
    .map((schemaPath) => {
      const name = schemaPath.split("/").at(-1);
      return `<li><a href="${escapeHTML(schemaPath)}">${escapeHTML(name)}</a> <code>${escapeHTML(schemaPath)}</code></li>`;
    })
    .join("\n");

  return page(
    "ZimaOS Schemas",
    `<main>
  <h1>ZimaOS Schemas</h1>
  <p>Versioned JSON Schemas for ZimaOS.</p>
  <h2>Available schemas</h2>
  <ul>
    ${links}
  </ul>
</main>`,
  );
}

function renderLlms(origin) {
  return `# ZimaOS Schemas

> JSON Schemas and generated field documentation for ZimaOS application manifests.

## Documentation

- [x-casaos field documentation](${origin}/docs/README.md): Markdown reference generated from the published extension schema.

## Application Deployment

- [Application deployment decisions](${origin}/docs/deployment/application-deployment.md): Evidence-driven rules for selecting images, architectures, persistence, networking, secrets, security, and hardware requirements.

## Application Porting

- [Application porting guide](${origin}/docs/porting/application-porting.md): End-to-end workflow for analyzing an upstream project, creating a ZimaOS package, validating generated output, and reporting remaining risks.

## Instructions for AI Agents

- Produce a deployable application package, not merely a syntactically valid Compose file.
- Follow schemas, repository rules, upstream documentation, and image metadata in that order.
- Cite evidence for material deployment decisions and report unknown values instead of guessing.
- Do not claim successful ZimaOS deployment without installation and testing on a ZimaOS device.

## Schemas

- [Repository manifest schema](${origin}/schema/zimaapp/v2/repository.schema.json): Validation profile for repository submissions.
- [General v2App schema](${origin}/schema/zimaapp/v2/zimaapp-v2app.schema.json): Validation profile for general v2App Compose files.
- [x-casaos extension schema](${origin}/schema/zimaapp/v2/x-casaos.schema.json): Field definitions for the top-level extension.
`;
}

function renderNotFound() {
  return page(
    "Schema not found",
    `<main>
  <h1>404 - Schema not found</h1>
  <p>No schema exists at this path.</p>
  <p><a href="/">View available schemas</a></p>
</main>`,
  );
}

function page(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Versioned JSON Schemas for ZimaOS">
  <title>${escapeHTML(title)}</title>
</head>
<body>${content}</body>
</html>\n`;
}

function escapeHTML(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
