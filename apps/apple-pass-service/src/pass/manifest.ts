import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type Manifest = Record<string, string>;

function sha1(buf: Buffer) {
  return crypto.createHash("sha1").update(buf).digest("hex");
}

function walk(dir: string, rootDir: string, files: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(rootDir, full).replaceAll("\\", "/");
    if (entry.isDirectory()) walk(full, rootDir, files);
    else files.push(rel);
  }
  return files;
}

export function buildManifest(passSourceDir: string): Manifest {
  // Every file in the bundle is in the manifest except manifest.json and signature.
  const allFiles = walk(passSourceDir, passSourceDir)
    .filter(f => f !== "manifest.json" && f !== "signature");

  const manifest: Manifest = {};
  for (const rel of allFiles) {
    const buf = fs.readFileSync(path.join(passSourceDir, rel));
    manifest[rel] = sha1(buf);
  }
  return manifest;
}

export function writeManifest(passSourceDir: string, manifest: Manifest) {
  fs.writeFileSync(
    path.join(passSourceDir, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );
}
