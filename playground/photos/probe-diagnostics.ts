// Only fixed local vocabulary and numeric HTTP status may cross the CLI boundary.
export const probeStages = ['session-validation', 'session-save', 'input', 'srp-init', 'srp-complete', 'account-login', 'push-2fa', 'input-2fa', 'verify-2fa', 'trust-session', 'account-login-after-2fa', 'service-discovery', 'photos-indexing', 'photos-read', 'albums-read', 'people-schema-read'] as const;
export type ProbeStage = typeof probeStages[number];
export const probeReasons = ['photos_response_invalid', 'photos_zone_mismatch', 'session_cache_invalid', 'session_cache_unsafe', 'session_cache_write_failed', 'session_expired', 'session_account_mismatch', 'unknown_failure', 'invalid_endpoint', 'untrusted_endpoint', 'invalid_timeout', 'request_cancelled', 'redirect_refused', 'response_too_large', 'invalid_cookie', 'timeout', 'transport_error', 'authentication_rejected', 'invalid_response', 'missing_session_token', 'account_login_rejected', 'alternate_region_required', 'client_already_used', 'invalid_credentials_input', 'invalid_srp_challenge', 'account_repair_required', 'two_factor_required', 'unsupported_two_step_auth', 'two_factor_push_failed', 'two_factor_cancelled', 'invalid_two_factor_code', 'session_not_trusted', 'missing_account_services', 'photos_http_rejected', 'photos_service_missing', 'photos_indexing_not_ready'] as const;
export type ProbeReason = typeof probeReasons[number];
export class ProbeError extends Error {
  constructor(readonly code: ProbeReason, readonly status?: number) { super(code); }
}
export interface ProbeContext { stage: ProbeStage; authenticationVerified: boolean; }
export function probeFailure(error: unknown, context: ProbeContext) {
  // No duck typing: foreign errors, messages, bodies and URLs are never reflected.
  const code = error instanceof ProbeError ? Object.getOwnPropertyDescriptor(error, 'code')?.value : undefined;
  const reason = typeof code === 'string' && probeReasons.includes(code as ProbeReason) ? code : 'unknown_failure';
  const status = error instanceof ProbeError ? Object.getOwnPropertyDescriptor(error, 'status')?.value : undefined;
  return { status: 'needs-user-help', stage: probeStages.includes(context.stage) ? context.stage : 'input', reason,
    ...(typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? {httpStatus: status} : {}),
    authenticationVerified: context.authenticationVerified === true, photosReadVerified: false, automaticRetry: false,
    nextStep: 'Share this diagnostic JSON only; do not share credentials or verification codes.' };
}
