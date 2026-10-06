import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { z } from "zod";
export class AuthFailure extends Error {
  constructor(
    readonly key: string,
    readonly code?: string,
  ) {
    super(key);
  }
}
export async function request(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    const value = await response.json().catch(() => null),
      code = typeof value?.error === "string" ? value.error : "";
    throw new AuthFailure(
      (
        {
          PROVIDER_VALIDATION_FAILED: "providerError",
          ACCOUNT_EXISTS: "duplicateAccount",
          ACCOUNT_CREDENTIAL_REQUIRED: "accountUnavailable",
        } as Record<string, string>
      )[code] ?? "requestFailed",
      code,
    );
  }
  return response;
}
export function signedOAuthQuery(search: string) {
  const all = new URLSearchParams(search),
    names = new Set(all.getAll("ba_param"));
  if (!all.has("sig") || !names.size)
    throw new AuthFailure("incompleteConnection");
  const signed = new URLSearchParams();
  for (const [key, value] of all)
    if (key === "sig" || key === "ba_param" || names.has(key))
      signed.append(key, value);
  return signed.toString();
}
export function destination(value: unknown) {
  if (
    typeof value !== "object" ||
    !value ||
    !("url" in value) ||
    typeof value.url !== "string"
  )
    return;
  const url = new URL(value.url, location.origin);
  if (!["http:", "https:"].includes(url.protocol))
    throw new AuthFailure("unsupportedCallback");
  return url.href;
}
export async function signIn(privateAdmin: boolean) {
  const oauthQuery = location.search
    ? signedOAuthQuery(location.search)
    : undefined;
  const options = await (
    await request("/icloud/auth/passkey/generate-authenticate-options")
  ).json();
  const response = await startAuthentication({
    optionsJSON: { ...options, userVerification: "required" },
  });
  const result = await (
    await request("/icloud/auth/passkey/verify-authentication", {
      response,
      ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
    })
  ).json();
  let url = destination(result);
  if (!url && oauthQuery)
    url = destination(
      await (
        await request("/icloud/auth/oauth2/continue", {
          oauth_query: oauthQuery,
        })
      ).json(),
    );
  if (url) location.assign(url);
  else if (privateAdmin) location.assign("/icloud/admin");
  else if (oauthQuery) throw new AuthFailure("incompleteAuthorization");
}
export async function registerOwner(ownerName: string) {
  const proof = new URLSearchParams(location.hash.slice(1)).get("owner-proof");
  if (proof)
    history.replaceState(null, "", location.pathname + location.search);
  const begun = z
    .object({ passkeyRegistered: z.boolean() })
    .parse(
      await (
        await request("/icloud/setup/begin", proof ? { proof } : {})
      ).json(),
    );
  if (begun.passkeyRegistered) return;
  const options = await (
    await request("/icloud/auth/passkey/generate-register-options")
  ).json();
  const response = await startRegistration({
    optionsJSON: {
      ...options,
      attestation: "none",
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    },
  });
  await request("/icloud/auth/passkey/verify-registration", {
    response,
    name: ownerName,
    createSession: true,
  });
}
