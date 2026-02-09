export const config = {
  port: Number(process.env.PORT ?? 8080),

  // Apple Pass identifiers (must match your Apple portal + cert)
  passTypeIdentifier: process.env.PASS_TYPE_IDENTIFIER ?? "pass.com.reup.barbershop",
  teamIdentifier: process.env.TEAM_IDENTIFIER ?? "TEAMID1234",
  organizationName: process.env.ORGANIZATION_NAME ?? "ReUp Barbershop",
  description: process.env.PASS_DESCRIPTION ?? "ReUp Barbershop Loyalty Pass",

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

  // Default geofence locations.
  // Apple shows the pass on the lock screen when the user is near one of these.
  // Each entry: { latitude, longitude, relevantText, altitude? (optional) }
  // maxDistance is in meters (Apple default ~100m if omitted).
  defaultLocations: [
    {
      latitude: 40.7128,
      longitude: -74.0060,
      relevantText: "You're near ReUp Barbershop! Walk in for a fresh cut.",
    },
  ],
};
