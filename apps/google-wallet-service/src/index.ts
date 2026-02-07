import express from "express";
import morgan from "morgan";
import { GoogleWalletClient } from "./wallet/googleWalletClient.js";
import { routes } from "./routes.js";
import { adminRoutes } from "./adminRoutes.js";
import { requireAdminAuth } from "./authMiddleware.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

const credentialsJson = process.env.GW_CREDENTIALS_JSON ?? "{}";
const issuerId = process.env.GW_ISSUER_ID ?? "ISSUER_ID";

const client = new GoogleWalletClient({ issuerId, credentialsJson });

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/", routes(client));

// Admin endpoints — protected by API key.
app.use("/admin", requireAdminAuth, adminRoutes(client));

const port = Number(process.env.PORT ?? 8081);
app.listen(port, () => console.log(`google-wallet-service listening on :${port}`));
