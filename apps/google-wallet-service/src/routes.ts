import { Router } from "express";
import { GoogleWalletClient } from "./wallet/googleWalletClient.js";

export function routes(client: GoogleWalletClient) {
  const r = Router();

  r.post("/v1/passes/upsert", async (req, res) => {
    const { userId, passKind, payload } = req.body ?? {};
    if (!userId || !passKind) return res.status(400).json({ error: "userId and passKind required" });

    const result = await client.createOrUpdatePass({ userId, passKind, payload: payload ?? {} });
    return res.json(result);
  });

  r.post("/v1/passes/notify", async (req, res) => {
    const { passObjectId, message } = req.body ?? {};
    if (!passObjectId || !message) return res.status(400).json({ error: "passObjectId and message required" });

    const result = await client.notifyUser(passObjectId, message);
    return res.json(result);
  });

  return r;
}
