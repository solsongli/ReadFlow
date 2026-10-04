const nodeGlobals = {
  AbortController: "readonly",
  Buffer: "readonly",
  URL: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  clearInterval: "readonly",
  clearTimeout: "readonly",
  console: "readonly",
  fetch: "readonly",
  module: "readonly",
  process: "readonly",
  require: "readonly",
  setInterval: "readonly",
  setTimeout: "readonly",
  window: "readonly",
};

export default [
  {
    files: ["main.js", "preload.js", "src/main/**/*.js", "src/main/**/*.mjs", "scripts/run-local.mjs", "scripts/check-existing-data.mjs", "scripts/linux-runtime*.mjs", "scripts/package-readflow-linux*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: nodeGlobals,
      sourceType: "commonjs",
    },
    rules: {
      "no-undef": "error",
    },
  },
  {
    files: ["src/main/**/*.mjs", "scripts/run-local.mjs", "scripts/check-existing-data.mjs", "scripts/linux-runtime*.mjs", "scripts/package-readflow-linux*.mjs"],
    languageOptions: {
      sourceType: "module",
    },
  },
];
