import type { AdminState, AuthMode, ScopeLabels } from "./contracts.js";
export type AdminModel = Omit<AdminState, "presentation"> & {
  presentation?: {
    capabilities: readonly { id: string; label?: string; copyKey?: string }[];
    credentialStepLabel: string;
    credentialHtml?: string;
  };
};
export type StudioPage =
  | { kind: "admin"; state: AdminModel }
  | {
      kind: "auth";
      mode: AuthMode;
      privateAdmin: boolean;
      scopeLabels: ScopeLabels;
    };
