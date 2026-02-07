import path from "node:path";
import fs from "node:fs";
import { buildManifest, writeManifest } from "./manifest.js";
import { signManifestPKCS7Detached } from "./sign.js";
import { zipPkpass } from "./zip.js";
import { config } from "../config.js";

async function main() {
  const passSourceDir = process.argv[2] ?? "./out/MyMembership.pass";
  const outPkpassPath = process.argv[3] ?? "./out/MyMembership.pkpass";

  if (!fs.existsSync(passSourceDir)) throw new Error(`Pass source dir not found: ${passSourceDir}`);

  // 1) Build manifest.json (SHA-1 per file)
  const manifest = buildManifest(passSourceDir);
  writeManifest(passSourceDir, manifest);

  // 2) Sign manifest.json -> signature (PKCS#7 detached)
  const manifestPath = path.join(passSourceDir, "manifest.json");
  const signaturePath = path.join(passSourceDir, "signature");

  signManifestPKCS7Detached({
    passSourceDir,
    manifestPath,
    outputSignaturePath: signaturePath,
    passCertPemPath: config.signing.passCertPemPath,
    passKeyPemPath: config.signing.passKeyPemPath,
    wwdrCertPemPath: config.signing.wwdrCertPemPath
  });

  // 3) Zip pass source -> .pkpass
  await zipPkpass(passSourceDir, outPkpassPath);

  console.log("Built pkpass:", outPkpassPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
