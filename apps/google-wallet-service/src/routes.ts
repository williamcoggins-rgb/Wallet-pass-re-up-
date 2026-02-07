import { Router } from "express";
import { GoogleWalletClient } from "./wallet/googleWalletClient.js";

export function routes(client: GoogleWalletClient) {
  const r = Router();

  // Create or update a wallet pass and return the "Add to Google Wallet" save URL.
  r.post("/v1/passes/upsert", async (req, res) => {
    const { userId, passKind, payload } = req.body ?? {};
    if (!userId || !passKind) return res.status(400).json({ error: "userId and passKind required" });

    try {
      const result = await client.createOrUpdatePass({ userId, passKind, payload: payload ?? {} });
      return res.json(result);
    } catch (err: any) {
      console.error("upsert error:", err);
      return res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // Send a push notification to a user's saved pass.
  r.post("/v1/passes/notify", async (req, res) => {
    const { passObjectId, message } = req.body ?? {};
    if (!passObjectId || !message) return res.status(400).json({ error: "passObjectId and message required" });

    try {
      const result = await client.notifyUser(passObjectId, message);
      return res.json(result);
    } catch (err: any) {
      console.error("notify error:", err);
      return res.status(500).json({ error: err.message ?? "Internal error" });
    }
  });

  // Generate a save URL for an existing pass object (without creating/updating it).
  r.get("/v1/passes/:objectId/save-url", (req, res) => {
    const { objectId } = req.params;
    const saveUrl = client.createSaveUrl(objectId);
    return res.json({ objectId, saveUrl });
  });

  return r;
}
