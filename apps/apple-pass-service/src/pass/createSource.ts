//
// Creates a canonical .pass source folder:
// - folder name ends with .pass
// - includes pass.json
// - includes required icon.png (placeholder)
// - optional localization folders (en.lproj etc.) with pass.strings
//
// Your Apple doc: source contains image files, pass.json, optional localization,
// and the source folder name is <PassName>.pass.
//
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../config.js";

// Resolve the assets directory relative to this file's location.
const assetsDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../assets"
);

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function copyAsset(filename: string, destPath: string) {
  const src = path.join(assetsDir, filename);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, destPath);
  } else {
    console.warn(`Asset not found: ${src} — pass may be missing this image`);
  }
}

function randomToken() {
  return crypto.randomBytes(16).toString("hex");
}

const outDir = process.argv[2] ?? "./out/MyMembership.pass";
ensureDir(outDir);

// Required top-level for a simple storeCard/generic style pass.
// In production, match this to your pass type (storeCard, eventTicket, coupon, generic, boardingPass).
const passJson = {
  formatVersion: 1,
  passTypeIdentifier: config.passTypeIdentifier,
  serialNumber: "SERIAL-" + Date.now(),
  teamIdentifier: config.teamIdentifier,
  organizationName: config.organizationName,
  description: config.description,
  logoText: "ReUp",

  // Required for update web service; used as shared secret.
  authenticationToken: randomToken(),
  webServiceURL: config.webServiceURL,

  // Pick one style key. Here: generic.
  generic: {
    primaryFields: [
      { key: "member", label: "Member", value: "Jane Doe" }
    ],
    secondaryFields: [
      { key: "tier", label: "Tier", value: "Gold" }
    ]
  },

  // Barcodes array (preferred over the deprecated singular "barcode" key).
  barcodes: [
    {
      format: "PKBarcodeFormatQR",
      message: "member:SERIAL",
      messageEncoding: "iso-8859-1"
    }
  ],

  backgroundColor: "rgb(0, 0, 0)",
  foregroundColor: "rgb(255, 255, 255)",
  labelColor: "rgb(237, 28, 36)"
};

fs.writeFileSync(path.join(outDir, "pass.json"), JSON.stringify(passJson, null, 2));

// Copy brand images from assets/ into the pass bundle.
// Apple requires icon.png; logo.png is shown on the pass face.
// @2x and @3x variants are optional but recommended for Retina screens.
const imageFiles = [
  "icon.png", "icon@2x.png", "icon@3x.png",
  "logo.png", "logo@2x.png", "logo@3x.png",
];
for (const file of imageFiles) {
  copyAsset(file, path.join(outDir, file));
}

// Optional localization example (en.lproj/pass.strings)
const enLproj = path.join(outDir, "en.lproj");
ensureDir(enLproj);
fs.writeFileSync(
  path.join(enLproj, "pass.strings"),
  [
    `"Member" = "Member";`,
    `"Tier" = "Tier";`
  ].join("\n"),
  { encoding: "utf16le" } // recommended for non-ASCII strings in pass.strings
);

console.log("Created pass source at:", outDir);
