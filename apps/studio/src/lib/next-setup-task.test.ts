import { expect, test } from 'bun:test';
import { nextSetupTask } from './next-setup-task.js';

test('next task preserves unknown/stale evidence and orders actionable prerequisites', () => {
  const observed = { fresh: true, networkReady: true, credentialStored: true, capabilitiesEnabled: true, clientCount: 1 };
  expect(nextSetupTask({ ...observed, fresh: false })).toBe('refresh');
  expect(nextSetupTask({ ...observed, networkReady: null })).toBe('refresh');
  expect(nextSetupTask({ ...observed, networkReady: false, credentialStored: false })).toBe('network');
  expect(nextSetupTask({ ...observed, credentialStored: null })).toBe('refresh');
  expect(nextSetupTask({ ...observed, credentialStored: false })).toBe('account');
  expect(nextSetupTask({ ...observed, capabilitiesEnabled: null })).toBe('refresh');
  expect(nextSetupTask({ ...observed, capabilitiesEnabled: false })).toBe('capabilities');
  expect(nextSetupTask({ ...observed, clientCount: null })).toBe('refresh');
  expect(nextSetupTask({ ...observed, clientCount: 0 })).toBe('client');
  expect(nextSetupTask(observed)).toBe('review');
});
