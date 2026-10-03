import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('L10: dummy state survives Bun restart, SIGTERM stops listener', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'icloud-runtime-fixture-'));
  const state = join(dir, 'counter.json');
  let child: ReturnType<typeof Bun.spawn> | undefined;
  async function start(marker: string) {
    child = Bun.spawn([process.execPath, join(import.meta.dir, 'dummy-worker.ts'), state, marker], { stdout: 'pipe', stderr: 'pipe', env: {} });
    const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
    const chunk = await reader.read(); reader.releaseLock();
    if (!chunk.value) throw Error('Child failed to publish loopback URL');
    return new TextDecoder().decode(chunk.value).trim();
  }
  async function stop(url: string, marker: string) {
    child!.kill('SIGTERM');
    expect(await child!.exited).toBe(0);
    expect(await Bun.file(marker).text()).toBe('SIGTERM-clean');
    await expect(fetch(url)).rejects.toThrow();
    child = undefined;
  }
  try {
    const firstMarker = join(dir, 'first-stop');
    const first = await start(firstMarker);
    expect((await (await fetch(first)).json()).counter).toBe(0);
    expect((await (await fetch(first, { method: 'POST' })).json()).counter).toBe(1);
    await stop(first, firstMarker);
    const secondMarker = join(dir, 'second-stop');
    const second = await start(secondMarker);
    expect((await (await fetch(second)).json()).counter).toBe(1);
    await stop(second, secondMarker);
  } finally {
    if (child) { child.kill('SIGKILL'); await child.exited; }
    await rm(dir, { recursive: true, force: true });
  }
  expect(await Bun.file(state).exists()).toBe(false);
}, 10000);
