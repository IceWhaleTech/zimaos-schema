import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2019 from "ajv/dist/2019.js";
import { beforeAll, describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaBase = "https://schema.zimaos.com/schema/";
const schemaFiles = {
  compose: "compose-go/v1.20.2/compose-spec.json",
  extension: "zimaapp/v2/x-casaos.schema.json",
  v2app: "zimaapp/v2/zimaapp-v2app.schema.json",
  repository: "zimaapp/v2/repository.schema.json",
};

const schemas = {};
const validators = {};

async function loadSchema(relativePath) {
  return JSON.parse(await readFile(path.join(root, "schema", relativePath), "utf8"));
}

function removeLegacyIds(value, insideProperties = false) {
  if (Array.isArray(value)) return value.map((child) => removeLegacyIds(child));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => insideProperties || key !== "id")
      .map(([key, child]) => [key, removeLegacyIds(child, key === "properties")]),
  );
}

function absoluteSchema(schema, relativePath) {
  const compatibleSchema = relativePath === schemaFiles.compose ? removeLegacyIds(schema) : schema;
  return { ...compatibleSchema, $id: new URL(relativePath, schemaBase).href };
}

function expectValid(validate, value) {
  const valid = validate(value);
  expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
}

function expectInvalid(validate, value, keyword) {
  expect(validate(value)).toBe(false);
  if (keyword) {
    expect(validate.errors?.some((error) => error.keyword === keyword)).toBe(true);
  }
}

beforeAll(async () => {
  for (const [name, relativePath] of Object.entries(schemaFiles)) {
    schemas[name] = absoluteSchema(await loadSchema(relativePath), relativePath);
  }

  const ajv = new Ajv2019({ allErrors: true, strict: false });
  for (const format of ["duration", "expose", "ports", "subnet_ip_address"]) {
    ajv.addFormat(format, true);
  }

  for (const schema of Object.values(schemas)) {
    ajv.addSchema(schema);
  }

  validators.extension = ajv.getSchema(schemas.extension.$id);
  validators.v2app = ajv.getSchema(schemas.v2app.$id);
  validators.repository = ajv.getSchema(schemas.repository.$id);
});

