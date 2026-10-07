import { test, expect } from "bun:test";
import { toastDrag, toastDismissed, toastDragCommitted } from "../../../../packages/ui/src/toast-gesture.js";
test("right swipe dismisses while left swipe and vertical history scrolling do not", () => {
  expect(toastDismissed(toastDrag(80, 5).offset)).toBe(true);
  expect(toastDismissed(toastDrag(-100, 0).offset)).toBe(false);
  expect(toastDrag(70, 100)).toEqual({ cancelled: true, offset: 0 });
  expect(toastDismissed(toastDrag(63, 0).offset)).toBe(false);
  expect(toastDismissed(toastDrag(64, 0).offset)).toBe(true);
});
test("mouse swipes commit at the dismissal threshold without requiring an in-window release", () => {
  expect(toastDragCommitted(toastDrag(63, 0).offset, "mouse")).toBe(false);
  expect(toastDragCommitted(toastDrag(64, 0).offset, "mouse")).toBe(true);
  expect(toastDragCommitted(toastDrag(160, 8).offset, "mouse")).toBe(true);
  expect(toastDragCommitted(toastDrag(-160, 0).offset, "mouse")).toBe(false);
  expect(toastDragCommitted(toastDrag(70, 100).offset, "mouse")).toBe(false);
});
test("touch and pen swipes still wait for release rather than committing while moving", () => {
  for (const pointer of ["touch", "pen"]) {
    expect(toastDragCommitted(160, pointer)).toBe(false);
    expect(toastDismissed(160)).toBe(true);
  }
});
