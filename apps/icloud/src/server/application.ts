import {createHomeKitModule} from '../homekit/module.js';
import type {NativeHomeKitProvider,NativeSettings} from '../homekit/provider.js';
import {createPhotosAdmin} from '../photos/admin.js';
import {photosSetup} from '../photos/setup-ui.js';
import {LocalPhotosProvider} from '../photos/provider.js';
import {PhotosService} from '../photos/service.js';
import {photosRegistration} from '../photos/module.js';
import {
  createLocalOwnerAccess,
  createRemoteOwnerPairing,
} from "@decompozr/account/server";
import { createStudio } from "../../../studio/dist/transport.js";
import { ReconnectCapture } from "../observability/reconnect.js";
import { runtimeVersions } from "./versions.js";
import {
  createSystemStatus,
  type SystemStatus,
} from "../admin/system-status.js";
import { ReadinessEvidence } from "../admin/evidence.js";
import { evidenceState } from "../admin/evidence-state.js";
import {
  createCalendarModule,
  type CalendarModuleDependencies,
} from "../calendar/module.js";
import {
  createMailModule,
  type MailModuleDependencies,
} from "../mail/module.js";
import { ModuleRuntime } from "../modules/runtime.js";
import { configuredPluginArchive } from "../plugin/package.js";
import { OperationMonitor } from "../observability/operations.js";
import { HttpLifecycle } from "./lifecycle.js";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { createBootstrapAccess } from "@decompozr/account/server";
import { z } from "zod";
import type { AppSettings } from "./settings.js";
import type { OwnerSecretStore } from "@decompozr/account/server";
import { createOwnerAuth } from "@decompozr/account/server";
import { createPrivateAdmin, type TailscaleStatus } from "../admin/handler.js";
import { createHttpApp } from "./http.js";
import { FetchListener, guardHost } from "./listener.js";
import { prerequisites } from "./prerequisites.js";

