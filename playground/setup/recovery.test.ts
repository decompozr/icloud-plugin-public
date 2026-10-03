import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { SetupStore } from './store';
import { RecoveryGate } from './recovery';

test('external marker blocks deleted DB; offline one-use proof restores existing owner only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'icloud-recovery-experiment-'));
  const path = join(dir, 'app.sqlite'), marker = join(dir, 'external-install.sqlite');
  const key = randomBytes(32), bootstrap = randomBytes(32).toString('hex'), recovery = randomBytes(32).toString('hex');
  try {
    const initial = new SetupStore(path, key);
    initial.initialize(bootstrap); initial.enroll(bootstrap, 'original-owner', 'dummy-recovery-secret', () => true); initial.close();
    const backup = readFileSync(path);
    RecoveryGate.provision(marker, backup, recovery);
    const gate = new RecoveryGate(marker);
    try {
      gate.checkStartup(path); rmSync(path);
      expect(() => gate.checkStartup(path)).toThrow('Recovery required');
      expect(existsSync(path)).toBe(false);
      expect(() => gate.recover(path, backup, 'wrong')).toThrow('Recovery rejected');
      const changed = Buffer.from(backup); changed[0] ^= 1;
      expect(() => gate.recover(path, changed, recovery)).toThrow('Recovery rejected');
      expect(existsSync(path)).toBe(false);
      gate.recover(path, backup, recovery); gate.checkStartup(path);
      const restored = new SetupStore(path, key);
      try {
        expect(restored.owner()).toBe('original-owner');
        expect(restored.read()).toBe('dummy-recovery-secret');
        expect(() => restored.enroll(bootstrap, 'attacker', 'dummy', () => true)).toThrow('Bootstrap unavailable');
      } finally { restored.close(); }
    } finally { gate.close(); }
    rmSync(path);
    const restarted = new RecoveryGate(marker);
    try { expect(() => restarted.recover(path, backup, recovery)).toThrow('Recovery rejected'); }
    finally { restarted.close(); }
    rmSync(marker);
    expect(() => new RecoveryGate(marker)).toThrow();
    expect(existsSync(marker)).toBe(false);
  } finally { rmSync(dir, { recursive: true }); }
});
