export type ToastTone = "success" | "error" | "info";
export class ToastCenter {
  dialogs = $state(0);
  items = $state<Array<{ id: number; key: string; tone: ToastTone }>>([]);
  private sequence = 0;
  push(key: string, tone: ToastTone = "success") {
    if (!key || this.items.some(item=>item.key===key&&item.tone===tone)) return;
    const id = ++this.sequence;
    this.items.push({ id, key, tone });
    if (tone !== "error") setTimeout(() => this.dismiss(id), 5000);
  }
  dismiss(id: number) {
    this.items = this.items.filter((item) => item.id !== id);
  }
}
export interface AppPasswordInput {
  accountId?: string;
  user: string;
  label: string;
  appPassword: string;
}
export interface CredentialOptions {
  accountId?: string;
  mode?: "add" | "rotate";
  accounts?: Array<{
    id: string;
    user: string;
    label: string;
    credentialStored: boolean;
  }>;
  submit?: (input: AppPasswordInput) => Promise<void>;
  onSuccess?: () => Promise<void> | void;
}
export class DialogCenter {
  credential = $state<
    | {
        kind: "app-password" | "apple-account";
        options: CredentialOptions;
        generation: number;
      }
    | undefined
  >();
  private sequence = 0;
  openCredential(
    kind: "app-password" | "apple-account",
    options: CredentialOptions = {},
  ) {
    this.credential = { kind, options, generation: ++this.sequence };
  }
  closeCredential(generation?: number) {
    if (generation === undefined || this.credential?.generation === generation)
      this.credential = undefined;
  }
}
export interface LocaleControl {
  current: "en" | "zh-TW";
  set(value: "en" | "zh-TW"): void;
}
