import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { createDesktopConfigStore } = require("./desktop-config.js");

test("builds the complete runtime config for the active backend port", () => {
  const app = {
    getPath() {
      throw new Error("runtime config construction must not touch the filesystem");
    },
  };
  const store = createDesktopConfigStore(app, { desktopApiKey: "desktop-test-key" });
  store.setBackendApiPort(41234);

  const runtimeConfig = store.buildDesktopRuntimeConfig({
    ocrProvider: "paddle",
    ocrCredentialRef: "cred_ocr",
    translationCredentialRef: "cred_translation",
    mineruToken: "mineru-token",
    paddleToken: "paddle-token",
    modelApiKey: "model-key",
    model: "model-name",
    baseUrl: "https://model.example/v1",
    developerConfig: { trace: true },
  });

  assert.deepEqual(runtimeConfig, {
    apiBase: "http://127.0.0.1:41234",
    xApiKey: "desktop-test-key",
    ocrProvider: "local",
    ocrCredentialRef: "",
    translationCredentialRef: "cred_translation",
    mineruToken: "",
    paddleToken: "",
    modelApiKey: "model-key",
    model: "model-name",
    baseUrl: "https://model.example/v1",
    developerConfig: { trace: true },
  });
});

test("saving local settings preserves existing OCR secrets without using them", (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "retainpdf-desktop-config-"));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const store = createDesktopConfigStore({
    getPath(name) {
      assert.equal(name, "userData");
      return userData;
    },
  });

  fs.writeFileSync(store.resolveDesktopConfigPath(), JSON.stringify({
    ocrProvider: "paddle", ocrCredentialRef: "cred_ocr", paddleToken: "desktop-ocr",
  }));
  const saved = store.saveDesktopConfig({
    firstRunCompleted: true,
    ocrProvider: "local",
    ocrCredentialRef: "",
    translationCredentialRef: "cred_translation",
    paddleToken: "",
    modelApiKey: "desktop-model",
  });

  assert.equal(saved.firstRunCompleted, true);
  assert.equal(saved.ocrProvider, "local");
  assert.equal(saved.ocrCredentialRef, "cred_ocr");
  assert.equal(saved.translationCredentialRef, "cred_translation");
  assert.equal(saved.paddleToken, "desktop-ocr");
  assert.equal(saved.modelApiKey, "desktop-model");
  const raw = fs.readFileSync(store.resolveDesktopConfigPath(), "utf8");
  assert.equal(raw.includes("desktop-ocr"), true);
  assert.equal(raw.includes("desktop-model"), true);
});

test("restores translation independently and never resolves an OCR vault reference", (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "retainpdf-desktop-vault-migration-"));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const secretsDir = path.join(userData, "data", "secrets");
  fs.mkdirSync(secretsDir, { recursive: true });
  fs.writeFileSync(path.join(secretsDir, "credentials.json"), JSON.stringify({
    credentials: {
      cred_ocr: { kind: "ocr_provider_token", provider: "paddle", secret: "restored-ocr" },
      cred_translation: { kind: "translation_api_key", secret: "restored-model" },
    },
  }));
  const store = createDesktopConfigStore({
    getPath(name) {
      assert.equal(name, "userData");
      return userData;
    },
  });

  const response = store.buildDesktopConfigResponse({
    firstRunCompleted: true,
    closeToTrayHintShown: false,
    ocrProvider: "paddle",
    ocrCredentialRef: "cred_ocr",
    translationCredentialRef: "cred_translation",
    paddleToken: "",
    modelApiKey: "",
    mineruToken: "",
    model: "model-name",
    baseUrl: "https://model.example/v1",
    developerConfig: {},
  });

  assert.equal(response.browserConfig.paddleToken, "");
  assert.equal(response.browserConfig.mineruToken, "");
  assert.equal(response.browserConfig.ocrCredentialRef, "");
  assert.equal(response.browserConfig.ocrProvider, "local");
  assert.equal(response.browserConfig.modelApiKey, "restored-model");
});

test("local defaults do not read legacy OCR vaults and preserve both stored token fields", (t) => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "retainpdf-desktop-local-"));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  const store = createDesktopConfigStore({ getPath: () => userData }, {
    resolveCredentialSecret() { throw new Error("must not resolve an OCR secret"); },
  });
  assert.equal(store.createDefaultDesktopConfig().ocrProvider, "local");
  fs.writeFileSync(store.resolveDesktopConfigPath(), JSON.stringify({
    ocrProvider: "mineru", ocrCredentialRef: "cred_old", mineruToken: "old-mineru", paddleToken: "old-paddle",
    model: "chosen-model", baseUrl: "https://chosen.example/v1", developerConfig: { trace: true },
  }));
  const response = store.buildDesktopConfigResponse(store.loadDesktopConfig());
  assert.equal(response.browserConfig.ocrProvider, "local");
  assert.equal(response.browserConfig.ocrCredentialRef, "");
  assert.equal(response.browserConfig.mineruToken, "");
  assert.equal(response.browserConfig.paddleToken, "");
  store.saveDesktopConfig({ ocrProvider: "local", ocrCredentialRef: "", mineruToken: "", paddleToken: "" });
  const saved = JSON.parse(fs.readFileSync(store.resolveDesktopConfigPath(), "utf8"));
  assert.equal(saved.mineruToken, "old-mineru");
  assert.equal(saved.paddleToken, "old-paddle");
  assert.equal(saved.ocrCredentialRef, "cred_old");
  assert.equal(saved.model, "chosen-model");
  assert.equal(saved.baseUrl, "https://chosen.example/v1");
  assert.deepEqual(saved.developerConfig, { trace: true });
});
