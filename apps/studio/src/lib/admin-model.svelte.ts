import { z } from "zod";
import type { AdminState, UiCopy } from "../contracts.js";
import { statusSchema, dashboardSchema, systemSchema } from "./admin-data.js";
import {
  clientPreviewSchema,
  matchingEvidence,
  readiness,
  readinessServices,
  observedProviderRead,
  type RecoveryClient,
  type AuthorizedConnection,
  type ClientImpact,
} from "@decompozr/contracts";
import { registerOwner } from "@decompozr/account/ui/auth-protocol.js";
import type { ToastCenter } from "./ui-state.svelte.js";
import { connectionNeedsReview } from "./connection-warnings.js";
import { createConnectionsService } from "./connections-service.js";
class UiError extends Error {
  constructor(readonly key: string) {
    super(key);
  }
}
const errors: Record<string, string> = {
  CONFIGURED_CAPABILITY_DISABLED: "photosCapabilityUnavailable",
  CREDENTIAL_REQUIRED: "requirementsMissing",
  PHOTOS_PERMISSIONS_REQUIRED: "requirementsMissing",
  CONFIRMATION_REQUIRED: "moduleConfirm",
  PROVIDER_VALIDATION_FAILED: "providerError",
  PREREQUISITES_REQUIRED: "prerequisiteError",
  ENROLLMENT_CLOSED: "closedError",
  OWNER_REQUIRED: "ownerError",
  ORIGIN_DENIED: "originError",
  INVALID_INPUT: "inputError",
  IMPACT_CHANGED: "connectionReviewAgain",
  IMPACT_CONFIRMATION_REQUIRED: "connectionReviewAgain",
  REGISTRATION_UPGRADE_UNAVAILABLE: "connectionReviewAgain",
  NO_NEW_CAPABILITIES: "connectionReviewAgain",
  CLIENT_MANAGEMENT_FAILED: "connectionReviewAgain",
  ACCOUNT_EXISTS: "accountExists",
  CREDENTIAL_STATE_CHANGED: "credentialChanged",
  SETUP_AUTHORIZATION_REQUIRED: "sessionExpired",
};
export {scopeCopy} from './bundled-modules.js';
export class AdminModel {
  busy = $state(false);
  systemLoading = $state(true);
  accountsLoading = $state(true);
  clientsLoading = $state(true);
  webSessions = $state<
    Record<string, { phase?: string; dependencyReady?: boolean }>
  >({});
  moduleDialog = $state<string>();
  requirementDialog = $state<
    "tailscale" | "owner" | "photos" | "client" | undefined
  >();

