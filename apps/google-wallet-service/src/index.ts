import express from "express";
import morgan from "morgan";
import { GoogleWalletClient } from "./wallet/googleWalletClient.js";
import { routes } from "./routes.js";
import { adminRoutes } from "./adminRoutes.js";
import { requireAdminAuth } from "./authMiddleware.js";
import { RetryQueue } from "./recovery/retryQueue.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

const credentialsJson = process.env.GW_CREDENTIALS_JSON ?? "{}";
const issuerId = process.env.GW_ISSUER_ID ?? "ISSUER_ID";

const defaultTitle = process.env.GW_DEFAULT_TITLE ?? process.env.ORGANIZATION_NAME ?? "Wallet Pass";
const client = new GoogleWalletClient({ issuerId, credentialsJson, defaultTitle });

// Retry queue for failed Google Wallet API calls (notifications, geofence updates).
const retryQueue = new RetryQueue({
  intervalMs: Number(process.env.GW_RETRY_INTERVAL_MS ?? 15_000),
  maxAttempts: Number(process.env.GW_RETRY_MAX_ATTEMPTS ?? 4),
});
retryQueue.start();

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/", routes(client));

// Admin endpoints — protected by API key.
app.use("/admin", requireAdminAuth, adminRoutes(client, retryQueue));

const port = Number(process.env.PORT ?? 8081);
app.listen(port, () => console.log(`google-wallet-service listening on :${port}`));
