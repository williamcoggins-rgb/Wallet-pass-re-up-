import express from "express";
import morgan from "morgan";
import crypto from "node:crypto";
import { config } from "./config.js";
import { MemoryStore } from "./storage/memoryStore.js";
import { passkitRoutes } from "./web/passkitRoutes.js";
import { adminRoutes } from "./web/adminRoutes.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

const store = new MemoryStore();

// Seed a demo pass record (so routes have something to work with).
const serialNumber = "SERIAL-" + Date.now();
const authenticationToken = crypto.randomBytes(16).toString("hex");

store.upsertPass({
  passTypeIdentifier: config.passTypeIdentifier,
  serialNumber,
  authenticationToken,
  updatedAt: Date.now(),
  passJson: {
    formatVersion: 1,
    passTypeIdentifier: config.passTypeIdentifier,
    serialNumber,
    teamIdentifier: config.teamIdentifier,
    organizationName: config.organizationName,
    description: config.description,
    logoText: "ReUp",
    authenticationToken,
    webServiceURL: config.webServiceURL,
    generic: {
      primaryFields: [{ key: "member", label: "Member", value: "Jane Doe" }],
      secondaryFields: [{ key: "tier", label: "Tier", value: "Gold" }]
    },
    barcodes: [
      {
        format: "PKBarcodeFormatQR",
        message: `member:${serialNumber}`,
        messageEncoding: "iso-8859-1"
      }
    ],
    // Geofencing: pass appears on lock screen when user is near these locations.
    locations: config.defaultLocations,
    maxDistance: 500
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

// PassKit web service endpoints
app.use("/passes", passkitRoutes(store));

// Admin endpoints for sending updates and sales specials
app.use("/admin", adminRoutes(store));

// Convenience endpoint to fetch the demo pass without device registration flow.
app.get("/demo.pkpass", (req, res) => {
  res.json({
    note: "Use PassKit endpoints under /passes for real device flows.",
    passTypeIdentifier: config.passTypeIdentifier,
    serialNumber,
    authenticationToken,
    hint: "GET /passes/v1/passes/:passTypeIdentifier/:serialNumber with Authorization: ApplePass <token>"
  });
});

app.listen(config.port, () => {
  console.log(`apple-pass-service listening on :${config.port}`);
});
