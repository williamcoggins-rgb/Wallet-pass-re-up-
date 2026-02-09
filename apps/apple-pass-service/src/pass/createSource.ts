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

// storeCard is the correct style for loyalty / membership passes (barbershop, retail, etc.).
const serialNumber = "SERIAL-" + Date.now();
const passJson = {
  formatVersion: 1,
  passTypeIdentifier: config.passTypeIdentifier,
  serialNumber,
  teamIdentifier: config.teamIdentifier,
  organizationName: config.organizationName,
  description: config.description,
  logoText: "ReUp Barbershop",

  // Required for update web service; used as shared secret.
  authenticationToken: randomToken(),
  webServiceURL: config.webServiceURL,

  // storeCard style — ideal for barbershop loyalty passes.
  storeCard: {
    headerFields: [
      { key: "visits", label: "Visits", value: 0 }
    ],
    primaryFields: [
      { key: "member", label: "Client", value: "Walk-In" }
    ],
    secondaryFields: [
      { key: "tier", label: "Tier", value: "New" },
      { key: "barber", label: "Barber", value: "Any" }
    ],
    auxiliaryFields: [
      { key: "nextAppt", label: "Next Appointment", value: "Not Scheduled" },
      { key: "points", label: "Points", value: "0" }
    ],
    backFields: [
      { key: "memberSince", label: "Member Since", value: new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" }) },
      { key: "rewardsInfo", label: "Rewards Program", value: "Earn 1 point per visit. 10 points = 1 free haircut. VIP members get priority booking." },
      { key: "hours", label: "Hours", value: "Mon-Fri 9AM-7PM | Sat 8AM-5PM | Sun Closed" },
      { key: "contact", label: "Contact", value: "Call or text to book your appointment." }
    ]
  },

  // Barcodes array (preferred over the deprecated singular "barcode" key).
  barcodes: [
    {
      format: "PKBarcodeFormatQR",
      message: `barbershop:${serialNumber}`,
      messageEncoding: "iso-8859-1"
    }
  ],

  backgroundColor: "rgb(0, 0, 0)",
  foregroundColor: "rgb(255, 255, 255)",
  labelColor: "rgb(237, 28, 36)",

  // Geofencing — pass appears on lock screen when user is within the barbershop area.
  locations: config.defaultLocations,
  maxDistance: 500
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
    `"Client" = "Client";`,
    `"Tier" = "Tier";`,
    `"Barber" = "Barber";`,
    `"Visits" = "Visits";`,
    `"Next Appointment" = "Next Appointment";`,
    `"Points" = "Points";`
  ].join("\n"),
  { encoding: "utf16le" } // recommended for non-ASCII strings in pass.strings
);

console.log("Created pass source at:", outDir);
