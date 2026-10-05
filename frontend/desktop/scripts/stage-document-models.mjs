import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function stageDocumentModels(repo, backend) {
  const python = path.join(backend, "python/bin/python3");
  const staging = fs.mkdtempSync(path.join(backend, ".model-stage-"));
  try {
    const result = spawnSync(python, ["-B", path.join(repo, "ops/models/fetch.py"),
      "--offline", "--stage", staging], { stdio: "inherit" });
    if (result.status !== 0) throw new Error("Pinned CPU components missing; run python3 ops/models/fetch.py first.");
    fs.cpSync(path.join(staging, "models"), path.join(backend, "models"), { recursive: true });
    fs.cpSync(path.join(staging, "site"), path.join(backend, "python/lib/python3.11/site-packages"),
      { recursive: true });
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
