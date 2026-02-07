//
// Apple Push Notification service (APNs) client.
// Uses HTTP/2 APNs API with token-based authentication (.p8 key).
// When you update a pass, call sendEmptyPush() to all registered devices
// so iOS knows to re-fetch the pass from your web service.
//
import http2 from "node:http2";
import jwt from "jsonwebtoken";
import fs from "node:fs";

export interface ApnsConfig {
  // Path to your .p8 APNs auth key file (downloaded from Apple Developer portal).
  keyPath: string;
  // The 10-character Key ID shown in Apple Developer portal.
  keyId: string;
  // Your 10-character Team ID.
  teamId: string;
  // Your Pass Type ID (e.g., "pass.com.reup.membership").
  passTypeIdentifier: string;
  // Use production (api.push.apple.com) or sandbox (api.sandbox.push.apple.com).
  production?: boolean;
}

export class ApnsClient {
  private key: string;
  private keyId: string;
  private teamId: string;
  private passTypeIdentifier: string;
  private host: string;
  private cachedToken: { token: string; issuedAt: number } | null = null;

  constructor(config: ApnsConfig) {
    if (!fs.existsSync(config.keyPath)) {
      console.warn(`APNs key file not found at ${config.keyPath} — push notifications disabled.`);
      this.key = "";
    } else {
      this.key = fs.readFileSync(config.keyPath, "utf-8");
    }
    this.keyId = config.keyId;
    this.teamId = config.teamId;
    this.passTypeIdentifier = config.passTypeIdentifier;
    this.host = config.production
      ? "https://api.push.apple.com"
      : "https://api.sandbox.push.apple.com";
  }

  private isConfigured(): boolean {
    return this.key !== "" && this.keyId !== "" && this.teamId !== "";
  }

  // Generate or reuse a JWT for APNs token-based auth.
  // Tokens are valid for 1 hour; we refresh after 50 minutes.
  private getAuthToken(): string {
    const now = Math.floor(Date.now() / 1000);

    if (this.cachedToken && now - this.cachedToken.issuedAt < 3000) {
      return this.cachedToken.token;
    }

    const token = jwt.sign(
      { iss: this.teamId, iat: now },
      this.key,
      { algorithm: "ES256", keyid: this.keyId }
    );

    this.cachedToken = { token, issuedAt: now };
    return token;
  }

  // Send an empty push notification to a device so it re-fetches the updated pass.
  // Apple PassKit requires an empty body push — the notification itself is silent.
  async sendEmptyPush(pushToken: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: "APNs not configured (missing key/keyId/teamId)" };
    }

    return new Promise((resolve) => {
      const client = http2.connect(this.host);

      client.on("error", (err) => {
        client.close();
        resolve({ success: false, error: err.message });
      });

      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${pushToken}`,
        "authorization": `bearer ${this.getAuthToken()}`,
        "apns-topic": this.passTypeIdentifier,
        "apns-push-type": "background",
        "apns-priority": "5",
      });

      // PassKit update pushes send an empty JSON body.
      req.write(JSON.stringify({}));
      req.end();

      let responseData = "";
      let statusCode = 0;

      req.on("response", (headers) => {
        statusCode = headers[":status"] as number;
      });

      req.on("data", (chunk: Buffer) => {
        responseData += chunk.toString();
      });

      req.on("end", () => {
        client.close();
        if (statusCode === 200) {
          resolve({ success: true });
        } else {
          resolve({
            success: false,
            error: `APNs returned ${statusCode}: ${responseData}`,
          });
        }
      });
    });
  }

  // Notify all devices registered to a pass that the pass has been updated.
  // Returns a summary of how many succeeded/failed.
  async notifyAllDevices(pushTokens: string[]): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    errors: string[];
  }> {
    let succeeded = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const token of pushTokens) {
      const result = await this.sendEmptyPush(token);
      if (result.success) {
        succeeded++;
      } else {
        failed++;
        if (result.error) errors.push(`${token.slice(0, 8)}...: ${result.error}`);
      }
    }

    return { total: pushTokens.length, succeeded, failed, errors };
  }
}
