//
// Implements the *shape* of the five PassKit update web services.
// Your doc explicitly calls out five endpoints as required for updates.
// We implement these as working Express routes with a memory store.
// (You will still need APNs push wiring to actually trigger device refresh.)
//
import { Router } from "express";
import { MemoryStore } from "../storage/memoryStore.js";
import { buildManifest, writeManifest } from "../pass/manifest.js";
import { signManifestPKCS7Detached } from "../pass/sign.js";
import { zipPkpass } from "../pass/zip.js";
import { config } from "../config.js";
import path from "node:path";
import fs from "node:fs";

function requireAuth(req: any, expectedToken: string) {
  const auth = req.headers["authorization"] as string | undefined;
  // PassKit uses Authorization: ApplePass <token>
  // Keep it strict in production.
  if (!auth) return false;
  const parts = auth.split(" ");
  return parts.length === 2 && parts[1] === expectedToken;
}

export function passkitRoutes(store: MemoryStore) {
  const r = Router();

  // 1) Register a device to receive push notifications for a pass
  // POST /v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber
  r.post("/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber", (req, res) => {
    const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = req.params;
    const pushToken = req.body?.pushToken as string | undefined;

    const pass = store.getPass({ passTypeIdentifier, serialNumber });
    if (!pass) return res.sendStatus(404);
    if (!requireAuth(req, pass.authenticationToken)) return res.sendStatus(401);

    if (!pushToken) return res.status(400).json({ error: "Missing pushToken" });

    store.upsertDevice({ deviceLibraryIdentifier, pushToken });
    store.register(deviceLibraryIdentifier, { passTypeIdentifier, serialNumber });

    // 201 if created, 200 if already existed; we'll always respond 201 for simplicity.
    return res.sendStatus(201);
  });

  // 2) Get serial numbers for passes that changed since a timestamp
  // GET /v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier?passesUpdatedSince=tag
  r.get("/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier", (req, res) => {
    const { deviceLibraryIdentifier, passTypeIdentifier } = req.params;
    const since = Number(req.query.passesUpdatedSince ?? 0);

    const serialNumbers = store.listUpdatedSerials(deviceLibraryIdentifier, since);

    // If none changed, 204 No Content.
    if (serialNumbers.length === 0) return res.sendStatus(204);

    return res.json({
      lastUpdated: Date.now(),
      serialNumbers
    });
  });

  // 3) Get latest version of a pass
  // GET /v1/passes/:passTypeIdentifier/:serialNumber
  r.get("/v1/passes/:passTypeIdentifier/:serialNumber", async (req, res) => {
    const { passTypeIdentifier, serialNumber } = req.params;
    const pass = store.getPass({ passTypeIdentifier, serialNumber });
    if (!pass) return res.sendStatus(404);
    if (!requireAuth(req, pass.authenticationToken)) return res.sendStatus(401);

    // Rebuild pkpass on demand from a stored passJson template.
    // In production, cache built pkpass per updatedAt tag.
    const tmpDir = `./tmp/${serialNumber}.pass`;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    fs.writeFileSync(path.join(tmpDir, "pass.json"), JSON.stringify(pass.passJson, null, 2));

    // Minimal required image; real impl uses your brand assets.
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axr2ZkAAAAASUVORK5CYII=";
    fs.writeFileSync(path.join(tmpDir, "icon.png"), Buffer.from(pngBase64, "base64"));

    // manifest + signature + zip
    const manifest = buildManifest(tmpDir);
    writeManifest(tmpDir, manifest);

    signManifestPKCS7Detached({
      passSourceDir: tmpDir,
      manifestPath: path.join(tmpDir, "manifest.json"),
      outputSignaturePath: path.join(tmpDir, "signature"),
      passCertPemPath: config.signing.passCertPemPath,
      passKeyPemPath: config.signing.passKeyPemPath,
      wwdrCertPemPath: config.signing.wwdrCertPemPath
    });

    const pkpassPath = `./tmp/${serialNumber}.pkpass`;
    await zipPkpass(tmpDir, pkpassPath);

    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Last-Modified", new Date(pass.updatedAt).toUTCString());
    return res.sendFile(path.resolve(pkpassPath));
  });

  // 4) Unregister a device
  // DELETE /v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber
  r.delete("/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber", (req, res) => {
    const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = req.params;
    const pass = store.getPass({ passTypeIdentifier, serialNumber });
    if (!pass) return res.sendStatus(404);
    if (!requireAuth(req, pass.authenticationToken)) return res.sendStatus(401);

    store.unregister(deviceLibraryIdentifier, { passTypeIdentifier, serialNumber });
    return res.sendStatus(200);
  });

  // 5) Log errors
  // POST /v1/log
  r.post("/v1/log", (req, res) => {
    // PassKit sends a JSON payload with logs; store for debugging.
    console.log("PASSKIT LOG:", JSON.stringify(req.body ?? {}, null, 2));
    return res.sendStatus(200);
  });

  return r;
}
