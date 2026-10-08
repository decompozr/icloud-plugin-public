export {brandSvg} from "@decompozr/ui/branding.js";
import { createCopy } from "./lib/copy.js";
import { render } from "svelte/server";
import Admin from "./components/Admin.svelte";
import Auth from "@decompozr/account/ui/Auth.svelte";
import Credential from "@decompozr/account/ui/Credential.svelte";
import PhotosSetup from "@decompozr/photos/ui/PhotosSetup.svelte";
import PhotosCloud from "@decompozr/account/ui/PhotosCloud.svelte";
import type { AdminState, UiCopy, AuthMode, ScopeLabels } from "./contracts.js";
export { pageStyles } from "./styles.js";
export type { AdminState, UiCopy, AuthMode, ScopeLabels } from "./contracts.js";
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (value) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        value
      ]!,
  );
const context = (copy: UiCopy) => new Map([["copy", copy]]);
/** Trusted CSS and fixed document shell; all UI content is rendered by Svelte. */
function document(
  body: string,
  title: string,
  styles: string,
  locale: string,
  asset: string,
  attributes: Record<string, string> = {},
  extraStyles = "",
) {
  return `<!doctype html><html lang="${escape(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><style>${styles}</style>${extraStyles ? `<style>${extraStyles}</style>` : ""}</head><body data-ui-framework="svelte" ${Object.entries(
    attributes,
  )
    .map(([key, value]) => `${key}="${escape(value)}"`)
    .join(" ")}>${body}</body></html>`;
}
export function renderAdmin(
  state: AdminState,
  copy: UiCopy,
  styles: string,
  locale: string,
): string {
  return document(
    render(Admin, { props: { state }, context: context(copy) }).body,
    copy.t(state.admin ? "titleAdmin" : "titleSetup"),
    styles,
    locale,
    "admin-browser.js",
  );
}
const authStyles = `[data-auth-scopes]{border:0;padding:0;margin:1.5rem 0} [data-auth-scopes] legend{font-weight:600} [data-auth-scopes] h3{font-size:.875rem;margin:1rem 0 .5rem;color:var(--ui-muted)} .permission-choice{display:flex;gap:.75rem;align-items:flex-start;padding:.75rem;border:1px solid var(--ui-edge);border-radius:.375rem;margin:.5rem 0;font-weight:400;cursor:pointer} .permission-choice input{margin-top:.15rem} .permission-choice:has(input:focus-visible){outline:2px solid var(--ui-focus);outline-offset:2px}`;
export function renderAuth(
  mode: AuthMode,
  privateAdmin: boolean,
  scopeLabels: ScopeLabels,
  copy: UiCopy,
  styles: string,
  locale: string,
): string {
  const title =
    copy.authT(
      mode === "connect"
        ? "titleConnect"
        : mode === "consent"
          ? "titleConsent"
          : "titleSignIn",
    ) +
    " · " +
    copy.authT("product");
  return document(
    render(Auth, { props: { mode }, context: context(copy) }).body,
    title,
    styles,
    locale,
    "auth-browser.js",
    {
      "data-auth-scope-labels": JSON.stringify(scopeLabels),
      "data-auth-mode": mode,
      "data-auth-return": privateAdmin ? "/icloud/admin" : "",
    },
    authStyles,
  );
}
export function renderCredential(admin: boolean, copy: UiCopy): string {
  return render(Credential, { props: { admin }, context: context(copy) }).body;
}
export function renderPhotosSetup(): string {
  return render(PhotosSetup, { context: context(createCopy(() => "en")) }).body;
}
export function renderPhotosCloud(): string {
  return render(PhotosCloud, { context: context(createCopy(() => "en")) }).body;
}
