/** Keep vertical history scrolling and leftward gestures independent of dismissal. */
export function toastDrag(dx: number, dy: number) {
  const cancelled = Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx);
  return { cancelled, offset: cancelled ? 0 : Math.max(0, dx) };
}
export function toastDismissed(offset: number) {
  return offset >= 64;
}
