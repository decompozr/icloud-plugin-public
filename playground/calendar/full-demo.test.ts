import {test, expect} from 'bun:test';
import {runFullDemo} from './full-demo';

test('composes calendar lifecycle, conditional recurring event CRUD, sync and local collaboration artifacts', async () => {
  const result = await runFullDemo();
  expect(result.calendarLifecycle).toBe('created-renamed-deleted');
  expect(result.eventLifecycle).toBe('created-updated-deleted');
  expect(result.recurrence.remainingOccurrences).toBe(2);
  expect(result.staleWriteRejected).toBe(true);
  expect(result.nonemptyDeletionRejected).toBe(true);
  expect(result.sync).toBe('initial-change-tombstone');
  expect(result.externalMessagesSent).toBe(0);
  expect(result.liveICloudVerified).toBe(false);
});