describe("published schema structure", () => {
  it.each(Object.entries(schemaFiles))(
    "loads %s as Draft 2019-09 JSON Schema",
    async (_, relativePath) => {
      const schema = await loadSchema(relativePath);
      expect(schema.$schema).toBe("https://json-schema.org/draft/2019-09/schema#");
      expect(schema.title).toEqual(expect.any(String));
    },
  );

  it("keeps every relative reference inside the published schema tree", async () => {
    for (const [name, schema] of Object.entries(schemas)) {
      const references = JSON.stringify(schema).match(/(?<=\"\$ref\":\")[^\"]+/g) ?? [];

      for (const reference of references) {
        if (reference.startsWith("#")) continue;

        const targetUrl = new URL(reference, schema.$id);
        expect(targetUrl.href, `${name}: ${reference}`).toMatch(new RegExp(`^${schemaBase}`));
        await expect(readFile(path.join(root, targetUrl.pathname))).resolves.toBeDefined();
      }
    }
  });

  it("compiles all cross-schema references", () => {
    expect(validators.extension).toEqual(expect.any(Function));
    expect(validators.v2app).toEqual(expect.any(Function));
    expect(validators.repository).toEqual(expect.any(Function));
  });
});

describe("x-casaos extension", () => {
  const completeExtension = {
    architectures: ["amd64", "arm64"],
    author: "IceWhale Technology",
    autostart: true,
    category: "Media",
    description: { en_us: "Long description", zh_cn: "Detailed description" },
    developer: "Example Developer",
    hostname: "zima.local",
    icon: "https://example.com/icon.png",
    id: "com.example.media-server",
    image: { en_us: "Image caption" },
    image_drift_check: false,
    index: "/ui/",
    is_uncontrolled: false,
    main: "app",
    port_map: "8080",
    release_note: "Initial release",
    repo_id: "stable",
    scheme: "https",
    screenshot_link: ["https://example.com/1.png", "/assets/2.png"],
    store_app_id: "legacy-app-id",
    tagline: { en_us: "Short description" },
    thumbnail: "https://example.com/thumbnail.png",
    tips: {
      before_install: { en_us: "Back up your data" },
      custom: "Custom installation note",
      future_tip: { enabled: true },
    },
    title: { en_us: "Example App" },
    version: "1.2.3",
    future_extension: { enabled: true },
  };

  it("accepts every field, reserved and deprecated fields, and future properties", () => {
    expectValid(validators.extension, completeExtension);
  });

  it.each([
    ["architectures", { architectures: "amd64" }],
    ["architectures items", { architectures: [1] }],
    ["author", { author: 1 }],
    ["autostart", { autostart: "true" }],
    ["category", { category: false }],
    ["description", { description: [] }],
    ["description values", { description: { en_us: 1 } }],
    ["developer", { developer: null }],
    ["hostname", { hostname: 1 }],
    ["icon", { icon: {} }],
    ["image", { image: "caption" }],
    ["image values", { image: { en_us: false } }],
    ["image_drift_check", { image_drift_check: 1 }],
    ["index", { index: 1 }],
    ["is_uncontrolled", { is_uncontrolled: "false" }],
    ["main", { main: [] }],
    ["port_map", { port_map: 8080 }],
    ["release_note", { release_note: [] }],
    ["repo_id", { repo_id: 1 }],
    ["screenshot_link", { screenshot_link: "image.png" }],
    ["screenshot_link items", { screenshot_link: [1] }],
    ["store_app_id", { store_app_id: false }],
    ["tagline", { tagline: [] }],
    ["tagline values", { tagline: { en_us: 1 } }],
    ["thumbnail", { thumbnail: 1 }],
    ["tips", { tips: "note" }],
    ["tips.before_install", { tips: { before_install: [] } }],
    ["tips.before_install values", { tips: { before_install: { en_us: 1 } } }],
    ["tips.custom", { tips: { custom: false } }],
    ["title", { title: [] }],
    ["title values", { title: { en_us: 1 } }],
    ["version", { version: 1 }],
  ])("rejects an invalid %s", (_, value) => {
    expectInvalid(validators.extension, value, "type");
  });

  it.each(["http", "https"])("accepts the %s scheme", (scheme) => {
    expectValid(validators.extension, { scheme });
  });

  it.each(["ftp", "HTTP", "", 80])("rejects the unsupported scheme %j", (scheme) => {
    expectInvalid(validators.extension, { scheme }, typeof scheme === "string" ? "enum" : "type");
  });

  it.each(["com.example.app", "io.zimaos.media-server", "com_1.example_app", "a.b"])(
    "accepts canonical application id %s",
    (id) => expectValid(validators.extension, { id }),
  );

  it.each([
    "demo",
    "Com.Example.App",
    "com.example.",
    ".com.example",
    "com..example",
    "com.example app",
    " com.example.app ",
    "com/example/app",
    "",
  ])("rejects non-canonical application id %j", (id) => {
    expectInvalid(validators.extension, { id }, "pattern");
  });
});

describe("general v2App profile", () => {
  it("accepts a realistic Compose application with typed x-casaos metadata", () => {
    expectValid(validators.v2app, {
      name: "example-app",
      services: {
        app: {
          image: "ghcr.io/example/app:1.2.3",
          command: ["serve", "--port", "8080"],
          environment: { TZ: "UTC", DEBUG: "false" },
          ports: ["8080:8080"],
          volumes: ["app-data:/data"],
          healthcheck: { test: ["CMD", "healthcheck"], interval: "30s" },
          restart: "unless-stopped",
          labels: { "com.example.role": "main" },
          "x-service-extension": { enabled: true },
        },
      },
      volumes: { "app-data": {} },
      networks: { default: {} },
      "x-casaos": {
        id: "com.example.app",
        main: "app",
        port_map: "8080",
        scheme: "http",
        title: { en_us: "Example App" },
      },
      "x-future-compose-extension": { enabled: true },
    });
  });

  it.each([{}, { services: { app: { image: "example/app:latest" } } }, { "x-casaos": {} }])(
    "keeps services, x-casaos, and x-casaos.id optional for general files",
    (value) => expectValid(validators.v2app, value),
  );

  it.each([
    ["unknown top-level property", { unknown: true }, "additionalProperties"],
    ["invalid project name", { name: "Example App" }, "pattern"],
    [
      "invalid service name",
      { services: { "bad service": { image: "app" } } },
      "additionalProperties",
    ],
    [
      "unknown service property",
      { services: { app: { image: "app", unknown: true } } },
      "additionalProperties",
    ],
    ["invalid image type", { services: { app: { image: 1 } } }, "type"],
    ["invalid x-casaos", { "x-casaos": { scheme: "ftp" } }, "enum"],
  ])("rejects %s", (_, value, keyword) => {
    expectInvalid(validators.v2app, value, keyword);
  });

  it("accepts a service without image or build because the pinned Compose schema permits it", () => {
    expectValid(validators.v2app, { services: { app: {} } });
  });
});

describe("repository profile", () => {
  const validRepositoryApp = {
    services: { app: { image: "ghcr.io/example/app:latest" } },
    "x-casaos": { id: "com.example.app", main: "app" },
  };

  it("accepts a repository app with canonical id", () => {
    expectValid(validators.repository, validRepositoryApp);
  });

  it("keeps repo_id and version optional", () => {
    expectValid(validators.repository, validRepositoryApp);
    expectValid(validators.repository, {
      ...validRepositoryApp,
      "x-casaos": { ...validRepositoryApp["x-casaos"], repo_id: "stable", version: "1.0.0" },
    });
  });

  it.each([
    ["missing x-casaos", { services: { app: { image: "app" } } }, "required"],
    ["missing x-casaos.id", { "x-casaos": {}, services: { app: { image: "app" } } }, "required"],
    ["legacy store_app_id without id", { "x-casaos": { store_app_id: "demo" } }, "required"],
    ["non-canonical id", { "x-casaos": { id: "Demo" } }, "pattern"],
    [
      "invalid Compose content",
      { "x-casaos": { id: "com.example.app" }, unknown: true },
      "additionalProperties",
    ],
  ])("rejects %s", (_, value, keyword) => {
    expectInvalid(validators.repository, value, keyword);
  });
});
