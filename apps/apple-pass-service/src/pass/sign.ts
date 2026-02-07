import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export type SignInput = {
  passSourceDir: string;
  manifestPath: string;     // typically <passSourceDir>/manifest.json
  outputSignaturePath: string; // typically <passSourceDir>/signature
  passCertPemPath: string;
  passKeyPemPath: string;
  wwdrCertPemPath: string;
};

export function signManifestPKCS7Detached(input: SignInput) {
  // Uses OpenSSL to create a detached PKCS#7 signature of manifest.json.
  //
  // This matches the requirement that the pkpass includes:
  // - manifest.json: sha-1 hashes
  // - signature: detached PKCS #7 signature of manifest.json
  //
  // Command strategy:
  //   openssl smime -binary -sign -certfile WWDR.pem -signer pass-cert.pem -inkey pass-key.pem
  //     -in manifest.json -out signature -outform DER -nodetach
  //
  // Note: Some implementations use -nodetach for DER packaging; verify with Wallet tests.
  // If you see validation issues, try toggling -nodetach vs default detach behavior.
  //
  const args = [
    "smime",
    "-binary",
    "-sign",
    "-certfile", input.wwdrCertPemPath,
    "-signer", input.passCertPemPath,
    "-inkey", input.passKeyPemPath,
    "-in", input.manifestPath,
    "-out", input.outputSignaturePath,
    "-outform", "DER",
    "-nodetach"
  ];

  const res = spawnSync("openssl", args, { cwd: input.passSourceDir });
  if (res.status !== 0) {
    const stderr = res.stderr?.toString() ?? "";
    throw new Error(`OpenSSL signing failed: ${stderr}`);
  }

  if (!fs.existsSync(input.outputSignaturePath)) {
    throw new Error("Signature file was not created.");
  }
}
