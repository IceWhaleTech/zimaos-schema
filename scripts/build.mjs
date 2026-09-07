import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourceDirectory = path.join(root, "schema");
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

console.log(`Built ${schemaFiles.length} JSON Schema files into dist/.`);

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
