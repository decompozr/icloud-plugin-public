export type SetupTask = 'refresh' | 'network' | 'account' | 'capabilities' | 'client' | 'review';

/** Observed local prerequisites only; registration never implies client acceptance. */
export function nextSetupTask(input: {
  fresh: boolean;
  networkReady: boolean | null;
  credentialStored: boolean | null;
  capabilitiesEnabled: boolean | null;
  clientCount: number | null;
}): SetupTask {
  if (!input.fresh || input.networkReady === null) return 'refresh';
  if (!input.networkReady) return 'network';
  if (input.credentialStored === null) return 'refresh';
  if (!input.credentialStored) return 'account';
  if (input.capabilitiesEnabled === null) return 'refresh';
  if (!input.capabilitiesEnabled) return 'capabilities';
  if (input.clientCount === null) return 'refresh';
  return input.clientCount === 0 ? 'client' : 'review';
}