  invalidField = $state("");
  messageKey = $state("");
  error = $state(false);
  currentStep = $state(0);
  status = $state<z.infer<typeof statusSchema>>();
  dashboard = $state<z.infer<typeof dashboardSchema>>();
  system = $state<z.infer<typeof systemSchema>>();
  private readonly connectionsService = createConnectionsService();
  clients = $state<RecoveryClient[]>();
  connections = $state<AuthorizedConnection[]>();
  checkedAt = $state<string>();
  clientsCheckedAt = $state<string>();
  dashboardFailed = $state(false);
  diagnosticsFailed = $state(false);
  systemStale = $state(false);
  draft = $state<Record<string, Record<string, boolean>>>({});
  policyConfirm = $state(false);
  selectedAccount = $state("");
  password = $state("");
  user = $state("");
  label = $state("");
  accountPassword = $state("");
  revokeAccount = $state("");
  pendingConnection = $state<{
    clientId: string;
    action: "revoke" | "remove" | "upgrade";
    confirmation: string;
    impact: ClientImpact;
  }>();
  readinessAccount = $state("");
  readinessClient = $state("");
  remoteLink = $state("");
  polls = 0;
  now = $state(Date.now());
  ownerMode = false;
  proofAvailable = false;
  constructor(
    readonly state: AdminState,
    readonly copy: UiCopy,
    readonly toast?: ToastCenter,
  ) {}
  activeView = $state<AdminState["view"]>();
  get view() {
    return (
      this.activeView ??
      this.state.view ??
      (this.state.admin ? "accounts" : "setup")
    );
  }
  get saved(): Record<string, Record<string, boolean> | undefined> {
    return {
      mail: this.dashboard?.capabilities ?? undefined,
      ...this.dashboard?.modules,
    };
  }
  get changes() {
    return Object.entries(this.draft).flatMap(([service, policy]) => {
      const saved = this.saved[service];
      if (
        !saved ||
        !Object.entries(policy).some(([key, value]) => value !== saved[key])
      )
        return [];
      return [
        {
          path:
            service === "mail"
              ? "/icloud/admin/capabilities"
              : `/icloud/admin/modules/${service}/capabilities`,
          policy: { ...policy },
          enables: Object.entries(policy).some(
            ([key, value]) => value && !saved[key],
          ),
        },
      ];
    });
  }
  get hasDraft() {
    return !!(
      this.changes.length ||
      this.password ||
      this.user ||
      this.label ||
      this.accountPassword
    );
  }
  get canRegister() {
    return !!(
      this.status?.ready &&
      (this.status.bootstrapAuthorized ||
        this.status.passkeyRegistered ||
        (this.ownerMode && this.proofAvailable))
    );
  }
  get canContinue() {
    return !!(
      this.status?.ready &&
      (!this.status.enrolled ||
        Object.values(this.status.prerequisites).every(Boolean))
    );
  }
  message(key: string, error = false) {
    this.messageKey = key;
    this.error = error;
    if (key) this.toast?.push(key, error ? "error" : "success");
  }
  async run(action: () => Promise<void>, loading = "connectionLoading") {
    if (this.busy) return;
    this.busy = true;
    this.messageKey = "";
    this.error = false;
    try {
      await action();
    } catch (e) {
      this.message(e instanceof UiError ? e.key : "retry", true);
    } finally {
      this.busy = false;
    }
  }
  async get(path: string) {
    const r = await fetch(path, {
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new UiError("statusError");
    return r.json();
  }
  async post(path: string, body: unknown) {
    let r: Response;
    try {
      r = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      throw new UiError("networkError");
    }
    if (!r.ok) {
      const value = await r.json().catch(() => null),
        code = typeof value?.error === "string" ? value.error : "";
      if (code === "PROVIDER_VALIDATION_FAILED")
        this.invalidField = path.endsWith("/add")
          ? "account-password"
          : "password";
      if (code === "SETUP_AUTHORIZATION_REQUIRED" && !this.state.admin)
        this.step(1);
      throw new UiError(errors[code] ?? "actionError");
    }
    return r.json();
  }
  step(value: number) {
    this.currentStep = value;
    this.message("");
    queueMicrotask(() =>
      document.querySelector<HTMLElement>(`[data-step="${value}"] h2`)?.focus(),
    );
  }
  async check() {
    this.status = statusSchema.parse(
      await this.get(
        "/icloud/setup/status" +
          (location.search.includes("mode=") ? location.search : ""),
      ),
    );
    this.messageKey = "";
  }
  acceptDashboard(value: unknown) {
    const next = dashboardSchema.parse(value);
    const reset = !this.hasDraft;
    this.dashboard = next;
    this.checkedAt = new Date().toISOString();
    this.dashboardFailed = false;
    if (reset) this.discardPolicy();
    if (!next.accounts.some((a) => a.id === this.selectedAccount))
      this.selectedAccount = next.accounts[0]?.id ?? "";
    if (!next.accounts.some((a) => a.id === this.readinessAccount))
      this.readinessAccount =
        next.accounts.length === 1 ? next.accounts[0]!.id : "";
  }
  async refreshDashboard() {
    this.accountsLoading = true;
    try {
      this.acceptDashboard(await this.get("/icloud/admin/status"));
    } catch {
      this.dashboardFailed = true;
    } finally {
      this.accountsLoading = false;
    }
  }
  connectionNeedsReview(connection: AuthorizedConnection) {
    return connectionNeedsReview(
      this.clients?.find((client) => client.clientId === connection.clientId),
    );
  }
  get connectionsNeedingReview() {
    return (this.connections ?? []).filter((connection) =>
      this.connectionNeedsReview(connection),
    );
  }
  async refreshClients() {
    this.clientsLoading = true;
    try {
      const value = await this.connectionsService.list();
      this.clients = value.clients;
      this.connections = value.connections;
      this.clientsCheckedAt = new Date().toISOString();
      this.diagnosticsFailed = false;
      if (!this.clients.some((c) => c.clientId === this.readinessClient))
        this.readinessClient =
          this.clients.length === 1 ? this.clients[0]!.clientId : "";
    } catch {
      this.diagnosticsFailed = true;
    } finally {
      this.clientsLoading = false;
    }
  }
  async refreshSystem() {
    this.systemLoading = true;
    try {
      this.system = systemSchema.parse(
        await this.get("/icloud/admin/system-status"),
      );
      this.systemStale = false;
    } catch {
      this.systemStale = true;
    } finally {
      this.systemLoading = false;
    }
  }
  async refreshAll() {
    await Promise.allSettled(
      this.view === "system"
        ? [this.refreshSystem(), this.refreshClients()]
        : [
            this.refreshDashboard(),
            this.refreshClients(),
            ...(this.view === "overview" ? [this.refreshSystem()] : []),
          ],
    );
  }
  discardPolicy() {
    this.draft = Object.fromEntries(
      Object.entries(this.saved)
        .filter(([, v]) => !!v)
        .map(([key, value]) => [key, { ...value }]),
    );
    this.policyConfirm = false;
    this.message("");
  }
  toggle(service: string, key: string, value: boolean) {
    this.draft[service] = { ...this.draft[service], [key]: value };
    this.policyConfirm = false;
    this.message("");
  }
  toggleAll(service: string, value: boolean) {
    this.draft[service] = Object.fromEntries(
      Object.keys(this.draft[service] ?? {}).map((key) => [key, value]),
    );
    this.policyConfirm = false;
    this.message("");
  }
  fieldStatus(service: string, key: string) {
    const saved = this.saved[service],
      value = this.draft[service]?.[key];
    return !saved
      ? "unavailable"
      : value !== saved[key]
        ? value
          ? "draftEnabled"
          : "draftDisabled"
        : value
          ? "enabled"
          : "disabled";
  }
  requestPolicy() {
    const changes = this.changes;
    for (const service of ["calendar", "photos"]) {
      const p = this.draft[service];
      if (!p) continue;
      const invalid =
        service === "calendar"
          ? (p.write && !p.read) ||
            ((p.schedule || p.share) && (!p.read || !p.write))
          : (p.write && !p.read) || (p.delete && !p.write);
      if (invalid) {
        const details = document.querySelector<HTMLDetailsElement>(
          `[data-capability-group="${service}"] details`,
        );
        if (details) details.open = true;
        this.message(
          service === "calendar"
            ? "calendarDependencies"
            : "photosDependencies",
          true,
        );
        return;
      }
    }
    if (changes.some((c) => c.enables)) {
      this.policyConfirm = true;
      queueMicrotask(() =>
        document.getElementById("policy-confirm-yes")?.focus(),
      );
    } else void this.run(() => this.savePolicies(false), "workingPolicy");
  }
  async savePolicies(confirmEnable: boolean) {
    const changes = this.changes;
    this.policyConfirm = false;
    let completed = 0;
    try {
      for (const change of changes) {
        await this.post(change.path, { policy: change.policy, confirmEnable });
        completed++;
      }
      this.discardPolicy();
      await Promise.allSettled([
        this.refreshDashboard(),
        this.refreshClients(),
      ]);
      this.message("policySaved");
      if (this.connectionsNeedingReview.length)
        this.toast?.push("connectionUpdatesAvailable", "info");
    } catch (error) {
      await this.refreshDashboard();
      if (
        completed === 0 &&
        error instanceof UiError &&
        error.key === "photosCapabilityUnavailable"
      )
        throw error;
      throw new UiError(
        this.dashboardFailed ? "policyUnknown" : "policyPartial",
      );
    }
  }
  chooseAccount(id: string) {
    if (id === this.selectedAccount) return;
    if (
      id !== this.selectedAccount &&
      this.password &&
      !window.confirm(this.copy.t("discardNavigation"))
    )
      return;
    this.password = "";
    this.revokeAccount = "";
    this.selectedAccount = id;
  }
  async rotate() {
    const password = this.password;
    this.password = "";
    await this.post("/icloud/admin/credential", {
      accountId: this.selectedAccount,
      appPassword: password,
    });
    await this.refreshDashboard();
    this.message("saved");
  }
  async revoke() {
    if (!this.revokeAccount) return;
    await this.post("/icloud/admin/revoke", { accountId: this.revokeAccount });
    this.revokeAccount = "";
    this.password = "";
    await this.refreshDashboard();
    this.message("revoked");
  }
  async add() {
    const data = {
      user: this.user,
      label: this.label,
      appPassword: this.accountPassword,
    };
    this.accountPassword = "";
    await this.post("/icloud/admin/accounts/add", data);
    this.user = "";
    this.label = "";
    await this.refreshDashboard();
    if (this.state.mode === "account") {
      location.assign("/icloud/admin/accounts");
      return;
    }
    this.step(3);
    this.message("saved");
  }
  async enroll() {
    if (!this.canRegister) throw new UiError("ownerDenied");
    try {
      await registerOwner(this.copy.authT("owner"));
    } catch {
      throw new UiError("passkeyError");
    }
    await this.post("/icloud/setup/complete", {});
    if (this.status) {
      this.status.passkeyRegistered = true;
      this.status.enrolled = true;
    }
    location.assign("/icloud/admin");
  }
  async preview(clientId: string, action: "revoke" | "remove" | "upgrade") {
    const v = clientPreviewSchema.parse(
      await this.get(
        "/icloud/admin/oauth-clients?" +
          new URLSearchParams({ clientId, action }),
      ),
    );
    this.pendingConnection = {
      clientId,
      action,
      confirmation: v.confirmation,
      impact: v.impact,
    };
    queueMicrotask(() =>
      document.getElementById("connection-confirm-yes")?.focus(),
    );
  }
  async confirmConnection() {
    const p = this.pendingConnection;
    if (!p) return;
    this.pendingConnection = undefined;
    try {
      await this.post("/icloud/admin/oauth-clients", {
        clientId: p.clientId,
        action: p.action,
        confirmation: p.confirmation,
        confirm: true,
      });
    } catch (e) {
      await this.refreshClients();
      throw e;
    }
    await Promise.allSettled([this.refreshClients(), this.refreshDashboard()]);
    this.message(
      p.action === "upgrade"
        ? "capabilityUpgradeComplete"
        : "connectionChanged",
    );
  }
  evidence(accountId: string, clientId: string, service: string) {
    if (!this.checkedAt || this.now - Date.parse(this.checkedAt) > 60000)
      return;
    return matchingEvidence(
      this.dashboard?.evidence ?? [],
      accountId,
      clientId,
      service,
      this.now,
    );
  }
  readinessRows() {
    const account = this.dashboard?.accounts.find(
        (a) => a.id === this.readinessAccount,
      ),
      client = this.clients?.find((c) => c.clientId === this.readinessClient);
    return readinessServices(this.dashboard?.modules).map((service) => {
      const s = readiness(
          this.saved[service],
          service,
          account ? client : undefined,
        ),
        e =
          account && client
            ? this.evidence(account.id, client.clientId, service)
            : undefined,
        granted =
          account &&
          client &&
          this.connections?.some(
            (c) =>
              c.accountId === account.id &&
              c.clientId === client.clientId &&
              c.grantedScopes.includes(service + ".read"),
          ),
        read = e ? observedProviderRead(service, e.reads) : undefined;
      return {
        service,
        configured: s.configured,
        authorization: e
          ? this.copy.t("authorizationObserved") +
            " " +
            new Date(e.authorizedAt).toLocaleString()
          : this.copy.t(granted ? "authorized" : s.authorization),
        read: read?.verifiedAt
          ? this.copy.t("readObserved") +
            " " +
            new Date(read.verifiedAt).toLocaleString()
          : read?.listedAt
            ? this.copy.t("calendarListObserved") +
              " " +
              new Date(read.listedAt).toLocaleString()
            : this.copy.t(s.tested),
        guidance: this.diagnosticsFailed
          ? "freshnessFailed"
          : account && !account.credentialStored
            ? "readinessCredentialMissing"
            : e
              ? "observedHelp"
              : granted
                ? "readyForRead"
                : s.recovery,
      };
    });
  }
  async refreshSessions() {
    if (!this.state.photosCloudConfigured || !this.dashboard) return;
    await Promise.allSettled(
      this.dashboard.accounts.map(async (account) => {
        try {
          this.webSessions[account.id] = await this.get(
            "/icloud/admin/photos/cloud/status?accountId=" +
              encodeURIComponent(account.id),
          );
        } catch {
          this.webSessions[account.id] = {};
        }
      }),
    );
  }
  async refreshCard(kind: "service" | "accounts" | "capabilities" | "all") {
    if (kind === "service") await this.refreshSystem();
    else if (kind === "accounts") {
      await Promise.allSettled([
        this.refreshDashboard(),
        this.refreshClients(),
      ]);
      await this.refreshSessions();
    } else if (kind === "capabilities")
      await Promise.allSettled([
        this.refreshDashboard(),
        this.refreshClients(),
      ]);
    else {
      await this.refreshAll();
      await this.refreshSessions();
    }
    if (
      (kind === "service" && this.systemStale) ||
      (kind === "accounts" &&
        (this.dashboardFailed || this.diagnosticsFailed)) ||
      (kind === "capabilities" && this.dashboardFailed) ||
      (kind === "all" &&
        (this.dashboardFailed || this.diagnosticsFailed || this.systemStale))
    )
      this.message("statusError", true);
    else this.message("refreshed");
  }
  start() {
    this.ownerMode = ["local-owner", "remote-owner"].includes(
      new URLSearchParams(location.search).get("mode") ?? "",
    );
    this.proofAvailable = new URLSearchParams(location.hash.slice(1)).has(
      "owner-proof",
    );
    void this.run(async () => {
      if (this.state.admin) {
        await this.refreshAll();
        await this.refreshSessions();
      } else {
        await this.check();
        if (this.ownerMode) this.step(1);
        else if (this.status?.enrolled) {
          await this.refreshDashboard();
          if (this.state.mode === "account") this.step(2);
          else if (Object.values(this.status.prerequisites).every(Boolean))
            this.step(3);
        } else if (this.status?.ready) this.step(1);
      }
    });
    const credentialsChanged = () => {
      void this.refreshDashboard().then(() => this.refreshSessions());
    };
    window.addEventListener("studio:credentials-updated", credentialsChanged);
    const poll = setInterval(() => {
      this.now = Date.now();
      if (this.busy || document.hidden || this.hasDraft || this.polls >= 10)
        return;
      this.polls++;
      if (this.state.admin) void this.refreshAll();
      else if (this.status && !this.status.ready)
        void this.check().catch(() => this.message("checkError", true));
    }, 30000);
    const leave = (e: BeforeUnloadEvent) => {
      if (this.hasDraft) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0)
        return;
      const a = e.target instanceof Element ? e.target.closest("a") : null;
      if (
        !a ||
        !this.hasDraft ||
        a.hash ||
        a.target === "_blank" ||
        a.hasAttribute("download")
      )
        return;
      if (!window.confirm(this.copy.t("discardNavigation"))) e.preventDefault();
      else {
        this.password = "";
        this.user = "";
        this.label = "";
        this.accountPassword = "";
        this.discardPolicy();
      }
    };
    const hide = () => {
      this.password = "";
      this.accountPassword = "";
    };
    const show = (e: PageTransitionEvent) => {
      hide();
      if (e.persisted && this.state.admin && !this.hasDraft)
        void this.run(() => this.refreshAll());
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("click", click);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    return () => {
      clearInterval(poll);
      window.removeEventListener(
        "studio:credentials-updated",
        credentialsChanged,
      );
      hide();
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("click", click);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
    };
  }
}
