/** Presentation-only contracts. No credentials, grants, stores or provider clients. */
export type {UiCopy,AuthMode,ScopeLabels} from '@decompozr/ui/contracts';
export interface AdminPresentation {
  capabilities: readonly { id: string; label?: string; copyKey?: string }[];
  credentialStepLabel: string;
  /** Trusted module-owned markup, never request/user-provided HTML. */
  credentialSection(admin: boolean): string;
}
export interface AdminState {
  resetAvailable?: boolean;
  enrolled: boolean;
  ready: boolean;
  admin: boolean;
  localOwner?: boolean;
  connectionCommands?: readonly string[];
  view?: "overview" | "accounts" | "connections" | "system" | "setup" | "module";
  modulePath?:string;
  mode?: "account";
  publicMcpUrl?: string;
  pluginDownload?: boolean;
  homekitConfigured?: boolean;
  photosConfigured?: boolean;
  photosCloudConfigured?: boolean;
  presentation?: AdminPresentation;
  modules?: readonly {
    id: string;
    title: string;
    fields: readonly { id: string; label: string; available?: boolean }[];
  }[];
}
