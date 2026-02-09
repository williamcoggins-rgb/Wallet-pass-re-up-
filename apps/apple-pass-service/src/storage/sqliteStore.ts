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

export type OperationRecord = {
  id: string;
  type: string;        // "broadcast" | "bulk_geofence" | "bulk_update"
  status: string;      // "pending" | "in_progress" | "completed" | "failed"
  payload: any;
  processedItems: number;
  totalItems: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
};

export type PushRetryEntry = {
  id: number;
  pushToken: string;
  serialNumber: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: number;
  lastError?: string;
  createdAt: number;
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

      -- Track in-flight bulk operations so they can be resumed after a crash.
      CREATE TABLE IF NOT EXISTS operations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        payload TEXT NOT NULL,
        processedItems INTEGER NOT NULL DEFAULT 0,
        totalItems INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        error TEXT
      );

      -- Queue for push notifications that failed and need retry.
      CREATE TABLE IF NOT EXISTS push_retry_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pushToken TEXT NOT NULL,
        serialNumber TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        maxAttempts INTEGER NOT NULL DEFAULT 5,
        nextRetryAt INTEGER NOT NULL,
        lastError TEXT,
        createdAt INTEGER NOT NULL
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

  // ─── OPERATION TRACKING ────────────────────────────────────

  createOperation(op: OperationRecord): void {
    this.db.prepare(`
      INSERT INTO operations (id, type, status, payload, processedItems, totalItems, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(op.id, op.type, op.status, JSON.stringify(op.payload), op.processedItems, op.totalItems, op.createdAt, op.updatedAt);
  }

  updateOperation(id: string, update: Partial<Pick<OperationRecord, "status" | "processedItems" | "error">>): void {
    const sets: string[] = ["updatedAt = ?"];
    const vals: any[] = [Date.now()];

    if (update.status !== undefined) { sets.push("status = ?"); vals.push(update.status); }
    if (update.processedItems !== undefined) { sets.push("processedItems = ?"); vals.push(update.processedItems); }
    if (update.error !== undefined) { sets.push("error = ?"); vals.push(update.error); }

    vals.push(id);
    this.db.prepare(`UPDATE operations SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }

  getOperation(id: string): OperationRecord | undefined {
    const row = this.db.prepare(`SELECT * FROM operations WHERE id = ?`).get(id) as any;
    if (!row) return undefined;
    return { ...row, payload: JSON.parse(row.payload) };
  }

  listOperations(status?: string): OperationRecord[] {
    const query = status
      ? this.db.prepare(`SELECT * FROM operations WHERE status = ? ORDER BY createdAt DESC`).all(status)
      : this.db.prepare(`SELECT * FROM operations ORDER BY createdAt DESC`).all();
    return (query as any[]).map(row => ({ ...row, payload: JSON.parse(row.payload) }));
  }

  deleteOperation(id: string): void {
    this.db.prepare(`DELETE FROM operations WHERE id = ?`).run(id);
  }

  // ─── PUSH RETRY QUEUE ─────────────────────────────────────

  enqueuePushRetry(entry: Omit<PushRetryEntry, "id">): void {
    this.db.prepare(`
      INSERT INTO push_retry_queue (pushToken, serialNumber, attempts, maxAttempts, nextRetryAt, lastError, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(entry.pushToken, entry.serialNumber, entry.attempts, entry.maxAttempts, entry.nextRetryAt, entry.lastError ?? null, entry.createdAt);
  }

  dequeuePushRetries(now: number, limit: number = 50): PushRetryEntry[] {
    return this.db.prepare(`
      SELECT * FROM push_retry_queue
      WHERE nextRetryAt <= ? AND attempts < maxAttempts
      ORDER BY nextRetryAt ASC
      LIMIT ?
    `).all(now, limit) as PushRetryEntry[];
  }

  updatePushRetry(id: number, update: { attempts: number; nextRetryAt: number; lastError?: string }): void {
    this.db.prepare(`
      UPDATE push_retry_queue SET attempts = ?, nextRetryAt = ?, lastError = ? WHERE id = ?
    `).run(update.attempts, update.nextRetryAt, update.lastError ?? null, id);
  }

  removePushRetry(id: number): void {
    this.db.prepare(`DELETE FROM push_retry_queue WHERE id = ?`).run(id);
  }

  countPushRetries(): { pending: number; exhausted: number } {
    const pending = (this.db.prepare(`SELECT COUNT(*) as c FROM push_retry_queue WHERE attempts < maxAttempts`).get() as any).c;
    const exhausted = (this.db.prepare(`SELECT COUNT(*) as c FROM push_retry_queue WHERE attempts >= maxAttempts`).get() as any).c;
    return { pending, exhausted };
  }

  purgeExhaustedRetries(): number {
    const result = this.db.prepare(`DELETE FROM push_retry_queue WHERE attempts >= maxAttempts`).run();
    return result.changes;
  }
}
