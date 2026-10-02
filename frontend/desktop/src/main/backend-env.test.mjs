import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { buildBackendEnv } = require("./backend-env.js");

test("passes a relocated AI port to both Rust proxy and supervised Python child", () => {
  const env = buildBackendEnv({
    apiPort: 41001,
    aiServicePort: 41101,
    backendRoot: "C:\\RetainPDF\\backend",
    bundledFontPath: "C:\\RetainPDF\\font.otf",
    bundledPythonImportPaths: [],
    bundledTitleBoldFontPath: "C:\\RetainPDF\\font-bold.otf",
    bundledTypstFontDir: "C:\\RetainPDF\\fonts",
    dataRoot: "C:\\RetainPDF\\data",
    desktopApiKey: "desktop-key",
    pythonRuntime: { command: "C:\\RetainPDF\\python.exe" },
    rustApiRoot: "C:\\RetainPDF\\rust-api",
    scriptsDir: "C:\\RetainPDF\\pipeline",
    simplePort: 42001,
    typstBin: "C:\\RetainPDF\\typst.exe",
    typstPackageCachePath: "C:\\RetainPDF\\typst-cache",
    typstPackagePath: "C:\\RetainPDF\\typst-packages",
  });

  assert.equal(env.RUST_API_AI_SERVICE_BASE, "http://127.0.0.1:41101");
  assert.equal(env.RUST_API_AI_HOST, "127.0.0.1");
  assert.equal(env.RUST_API_AI_PORT, "41101");
  assert.equal(env.RETAIN_AI_HOST, "127.0.0.1");
  assert.equal(env.RETAIN_AI_PORT, "41101");
});

test("original pipeline and settings share the optional OCR root and explicit checkout sources", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "retainpdf-local-ocr-env-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceCodeRoot = path.join(root, "checkout");
  const sourcePipeline = path.join(sourceCodeRoot, "backend", "pipeline");
  fs.mkdirSync(path.join(sourcePipeline, "retainpdf_pipeline"), { recursive: true });
  fs.writeFileSync(path.join(sourcePipeline, "retainpdf_pipeline", "__init__.py"), "");
  const backendRoot = path.join(root, "bundled-backend");
  const dataRoot = path.join(root, "data");
  const options = {
    apiPort: 41060, simplePort: 42060, backendRoot, dataRoot, sourceCodeRoot,
    desktopApiKey: "synthetic", pythonRuntime: { command: "/selected/python" },
    scriptsDir: path.join(backendRoot, "pipeline"),
    typstBin: path.join(root, "typst"), typstPackagePath: path.join(root, "packages"),
  };
  const env = buildBackendEnv(options);
  assert.equal(env.RETAIN_LOCAL_OCR_ROOT, path.join(dataRoot, "research-library", "optional-ocr"));
  assert.equal(env.RETAIN_PDF_ALLOW_OCR_DOWNLOAD, process.env.RETAIN_PDF_ALLOW_OCR_DOWNLOAD === "0" ? "0" : "1");
  assert.equal(env.RUST_API_SCRIPTS_DIR, sourcePipeline);
  assert.equal(env.RETAIN_OCR_PROVIDER_CONFIG, path.join(sourceCodeRoot, "backend", "config", "ocr_providers.json"));
  assert.deepEqual(env.PYTHONPATH.split(path.delimiter).slice(0, 4), [
    sourcePipeline, path.join(sourceCodeRoot, "backend"), path.join(backendRoot, "research-library"), backendRoot,
  ]);
  const bundled = buildBackendEnv({ ...options, sourceCodeRoot: path.join(root, "absent") });
  assert.equal(bundled.RUST_API_SCRIPTS_DIR, options.scriptsDir);
  assert.equal(bundled.RETAIN_OCR_PROVIDER_CONFIG, path.join(backendRoot, "config", "ocr_providers.json"));
});

test("normal capability defaults allow explicit actions while preview opt-outs are preserved", (t) => {
  const flags = ["RETAIN_PDF_ALLOW_OCR_DOWNLOAD", "RETAIN_PDF_ALLOW_EXTERNAL_MODELS"];
  const original = Object.fromEntries(flags.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const name of flags) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  });
  const options = {
    backendRoot: "/synthetic/backend", dataRoot: "/synthetic/ReadFlow/data",
    pythonRuntime: { command: "/synthetic/python" },
    typstBin: "/synthetic/typst", typstPackagePath: "/synthetic/packages",
  };
  for (const name of flags) delete process.env[name];
  const defaults = buildBackendEnv(options);
  for (const name of flags) assert.equal(defaults[name], "1");
  assert.equal(defaults.RETAIN_LOCAL_OCR_ROOT, "/synthetic/ReadFlow/data/research-library/optional-ocr");
  for (const name of flags) process.env[name] = "0";
  const disabled = buildBackendEnv(options);
  for (const name of flags) assert.equal(disabled[name], "0");
});