export interface ApplicationDependencies {
  studioDirectory?: string;
  homekitProvider?:(settings:NativeSettings)=>NativeHomeKitProvider;
  calendarProvider?: CalendarModuleDependencies["provider"];
  monitor?: OperationMonitor;
  lifecycle?: HttpLifecycle;
  store: OwnerSecretStore;
  masterKey: Uint8Array;
  authDatabase: Database;
  assetsDirectory: string;
  outboundProvider?: MailModuleDependencies["outboundProvider"];
  diagnostics?: () => Promise<TailscaleStatus>;
  systemStatus?: () => Promise<SystemStatus>;
  resetRuntime?: (mode: import("./system-reset.js").ResetMode) => string;
  resetStatus?: (
    id: string,
  ) => { mode: import("./system-reset.js").ResetMode; phase: string } | null;
  bootstrapProof?: () => string;
  provider?: MailModuleDependencies["provider"];
}
function connectionCommands(settings: AppSettings): string[] {
  const binary = "'" + settings.tailscale_binary.replace(/'/g, "'\\''") + "'",
    privatePort = new URL(settings.private_origin).port || "443";
  return [
    `${binary} serve --bg --https=${privatePort} --set-path=/icloud http://127.0.0.1:${settings.private_port}/icloud`,
    ...[
      "/icloud",
      "/.well-known/oauth-protected-resource/icloud/mcp",
      "/.well-known/oauth-authorization-server/icloud/auth",
    ].map(
      (path) =>
        `${binary} funnel --bg --https=443 --set-path=${path} http://127.0.0.1:${settings.public_port}${path}`,
    ),
  ];
}
export async function createApplication(
  settings: AppSettings,
  deps: ApplicationDependencies,
): Promise<{
  publicApp: FetchListener;
  privateApp: FetchListener;
  localApp?: FetchListener;
  auth: Awaited<ReturnType<typeof createOwnerAuth>>;
  monitor: OperationMonitor;
  lifecycle: HttpLifecycle;
  runtime: ModuleRuntime;
}> {
  const monitor = deps.monitor ?? new OperationMonitor(),
    lifecycle = deps.lifecycle ?? new HttpLifecycle();
  const reconnect = new ReconnectCapture(settings.state_directory);
  const establishedOwner = deps.store.ownerId();
  if (establishedOwner) {
    // Never silently rebuild owner authentication after lost/corrupt auth state.
    const row = z
      .object({ count: z.number().int().positive() })
      .parse(
        deps.authDatabase
          .query("SELECT count(*) AS count FROM passkey WHERE userId=?")
          .get(establishedOwner),
      );
    if (!row.count) throw Error("Owner authentication recovery required");
  }
  const mailModule = createMailModule(settings, { ...deps, monitor });
  const calendarModule = createCalendarModule(settings, {
    ...deps,
    monitor,
    provider: deps.calendarProvider,
  });
  const runtime = new ModuleRuntime()
    .register(mailModule.registration)
    .register(calendarModule.registration);
  const photosPermissions=settings.photos?photosSetup({python:settings.photos.python,library:settings.photos.library,nativeHelper:settings.photos.native_helper}):undefined;
  const photosAdmin=settings.photos?createPhotosAdmin({database:deps.authDatabase,store:deps.store,ceiling:{read:true,write:settings.photos.allow_writes,delete:settings.photos.allow_writes&&settings.photos.allow_delete}}):undefined;
  if(settings.photos&&photosAdmin){
    const p=settings.photos;
    const provider=new LocalPhotosProvider({python:p.python,library:p.library,nativeHelper:p.native_helper,stateDirectory:join(settings.state_directory,'photos'),reviewDirectory:join(dirname(settings.master_key_file),'photos-shared-reviews'),sidecarDirectory:join(deps.assetsDirectory,'../photos')});
    const service=new PhotosService(deps.authDatabase,provider,photosAdmin.policy,()=>{const owner=deps.store.ownerId();if(!owner)throw Error('Owner required');return owner;});
    runtime.register(photosRegistration(service,photosAdmin.policy));
  }
  const homekit=settings.homekit?createHomeKitModule(settings.homekit,{authDatabase:deps.authDatabase,store:deps.store,stateDirectory:join(settings.state_directory,'homekit'),adapter:join(deps.assetsDirectory,'../homekit/stdio-adapter.py'),provider:deps.homekitProvider}):undefined;
  if(homekit)runtime.register(homekit.registration);
  await runtime.start();
  try {
    const config = mailModule.config;
    const scopeLabels = Object.fromEntries(
      runtime.scopeDescriptors.map((scope) => [
        scope.name,
        { default: scope.description, ...scope.descriptionLocales },
      ]),
    );
    const diagnostics = deps.diagnostics ?? (() => prerequisites(settings));
    const pairing = settings.local_origin
      ? createRemoteOwnerPairing(settings.private_origin, () =>
          deps.store.ownerId(),
        )
      : undefined;
    const auth = await createOwnerAuth({
      database: deps.authDatabase,
      ...(pairing
        ? {
            registrationOwnerId: () => deps.store.ownerId(),
            checkRegistrationProof: (proof: string) => {
              if (deps.store.ownerId() !== null) {
                if (proof !== pairing.proof)
                  throw Error("Remote owner pairing required");
              } else deps.store.checkBootstrapProof(proof);
            },
          }
        : {}),
      onOAuthError: reconnect.noteError,
      publicBaseURL: settings.public_origin,
      privateOrigin: settings.private_origin,
      rpID: new URL(settings.public_origin).hostname,
      secret: createHash("sha256")
        .update(deps.masterKey)
        .update("owner-auth-v1")
        .digest("hex"),
      resource: settings.public_origin + "/icloud/mcp",
      scopes: runtime.declaredScopes,
      allowedScopes: () => runtime.allowedScopes,
      ownerId: () => deps.store.ownerId(),
      checkBootstrapProof: (proof) => deps.store.checkBootstrapProof(proof),
      accountStore: deps.store,
      validateCredential: mailModule.admin.validateCredential,
    });
    const bootstrap = createBootstrapAccess({
      login: settings.bootstrap_owner_login,
      origin: settings.private_origin,
      isEnrolled: () => deps.store.ownerId() !== null,
    });
    const internalProof =
      deps.bootstrapProof ??
      (() =>
        readFileSync(
          join(dirname(settings.master_key_file), "bootstrap-proof"),
          "utf8",
        ));
    const setupState = async (request: Request) => {
      let passkeyRegistered = false;
      try {
        const session = await auth.enrollmentSession(request.headers);
        passkeyRegistered = bootstrap.resumed(request, session.user.id);
      } catch {}
      return {
        bootstrapAuthorized: bootstrap.allowed(request),
        passkeyRegistered,
      };
    };
    let policyEpoch = 0;
    const evidence = new ReadinessEvidence(
      evidenceState(
        deps.authDatabase,
        deps.store,
        () => runtime.allowedScopes,
        () => policyEpoch,
      ),
    );
    const studio = await createStudio(
      deps.studioDirectory ?? join(deps.assetsDirectory, "../studio"),
    );
    const publicFetch = async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (
        ["GET", "HEAD"].includes(request.method) &&
        path === "/icloud/assets/inter.ttf"
      )
        return new Response(Bun.file(join(deps.assetsDirectory, "inter.ttf")), {
          headers: { "content-type": "font/ttf" },
        });
      const asset = await studio.asset(request);
      if (asset) return asset;
      const mode =
        path === "/icloud/sign-in"
          ? "sign-in"
          : path === "/icloud/connect"
            ? "connect"
            : path === "/icloud/consent"
              ? "consent"
              : undefined;
      if (mode && ["GET", "HEAD"].includes(request.method))
        return studio.auth(request, mode, false, scopeLabels);
      return studio.api(request, auth.publicHandler);
    };
    const publicApp = createHttpApp(
      config,
      runtime,
      auth.verifyBearer,
      lifecycle,
      evidence,
      reconnect,
      publicFetch,
      async (request) =>
        guardHost(request, settings.public_origin, settings.public_port),
    );
    const versions = runtimeVersions(deps.assetsDirectory);
    const admin = createPrivateAdmin({
      ...(photosPermissions?{photosSetup:photosPermissions}:{}),
      resetRuntime: deps.resetRuntime,
      resetStatus: deps.resetStatus,
      renderPage: studio.admin,
      connectionCommands: connectionCommands(settings),
      systemStatus:
        deps.systemStatus ??
        (() =>
          createSystemStatus(settings, {
            prerequisites: () => diagnostics(),
            ...versions,
            ...(versions.installedVersion
              ? {
                  installationDirectory: resolve(
                    deps.assetsDirectory,
                    "../../../..",
                  ),
                }
              : {}),
          })),
      evidence: (owner) => evidence.list(owner),
      privateOrigin: settings.private_origin,
      pluginArchive: () =>
        configuredPluginArchive(
          join(deps.assetsDirectory, "../plugin-template"),
          settings.public_origin,
        ),
      publicMcpUrl: new URL("/icloud/mcp", settings.public_origin).href,
      store: deps.store,
      ownerAuth: auth,
      diagnostics,
      setupState,
      ...mailModule.admin,
      updateCapabilities: async (...args) => {
        try {
          return await mailModule.admin.updateCapabilities!(...args);
        } finally {
          policyEpoch++;
        }
      },
      homekit:homekit?.adminActions,
      modules: [
        ...(homekit?[{...homekit.admin,updateCapabilities:async(...args:Parameters<typeof homekit.admin.updateCapabilities>)=>{try{return await homekit.admin.updateCapabilities(...args);}finally{policyEpoch++;}}}]:[]),
        ...(photosAdmin?[{...photosAdmin.admin,updateCapabilities:async(...args:Parameters<typeof photosAdmin.admin.updateCapabilities>)=>{try{return await photosAdmin.admin.updateCapabilities(...args);}finally{policyEpoch++;}}}]:[]),
        {
          ...calendarModule.admin,
          updateCapabilities: async (...args) => {
            try {
              return await calendarModule.admin.updateCapabilities(...args);
            } finally {
              policyEpoch++;
            }
          },
        },
      ],
    });
    const privateFetch = async (incoming: Request) => {
      const path = new URL(incoming.url).pathname;
      if (["GET", "HEAD"].includes(incoming.method)) {
        if (path === "/setup")
          return new Response(null, {
            status: 308,
            headers: { location: "/icloud/setup" },
          });
        if (path === "/icloud/setup/health")
          return new Response("icloud-private");
        if (
          ["inter.ttf", "plugin-icon.png"].some(
            (asset) => path === "/icloud/assets/" + asset,
          )
        )
          return new Response(
            Bun.file(join(deps.assetsDirectory, path.split("/").at(-1)!)),
          );
      }
      const asset = await studio.asset(incoming);
      if (asset) return asset;
      if (
        ["GET", "HEAD"].includes(incoming.method) &&
        new URL(incoming.url).pathname === "/icloud/sign-in"
      )
        return studio.auth(incoming, "sign-in", true, scopeLabels);
      return studio.api(incoming, async (request) => {
        const path = new URL(request.url).pathname;
        if (pairing && deps.store.ownerId() !== null) {
          if (
            path === "/icloud/setup" &&
            new URL(request.url).searchParams.get("mode") === "remote-owner"
          )
            return studio.admin(request, {
              enrolled: false,
              ready: true,
              admin: false,
              view: "setup",
              publicMcpUrl: new URL("/icloud/mcp", settings.public_origin).href,
            });
          if (
            path === "/icloud/setup/status" &&
            new URL(request.url).searchParams.get("mode") === "remote-owner"
          )
            return Response.json({
              prerequisites: await diagnostics(),
              ready: true,
              enrolled: false,
              bootstrapAuthorized: (() => {
                try {
                  pairing.authorize(request);
                  return true;
                } catch {
                  return false;
                }
              })(),
              passkeyRegistered: await auth
                .enrollmentSession(request.headers)
                .then(
                  (current) =>
                    pairing.authorize(request).user === current.user.id,
                )
                .catch(() => false),
            });
          if (path === "/icloud/setup/begin") {
            try {
              if (request.method !== "POST") throw Error("Method denied");
              try {
                const grant = pairing.authorize(request);
                return Response.json({
                  passkeyRegistered: Boolean(grant.user),
                });
              } catch {}
              const body = z
                .object({ proof: z.string() })
                .strict()
                .parse(await request.json());
              return Response.json(
                { passkeyRegistered: false },
                {
                  headers: {
                    "set-cookie": pairing.begin(request, body.proof),
                    "cache-control": "no-store",
                  },
                },
              );
            } catch {
              return Response.json(
                { error: "REMOTE_OWNER_PAIRING_REQUIRED" },
                { status: 403 },
              );
            }
          }
          if (
            [
              "/icloud/auth/passkey/generate-register-options",
              "/icloud/auth/passkey/verify-registration",
              "/icloud/setup/complete",
            ].includes(path)
          ) {
            try {
              pairing.authorize(request);
              if (path === "/icloud/setup/complete") {
                if (
                  request.method !== "POST" ||
                  request.headers.get("content-type")?.split(";")[0] !==
                    "application/json"
                )
                  throw Error("Explicit completion required");
                z.object({})
                  .strict()
                  .parse(await request.json());
                const current = await auth.ownerSession(request.headers);
                pairing.complete(request, current.user.id);
                return Response.json({ enrolled: true });
              }
              const headers = new Headers(request.headers);
              headers.set("x-bootstrap-proof", pairing.proof);
              const response = await auth.privateHandler(
                new Request(request, { headers }),
              );
              if (path.endsWith("/verify-registration") && response.ok) {
                const cookies = new Headers(request.headers);
                cookies.set(
                  "cookie",
                  [
                    request.headers.get("cookie") ?? "",
                    ...response.headers
                      .getSetCookie()
                      .map((value) => value.split(";")[0]),
                  ].join("; "),
                );
                pairing.bind(
                  request,
                  (await auth.ownerSession(cookies)).user.id,
                );
              }
              return response;
            } catch {
              return Response.json(
                { error: "REMOTE_OWNER_PAIRING_REQUIRED" },
                { status: 403 },
              );
            }
          }
        }
        const registration =
          path === "/icloud/auth/passkey/generate-register-options" ||
          path === "/icloud/auth/passkey/verify-registration";
        if (
          path === "/icloud/setup/begin" ||
          registration ||
          path === "/icloud/setup/complete"
        ) {
          if (deps.store.ownerId() !== null)
            return Response.json(
              { error: "ENROLLMENT_CLOSED" },
              { status: path === "/icloud/setup/complete" ? 409 : 403 },
            );
          const status = await diagnostics();
          if (!Object.values(status).every(Boolean))
            return Response.json(
              { error: "PREREQUISITES_REQUIRED" },
              { status: 409 },
            );
          try {
            if (path === "/icloud/setup/begin") {
              if (request.method !== "POST")
                return new Response("Method not allowed", { status: 405 });
              let userId: string | undefined;
              try {
                userId = (await auth.enrollmentSession(request.headers)).user
                  .id;
              } catch {}
              return Response.json(
                { ready: true, passkeyRegistered: Boolean(userId) },
                {
                  headers: {
                    "set-cookie": bootstrap.begin(request, userId),
                    "cache-control": "no-store",
                  },
                },
              );
            }
            if (path === "/icloud/setup/complete")
              bootstrap.authorize(
                request,
                (await auth.enrollmentSession(request.headers)).user.id,
              );
            else bootstrap.authorize(request);
            const proof = internalProof();
            deps.store.checkBootstrapProof(proof);
            const headers = new Headers(request.headers);
            headers.set("x-bootstrap-proof", proof);
            const internal = new Request(request, { headers });
            const response = registration
              ? await auth.privateHandler(internal)
              : await admin(internal);
            if (
              path === "/icloud/auth/passkey/verify-registration" &&
              response.ok
            ) {
              const cookies = new Map<string, string>();
              for (const part of (request.headers.get("cookie") ?? "").split(
                ";",
              )) {
                const at = part.indexOf("=");
                if (at > 0)
                  cookies.set(part.slice(0, at).trim(), part.slice(at + 1));
              }
              for (const part of response.headers.getSetCookie()) {
                const pair = part.split(";")[0]!;
                const at = pair.indexOf("=");
                cookies.set(pair.slice(0, at), pair.slice(at + 1));
              }
              const session = await auth.enrollmentSession(
                new Headers({
                  cookie: [...cookies]
                    .map(([key, value]) => `${key}=${value}`)
                    .join("; "),
                }),
              );
              bootstrap.bind(request, session.user.id);
            }
            if (path === "/icloud/setup/complete" && response.ok)
              bootstrap.close();
            return response;
          } catch {
            return Response.json(
              { error: "SETUP_AUTHORIZATION_REQUIRED" },
              { status: 403 },
            );
          }
        }
        if (path === "/icloud/admin/oauth-clients")
          return auth.privateHandler(request);
        if (path.startsWith("/icloud/auth/")) {
          if (path.includes("register") || path.includes("registration")) {
            const status = await diagnostics();
            if (!Object.values(status).every(Boolean))
              return new Response("Prerequisites required", { status: 409 });
          }
          return auth.privateHandler(request);
        }
        return admin(request);
      });
    };
    const privateApp = new FetchListener({
      origin: settings.private_origin,
      lifecycle,
      handler: privateFetch,
      headers: async (request, context) => {
        const denied = guardHost(
          request,
          settings.private_origin,
          settings.private_port,
        );
        if (denied) return denied;
        const address = context.remoteAddress?.replace(/^::ffff:/, "");
        return address === "127.0.0.1" ||
          address === "::1" ||
          (settings.runtime_mode === "container" &&
            settings.private_proxy_address &&
            address === settings.private_proxy_address)
          ? undefined
          : new Response(null, { status: 403 });
      },
    });
    let localApp: FetchListener | undefined;
    if (settings.local_origin) {
      const localOrigin = settings.local_origin,
        access = createLocalOwnerAccess(settings, () => deps.store.ownerId());
      const localAuth = await createOwnerAuth({
        database: deps.authDatabase,
        publicBaseURL: localOrigin,
        privateOrigin: localOrigin,
        rpID: "localhost",
        sessionOnly: true,
        cookiePrefix: "icloud_local",
        accountStore: deps.store,
        allowedScopes: () => runtime.allowedScopes,
        secret: createHash("sha256")
          .update(deps.masterKey)
          .update("local-owner-auth-v1")
          .digest("hex"),
        resource: settings.public_origin + "/icloud/mcp",
        scopes: runtime.declaredScopes,
        ownerId: () => deps.store.ownerId(),
        registrationOwnerId: () => deps.store.ownerId(),
        checkRegistrationProof: (value) => access.checkProof(value),
        checkBootstrapProof: () => {
          throw Error("Local proof required");
        },
      });
      const localAdmin = createPrivateAdmin({
      ...(photosPermissions?{photosSetup:photosPermissions}:{}),
        resetRuntime: deps.resetRuntime,
        resetStatus: deps.resetStatus,
        renderPage: studio.admin,
        connectionCommands: connectionCommands(settings),
        privateOrigin: localOrigin,
        setupReady: true,
        localOwner: true,
        store: deps.store,
        ownerAuth: localAuth,
        diagnostics,
        setupState: async (request) => {
          let passkeyRegistered = false;
          try {
            const current = await localAuth.enrollmentSession(request.headers);
            passkeyRegistered =
              access.authorize(request).user === current.user.id;
          } catch {}
          return {
            bootstrapAuthorized: (() => {
              try {
                access.authorize(request);
                return true;
              } catch {
                return false;
              }
            })(),
            passkeyRegistered,
            localOwner: true,
          };
        },
        systemStatus:
          deps.systemStatus ??
          (() =>
            createSystemStatus(settings, {
              prerequisites: () => diagnostics(),
              ...versions,
              ...(versions.installedVersion
                ? {
                    installationDirectory: resolve(
                      deps.assetsDirectory,
                      "../../../..",
                    ),
                  }
                : {}),
            })),
        evidence: (owner) => evidence.list(owner),
        publicMcpUrl: new URL("/icloud/mcp", settings.public_origin).href,
        ...mailModule.admin,
        updateCapabilities: async (...args) => {
          try {
            return await mailModule.admin.updateCapabilities!(...args);
          } finally {
            policyEpoch++;
          }
        },
        homekit:homekit?.adminActions,
        modules: [
        ...(homekit?[{...homekit.admin,updateCapabilities:async(...args:Parameters<typeof homekit.admin.updateCapabilities>)=>{try{return await homekit.admin.updateCapabilities(...args);}finally{policyEpoch++;}}}]:[]),
        ...(photosAdmin?[{...photosAdmin.admin,updateCapabilities:async(...args:Parameters<typeof photosAdmin.admin.updateCapabilities>)=>{try{return await photosAdmin.admin.updateCapabilities(...args);}finally{policyEpoch++;}}}]:[]),
          {
            ...calendarModule.admin,
            updateCapabilities: async (...args) => {
              try {
                return await calendarModule.admin.updateCapabilities(...args);
              } finally {
                policyEpoch++;
              }
            },
          },
        ],
      });
      const localFetch = async (incoming: Request) => {
        const path = new URL(incoming.url).pathname;
        if (
          ["GET", "HEAD"].includes(incoming.method) &&
          ["inter.ttf", "plugin-icon.png"].some(
            (asset) => path === "/icloud/assets/" + asset,
          )
        )
          return new Response(
            Bun.file(join(deps.assetsDirectory, path.split("/").at(-1)!)),
          );
        const asset = await studio.asset(incoming);
        if (asset) return asset;
        if (
          ["GET", "HEAD"].includes(incoming.method) &&
          new URL(incoming.url).pathname === "/icloud/sign-in"
        )
          return studio.auth(incoming, "sign-in", true, scopeLabels);
        return studio.api(incoming, async (request) => {
          const path = new URL(request.url).pathname;
          if (path === "/icloud/admin/remote-owner") {
            try {
              if (
                request.method !== "POST" ||
                request.headers.get("origin") !== localOrigin
              )
                throw Error("Origin required");
              const body = z
                .object({ confirm: z.literal(true) })
                .strict()
                .parse(await request.json());
              void body;
              const current = await localAuth.ownerSession(request.headers);
              return Response.json(
                { url: pairing!.issue(current.user.id), expiresIn: 300 },
                { headers: { "cache-control": "no-store" } },
              );
            } catch {
              return Response.json(
                { error: "OWNER_CONFIRMATION_REQUIRED" },
                { status: 403 },
              );
            }
          }
          if (
            path === "/icloud/setup" &&
            new URL(request.url).searchParams.get("mode") === "local-owner"
          )
            return studio.admin(request, {
              localOwner: true,
              enrolled: false,
              ready: true,
              admin: false,
              view: "setup",
              publicMcpUrl: new URL("/icloud/mcp", settings.public_origin).href,
            });
          if (
            path === "/icloud/setup/status" &&
            new URL(request.url).searchParams.get("mode") === "local-owner"
          )
            return Response.json(
              {
                prerequisites: await diagnostics(),
                ready: true,
                enrolled: false,
                localOwner: true,
                bootstrapAuthorized: (() => {
                  try {
                    access.authorize(request);
                    return true;
                  } catch {
                    return false;
                  }
                })(),
                passkeyRegistered: await localAuth
                  .enrollmentSession(request.headers)
                  .then(
                    (current) =>
                      access.authorize(request).user === current.user.id,
                  )
                  .catch(() => false),
              },
              { headers: { "cache-control": "no-store" } },
            );
          if (path === "/icloud/setup/begin") {
            if (request.method !== "POST")
              return new Response("Method not allowed", { status: 405 });
            try {
              try {
                const grant = access.authorize(request);
                return Response.json({
                  passkeyRegistered: Boolean(grant.user),
                });
              } catch {}
              const body = z
                .object({ proof: z.string() })
                .strict()
                .parse(await request.json());
              return Response.json(
                { passkeyRegistered: false },
                {
                  headers: {
                    "set-cookie": access.begin(request, body.proof),
                    "cache-control": "no-store",
                  },
                },
              );
            } catch {
              return Response.json(
                { error: "LOCAL_OWNER_PROOF_REQUIRED" },
                { status: 403 },
              );
            }
          }
          const registration = [
            "/icloud/auth/passkey/generate-register-options",
            "/icloud/auth/passkey/verify-registration",
          ].includes(path);
          if (registration || path === "/icloud/setup/complete") {
            try {
              access.authorize(request);
              const headers = new Headers(request.headers);
              headers.set("x-bootstrap-proof", access.proof);
              const internal = new Request(request, { headers });
              if (path === "/icloud/setup/complete") {
                if (
                  request.method !== "POST" ||
                  request.headers.get("content-type")?.split(";")[0] !==
                    "application/json"
                )
                  throw Error("Explicit completion required");
                z.object({})
                  .strict()
                  .parse(await request.json());
                const current = await localAuth.enrollmentSession(
                  request.headers,
                );
                if (access.authorize(request).user !== current.user.id)
                  throw Error("Owner association required");
                if (deps.store.ownerId() === null) {
                  deps.store.enroll({
                    proof: internalProof(),
                    ownerId: current.user.id,
                  });
                } else if (current.user.id !== deps.store.ownerId())
                  throw Error("Owner required");
                access.close();
                return Response.json({ enrolled: true });
              }
              const response = await localAuth.privateHandler(internal);
              if (path.endsWith("/verify-registration") && response.ok) {
                const cookies = new Headers(request.headers);
                cookies.set(
                  "cookie",
                  [
                    request.headers.get("cookie") ?? "",
                    ...response.headers
                      .getSetCookie()
                      .map((value) => value.split(";")[0]),
                  ].join("; "),
                );
                access.bind(
                  request,
                  (await localAuth.enrollmentSession(cookies)).user.id,
                );
              }
              return response;
            } catch {
              return Response.json(
                { error: "LOCAL_OWNER_PROOF_REQUIRED" },
                { status: 403 },
              );
            }
          }
          if (path === "/icloud/admin/oauth-clients")
            return localAuth.privateHandler(request);
          if (path.startsWith("/icloud/auth/"))
            return [
              "/icloud/auth/passkey/generate-authenticate-options",
              "/icloud/auth/passkey/verify-authentication",
              "/icloud/auth/get-session",
              "/icloud/auth/sign-out",
            ].includes(path)
              ? localAuth.privateHandler(request)
              : new Response("Not found", { status: 404 });
          return localAdmin(request);
        });
      };
      localApp = new FetchListener({
        origin: localOrigin,
        lifecycle,
        handler: localFetch,
        headers: async (request, context) => {
          const address = context.remoteAddress?.replace(/^::ffff:/, "");
          return request.headers.get("host") === new URL(localOrigin).host &&
            ["127.0.0.1", "::1"].includes(address ?? "")
            ? undefined
            : new Response(null, { status: 403 });
        },
      });
    }
    return {
      publicApp,
      privateApp,
      ...(localApp ? { localApp } : {}),
      auth,
      monitor,
      lifecycle,
      runtime,
    };
  } catch (error) {
    try {
      await runtime.dispose();
    } catch {}
    throw error;
  }
}
