import { test, expect } from "bun:test";
import { svelteServerPlugin } from "../../build/svelte-plugin.js";
// Exercise the actual rune module rather than a second implementation of the queue.
const result = await Bun.build({
  entrypoints: [import.meta.dir + "/ui-state.svelte.ts"],
  target: "bun",
  plugins: [svelteServerPlugin],
});
if (!result.success) throw new AggregateError(result.logs);
const { ToastCenter } = await import(
  "data:text/javascript;base64," +
    Buffer.from(await result.outputs[0].text()).toString("base64")
);
test("each identical notification is retained and dismissing one preserves the other events", () => {
  const center = new ToastCenter();
  center.push("saved");
  center.push("saved");
  center.push("failed", "error");
  expect(center.items.map((item: { key: string }) => item.key)).toEqual([
    "saved",
    "saved",
    "failed",
  ]);
  const ids = center.items.map((item: { id: number }) => item.id);
  expect(new Set(ids).size).toBe(3);
  center.dismiss(ids[1]);
  expect(center.items.map((item: { id: number }) => item.id)).toEqual([
    ids[0],
    ids[2],
  ]);
  center.push("saved");
  expect(center.items.at(-1).id).toBeGreaterThan(ids[2]);
});
