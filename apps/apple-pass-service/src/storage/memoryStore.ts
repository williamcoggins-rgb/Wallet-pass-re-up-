//
// Minimal persistence: devices, passes, registrations.
// Matches the conceptual "devices/passes/registrations" model in your PassKit PG.
//
export type Device = { deviceLibraryIdentifier: string; pushToken: string };
export type PassKey = { passTypeIdentifier: string; serialNumber: string };
export type PassRecord = PassKey & {
  authenticationToken: string;
  updatedAt: number;          // update tag (timestamp)
  passJson: any;              // stored pass data used to re-render pass.json
};

export type OperationRecord = {
  id: string;
  type: string;
  status: string;
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

export class MemoryStore {
  private devices = new Map<string, Device>();
  private passes = new Map<string, PassRecord>();
  private registrations = new Map<string, Set<string>>(); // deviceLibraryIdentifier -> set(passKeyString)
  private operations = new Map<string, OperationRecord>();
  private pushRetryQueue: PushRetryEntry[] = [];
  private nextRetryId = 1;

  passKeyString(k: PassKey) {
    return `${k.passTypeIdentifier}::${k.serialNumber}`;
  }

  upsertDevice(d: Device) {
    this.devices.set(d.deviceLibraryIdentifier, d);
  }

  upsertPass(p: PassRecord) {
    this.passes.set(this.passKeyString(p), p);
  }

  getPass(k: PassKey): PassRecord | undefined {
    return this.passes.get(this.passKeyString(k));
  }

  register(deviceLibraryIdentifier: string, passKey: PassKey) {
    const key = this.passKeyString(passKey);
    const set = this.registrations.get(deviceLibraryIdentifier) ?? new Set<string>();
    set.add(key);
    this.registrations.set(deviceLibraryIdentifier, set);
  }

  unregister(deviceLibraryIdentifier: string, passKey: PassKey) {
    const key = this.passKeyString(passKey);
    const set = this.registrations.get(deviceLibraryIdentifier);
    if (!set) return;
    set.delete(key);
  }

  listUpdatedSerials(deviceLibraryIdentifier: string, since: number): string[] {
    const set = this.registrations.get(deviceLibraryIdentifier);
    if (!set) return [];
    const serials: string[] = [];
    for (const passKeyStr of set) {
      const pass = this.passes.get(passKeyStr);
      if (pass && pass.updatedAt > since) serials.push(pass.serialNumber);
    }
    return serials;
  }

  // List all stored passes (for admin/bulk operations).
  listAllPasses(): PassRecord[] {
    return Array.from(this.passes.values());
  }

  // Get push tokens for all devices registered to a specific pass.
  getPushTokensForPass(passKey: PassKey): string[] {
    const key = this.passKeyString(passKey);
    const tokens: string[] = [];
    for (const [deviceId, passKeys] of this.registrations) {
      if (passKeys.has(key)) {
        const device = this.devices.get(deviceId);
        if (device) tokens.push(device.pushToken);
      }
    }
    return tokens;
  }

  // ─── OPERATION TRACKING ────────────────────────────────────

  createOperation(op: OperationRecord): void {
    this.operations.set(op.id, { ...op });
  }

  updateOperation(id: string, update: Partial<Pick<OperationRecord, "status" | "processedItems" | "error">>): void {
    const op = this.operations.get(id);
    if (!op) return;
    if (update.status !== undefined) op.status = update.status;
    if (update.processedItems !== undefined) op.processedItems = update.processedItems;
    if (update.error !== undefined) op.error = update.error;
    op.updatedAt = Date.now();
  }

  getOperation(id: string): OperationRecord | undefined {
    const op = this.operations.get(id);
    return op ? { ...op } : undefined;
  }

  listOperations(status?: string): OperationRecord[] {
    const all = Array.from(this.operations.values());
    const filtered = status ? all.filter(o => o.status === status) : all;
    return filtered.sort((a, b) => b.createdAt - a.createdAt);
  }

  deleteOperation(id: string): void {
    this.operations.delete(id);
  }

  // ─── PUSH RETRY QUEUE ─────────────────────────────────────

  enqueuePushRetry(entry: Omit<PushRetryEntry, "id">): void {
    this.pushRetryQueue.push({ ...entry, id: this.nextRetryId++ });
  }

  dequeuePushRetries(now: number, limit: number = 50): PushRetryEntry[] {
    return this.pushRetryQueue
      .filter(e => e.nextRetryAt <= now && e.attempts < e.maxAttempts)
      .sort((a, b) => a.nextRetryAt - b.nextRetryAt)
      .slice(0, limit);
  }

  updatePushRetry(id: number, update: { attempts: number; nextRetryAt: number; lastError?: string }): void {
    const entry = this.pushRetryQueue.find(e => e.id === id);
    if (!entry) return;
    entry.attempts = update.attempts;
    entry.nextRetryAt = update.nextRetryAt;
    if (update.lastError !== undefined) entry.lastError = update.lastError;
  }

  removePushRetry(id: number): void {
    this.pushRetryQueue = this.pushRetryQueue.filter(e => e.id !== id);
  }

  countPushRetries(): { pending: number; exhausted: number } {
    const pending = this.pushRetryQueue.filter(e => e.attempts < e.maxAttempts).length;
    const exhausted = this.pushRetryQueue.filter(e => e.attempts >= e.maxAttempts).length;
    return { pending, exhausted };
  }

  purgeExhaustedRetries(): number {
    const before = this.pushRetryQueue.length;
    this.pushRetryQueue = this.pushRetryQueue.filter(e => e.attempts < e.maxAttempts);
    return before - this.pushRetryQueue.length;
  }
}
