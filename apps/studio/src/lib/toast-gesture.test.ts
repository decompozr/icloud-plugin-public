import { test, expect } from "bun:test";
import { toastDrag, toastDismissed } from "./toast-gesture.js";
test("right swipe dismisses while left swipe and vertical history scrolling do not", () => {
  expect(toastDismissed(toastDrag(80, 5).offset)).toBe(true);
  expect(toastDismissed(toastDrag(-100, 0).offset)).toBe(false);
  expect(toastDrag(70, 100)).toEqual({ cancelled: true, offset: 0 });
  expect(toastDismissed(toastDrag(63, 0).offset)).toBe(false);
  expect(toastDismissed(toastDrag(64, 0).offset)).toBe(true);
});
