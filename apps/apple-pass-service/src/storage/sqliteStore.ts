//
// SQLite-backed persistent store.
// Same interface as MemoryStore, but data survives server restarts.
// Uses better-sqlite3 for synchronous, fast, embedded SQLite.
//
import Database from "better-sqlite3";
import path from "node:path";

export type Device = { deviceLibraryIdentifier: string; pushToken: string };
export type PassKey = { passTypeIdentifier: string; serialNumber: string };
export type PassRecord = PassKey & {
  authenticationToken: string;
  updatedAt: number;
  passJson: any;
};

export class SqliteStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? path.resolve(process.cwd(), "data", "passes.db");
    // Ensure the data directory exists.
    const dir = path.dirname(resolvedPath);
    const fs = require("node:fs");
    fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL"); // Better performance for concurrent reads.
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        deviceLibraryIdentifier TEXT PRIMARY KEY,
        pushToken TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS passes (
        passTypeIdentifier TEXT NOT NULL,
        serialNumber TEXT NOT NULL,
        authenticationToken TEXT NOT NULL,
        updatedAt INTEGER NOT NULL,
        passJson TEXT NOT NULL,
        PRIMARY KEY (passTypeIdentifier, serialNumber)
      );

      CREATE TABLE IF NOT EXISTS registrations (
        deviceLibraryIdentifier TEXT NOT NULL,
        passTypeIdentifier TEXT NOT NULL,
        serialNumber TEXT NOT NULL,
        PRIMARY KEY (deviceLibraryIdentifier, passTypeIdentifier, serialNumber),
        FOREIGN KEY (deviceLibraryIdentifier) REFERENCES devices(deviceLibraryIdentifier),
        FOREIGN KEY (passTypeIdentifier, serialNumber) REFERENCES passes(passTypeIdentifier, serialNumber)
      );
    `);
  }

  passKeyString(k: PassKey) {
    return `${k.passTypeIdentifier}::${k.serialNumber}`;
  }

  upsertDevice(d: Device) {
    this.db.prepare(`
      INSERT INTO devices (deviceLibraryIdentifier, pushToken)
      VALUES (?, ?)
      ON CONFLICT(deviceLibraryIdentifier) DO UPDATE SET pushToken = excluded.pushToken
    `).run(d.deviceLibraryIdentifier, d.pushToken);
  }

  upsertPass(p: PassRecord) {
    this.db.prepare(`
      INSERT INTO passes (passTypeIdentifier, serialNumber, authenticationToken, updatedAt, passJson)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(passTypeIdentifier, serialNumber) DO UPDATE SET
        authenticationToken = excluded.authenticationToken,
        updatedAt = excluded.updatedAt,
        passJson = excluded.passJson
    `).run(p.passTypeIdentifier, p.serialNumber, p.authenticationToken, p.updatedAt, JSON.stringify(p.passJson));
  }

  getPass(k: PassKey): PassRecord | undefined {
    const row = this.db.prepare(`
      SELECT * FROM passes WHERE passTypeIdentifier = ? AND serialNumber = ?
    `).get(k.passTypeIdentifier, k.serialNumber) as any;

    if (!row) return undefined;
    return {
      passTypeIdentifier: row.passTypeIdentifier,
      serialNumber: row.serialNumber,
      authenticationToken: row.authenticationToken,
      updatedAt: row.updatedAt,
      passJson: JSON.parse(row.passJson),
    };
  }

  register(deviceLibraryIdentifier: string, passKey: PassKey) {
    this.db.prepare(`
      INSERT OR IGNORE INTO registrations (deviceLibraryIdentifier, passTypeIdentifier, serialNumber)
      VALUES (?, ?, ?)
    `).run(deviceLibraryIdentifier, passKey.passTypeIdentifier, passKey.serialNumber);
  }

  unregister(deviceLibraryIdentifier: string, passKey: PassKey) {
    this.db.prepare(`
      DELETE FROM registrations
      WHERE deviceLibraryIdentifier = ? AND passTypeIdentifier = ? AND serialNumber = ?
    `).run(deviceLibraryIdentifier, passKey.passTypeIdentifier, passKey.serialNumber);
  }

  listUpdatedSerials(deviceLibraryIdentifier: string, since: number): string[] {
    const rows = this.db.prepare(`
      SELECT p.serialNumber
      FROM registrations r
      JOIN passes p ON r.passTypeIdentifier = p.passTypeIdentifier AND r.serialNumber = p.serialNumber
      WHERE r.deviceLibraryIdentifier = ? AND p.updatedAt > ?
    `).all(deviceLibraryIdentifier, since) as any[];

    return rows.map(r => r.serialNumber);
  }

  listAllPasses(): PassRecord[] {
    const rows = this.db.prepare(`SELECT * FROM passes`).all() as any[];
    return rows.map(row => ({
      passTypeIdentifier: row.passTypeIdentifier,
      serialNumber: row.serialNumber,
      authenticationToken: row.authenticationToken,
      updatedAt: row.updatedAt,
      passJson: JSON.parse(row.passJson),
    }));
  }

  getPushTokensForPass(passKey: PassKey): string[] {
    const rows = this.db.prepare(`
      SELECT d.pushToken
      FROM registrations r
      JOIN devices d ON r.deviceLibraryIdentifier = d.deviceLibraryIdentifier
      WHERE r.passTypeIdentifier = ? AND r.serialNumber = ?
    `).all(passKey.passTypeIdentifier, passKey.serialNumber) as any[];

    return rows.map(r => r.pushToken);
  }
}
