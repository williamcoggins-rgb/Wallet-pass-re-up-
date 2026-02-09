// Parse default geofence locations from env (JSON array) or use a sensible default.
function parseDefaultLocations() {
  const raw = process.env.DEFAULT_LOCATIONS;
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      console.warn("Invalid DEFAULT_LOCATIONS JSON — using empty array");
      return [];
    }
  }

  const orgName = process.env.ORGANIZATION_NAME ?? "ReUp";
  return [
    {
      latitude: 40.7128,
      longitude: -74.0060,
      relevantText: `Welcome to ${orgName}! Show your pass for rewards.`,
    },
  ];
}

export const config = {
  port: Number(process.env.PORT ?? 8080),

  // Apple Pass identifiers (must match your Apple portal + cert)
  passTypeIdentifier: process.env.PASS_TYPE_IDENTIFIER ?? "pass.com.example.membership",
  teamIdentifier: process.env.TEAM_IDENTIFIER ?? "TEAMID1234",
  organizationName: process.env.ORGANIZATION_NAME ?? "ReUp",
  description: process.env.PASS_DESCRIPTION ?? "ReUp Pass",
  logoText: process.env.LOGO_TEXT ?? process.env.ORGANIZATION_NAME ?? "ReUp",

  // Pass signing materials
  // - PASS_CERT: your Pass Type ID certificate (.pem)
  // - PASS_KEY: private key (.pem) for that certificate
  // - WWDR_CERT: Apple WWDR intermediate cert (.pem)
  //
  // The pkpass bundle needs a PKCS#7 detached signature of manifest.json.
  // (Your doc: signature is detached PKCS #7; manifest values are SHA-1 hashes.)
  signing: {
    passCertPemPath: process.env.PASS_CERT ?? "./secrets/pass-cert.pem",
    passKeyPemPath: process.env.PASS_KEY ?? "./secrets/pass-key.pem",
    wwdrCertPemPath: process.env.WWDR_CERT ?? "./secrets/wwdr.pem"
  },

  // For updates: PassKit requires HTTPS in production; keep that in mind.
  webServiceURL: process.env.WEB_SERVICE_URL ?? "https://example.com/passes",

  // Directory containing brand images (icon.png, logo.png, etc.)
  // Override to point at a different brand's assets.
  assetsDir: process.env.ASSETS_DIR ?? "",

  // Default geofence locations.
  // Apple shows the pass on the lock screen when the user is near one of these.
  // Each entry: { latitude, longitude, relevantText, altitude? (optional) }
  // maxDistance is in meters (Apple default ~100m if omitted).
  // Can be overridden with DEFAULT_LOCATIONS env var (JSON array).
  defaultLocations: parseDefaultLocations(),
};
