/** Module-owned dependencies shape drafts; this function never persists permissions. */
export function actionDraft(
  current: Record<string, boolean>,
  editable: readonly string[],
  dependencies: Record<string, readonly string[]>,
  value: boolean,
  key?: string,
): Record<string, boolean> {
  const next = { ...current }, allowed = new Set(editable), visited = new Set<string>();
  function enable(name: string) {
    if (visited.has(name) || !allowed.has(name) || !(name in next)) return;
    visited.add(name);
    for (const parent of dependencies[name] ?? []) enable(parent);
    if ((dependencies[name] ?? []).every(parent => next[parent])) next[name] = true;
  }
  for (const name of key ? [key] : editable) {
    if (!allowed.has(name) || !(name in next)) continue;
    if (value) enable(name); else next[name] = false;
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const name of Object.keys(next)) {
      if (next[name] && (dependencies[name] ?? []).some(parent => !next[parent])) {
        next[name] = false; changed = true;
      }
    }
  }
  return next;
}
