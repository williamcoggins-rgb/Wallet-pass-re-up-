import express from "express";
import bodyParser from "body-parser";
import morgan from "morgan";
import { GoogleWalletClient } from "./wallet/googleWalletClient.js";
import { routes } from "./routes.js";

const app = express();
app.use(bodyParser.json({ limit: "2mb" }));
app.use(morgan("dev"));

const client = new GoogleWalletClient({
  issuerId: process.env.GW_ISSUER_ID ?? "ISSUER_ID",
  credentialsJson: process.env.GW_CREDENTIALS_JSON ?? "{}"
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/", routes(client));

const port = Number(process.env.PORT ?? 8081);
app.listen(port, () => console.log(`google-wallet-service listening on :${port}`));
