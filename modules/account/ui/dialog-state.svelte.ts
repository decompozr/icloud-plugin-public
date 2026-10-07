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
