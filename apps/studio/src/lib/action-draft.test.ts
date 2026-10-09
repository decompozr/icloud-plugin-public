import { expect, test } from 'bun:test';
import { actionDraft } from './action-draft.js';
test('draft switches include required parents and disabling cascades without mutating saved policy', () => {
  const saved = { read: false, write: false, delete: false };
  const deps = { write: ['read'], delete: ['read', 'write'] };
  const proposed = actionDraft(saved, Object.keys(saved), deps, true, 'delete');
  expect(proposed).toEqual({ read: true, write: true, delete: true });
  expect(saved).toEqual({ read: false, write: false, delete: false });
  expect(actionDraft(proposed, Object.keys(saved), deps, false, 'write')).toEqual({ read: true, write: false, delete: false });
  expect(actionDraft(proposed, Object.keys(saved), deps, false, 'read')).toEqual(saved);
});
test('all excludes unavailable operations and cannot activate a child with an unavailable prerequisite', () => {
  const saved = { read: false, control: false, scenes: false };
  const deps = { control: ['read'], scenes: ['read', 'control'] };
  expect(actionDraft(saved, ['read'], deps, true)).toEqual({ read: true, control: false, scenes: false });
  expect(actionDraft(saved, ['read', 'scenes'], deps, true, 'scenes')).toEqual({ read: true, control: false, scenes: false });
});
