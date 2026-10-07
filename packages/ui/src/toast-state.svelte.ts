export type ToastTone = "success" | "error" | "info";
export class ToastCenter {
  dialogs = $state(0);
  items = $state<Array<{ id: number; key: string; tone: ToastTone }>>([]);
  private sequence = 0;
  push(key: string, tone: ToastTone = "success") {
    if (!key) return;
    const id = ++this.sequence;
    this.items.push({ id, key, tone });
    // Each event owns a persistent message; only that message is dismissed.
  }
  dismiss(id: number) {
    this.items = this.items.filter((item) => item.id !== id);
  }
}
