/** Keep vertical history scrolling and leftward gestures independent of dismissal. */
export function toastDrag(dx: number, dy: number) {
  const cancelled = Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx);
  return { cancelled, offset: cancelled ? 0 : Math.max(0, dx) };
}
export function toastDismissed(offset: number) {
  return offset >= 64;
}
/** Mouse dismissal commits before release so leaving the window cannot strand it. */
export function toastDragCommitted(offset: number, pointerType: string) {
  return pointerType === "mouse" && toastDismissed(offset);
}
