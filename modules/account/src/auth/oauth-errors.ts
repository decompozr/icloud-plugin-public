const errors = new Set([
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "unauthorized_client",
  "unsupported_grant_type",
  "invalid_scope",
  "invalid_token",
  "insufficient_scope",
  "access_denied",
  "server_error",
  "temporarily_unavailable",
  "interaction_required",
  "login_required",
  "consent_required",
  "invalid_redirect_uri",
  "invalid_client_metadata",
  "invalid_software_statement",
  "unapproved_software_statement",
  "unsupported_response_type",
  "invalid_target",
  "invalid_redirect",
  "client_disabled",
  "unsupported_prompt_select_account",
  "request_not_supported",
  "request_uri_not_supported",
  "invalid_request_uri",
]);
/** Exact enum only: never stringify messages, objects, headers, URLs or bodies. */
export function reconnectErrorCode(value: unknown): string {
  return typeof value === "string" && errors.has(value) ? value : "unavailable";
}
/** Consume the provider-created redirect transiently; return only one fixed enum.
 * Never expose/retain Location, URL, query, fragment, description, code or state.
 * Only authorization-code query error delivery is supported; no fallback logging.
 */
export function reconnectRedirectError(value: unknown): string {
  if (typeof value !== "string" || value.length > 8192) return "unavailable";
  try {
    const values = new URL(
      value,
      "https://diagnostic.invalid",
    ).searchParams.getAll("error");
    return values.length === 1 ? reconnectErrorCode(values[0]) : "unavailable";
  } catch {
    return "unavailable";
  }
}

