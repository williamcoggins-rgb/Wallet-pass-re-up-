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

export class MemoryStore {
  private devices = new Map<string, Device>();
  private passes = new Map<string, PassRecord>();
  private registrations = new Map<string, Set<string>>(); // deviceLibraryIdentifier -> set(passKeyString)

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
}
