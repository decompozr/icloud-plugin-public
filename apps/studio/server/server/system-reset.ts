import { Database } from "bun:sqlite";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  cpSync,
  rmSync,
  lstatSync,
  readdirSync,
  openSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import { z } from "zod";
import type { AppSettings } from "./settings.js";
import { installation } from "./installation.js";
export type ResetMode = "connections" | "factory";
const stateSchema = z
  .object({
    format: z.literal(1),
    id: z.string().regex(/^[a-f0-9]{64}$/),
    mode: z.enum(["connections", "factory"]),
    phase: z.enum(["queued", "applying", "completed", "failed"]),
    backup: z.string().optional(),
  })
  .strict();
type ResetState = z.infer<typeof stateSchema>;
const recordPath = (settings: AppSettings) =>
  join(dirname(settings.state_directory), "system-reset.json");
function read(settings: AppSettings): ResetState | undefined {
  const path = recordPath(settings);
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 8192 || (stat.mode & 0o077) !== 0)
    throw Error("RESET_STATE_UNAVAILABLE");
  return stateSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
function save(settings: AppSettings, state: ResetState) {
  const path = recordPath(settings),
    pending = path + "." + process.pid;
  writeFileSync(pending, JSON.stringify(state) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  const fd = openSync(pending, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(pending, path);
  const directory = openSync(dirname(path), "r");
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}
function syncTree(path: string) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    for (const name of readdirSync(path)) syncTree(join(path, name));
  } else if (!stat.isFile()) throw Error("RESET_BACKUP_UNAVAILABLE");
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
export function assertResetComplete(settings: AppSettings) {
  const state = read(settings);
  if (state && state.phase !== "completed")
    throw Error("Reset incomplete; protected backup recovery required");
}
export function queueSystemReset(settings: AppSettings, mode: ResetMode) {
  if (settings.runtime_mode !== "native") throw Error("RESET_NOT_AVAILABLE");
  const previous = read(settings);
  if (previous && previous.phase !== "completed") throw Error("RESET_BUSY");
  const id = randomBytes(32).toString("hex");
  save(settings, { format: 1, id, mode, phase: "queued" });
  return id;
}
export function systemResetStatus(settings: AppSettings, id: string) {
  const state = read(settings);
  if (
    !state ||
    !/^[a-f0-9]{64}$/.test(id) ||
    !timingSafeEqual(Buffer.from(id), Buffer.from(state.id))
  )
    return null;
  return { mode: state.mode, phase: state.phase };
}
/** Called only after listener/task/provider drain and closure of all database handles. */
export function performSystemReset(settings: AppSettings, id: string) {
  const state = read(settings);
  if (!state || state.id !== id || state.phase !== "queued")
    throw Error("RESET_STATE_CHANGED");
  const checked = installation(settings);
  checked.store.close();
  checked.masterKey.fill(0);
  const base = dirname(settings.state_directory),
    backup = join(
      base,
      "backups",
      "system-reset-" +
        new Date().toISOString().replace(/[:.]/g, "-") +
        "-" +
        id.slice(0, 8),
    );
  mkdirSync(backup, { recursive: true, mode: 0o700 });
  const files = [
    settings.master_key_file,
    settings.installation_marker,
    join(dirname(settings.master_key_file), "bootstrap-proof"),
    join(dirname(settings.master_key_file), "local-owner-proof"),
  ];
  // All backup copies remain local, private and outside the reset state tree.
  cpSync(settings.state_directory, join(backup, "state"), {
    recursive: true,
    verbatimSymlinks: true,
  });
  mkdirSync(join(backup, "custody"), { mode: 0o700 });
  for (let i = 0; i < files.length; i++)
    if (existsSync(files[i]!))
      cpSync(files[i]!, join(backup, "custody", String(i)));
  syncTree(backup);
  const parent = openSync(dirname(backup), "r");
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
  const applying = { ...state, backup, phase: "applying" as const };
  save(settings, applying);
  try {
    if (state.mode === "factory") {
      // Retain the original state/key backup; never decrypt/reuse it under the new key.
      renameSync(settings.state_directory, join(backup, "original-state"));
      mkdirSync(settings.state_directory, { mode: 0o700 });
      for (const file of files) if (existsSync(file)) rmSync(file);
      const fresh = installation(settings, true);
      fresh.store.close();
      fresh.masterKey.fill(0);
    } else {
      const db = new Database(join(settings.state_directory, "auth.sqlite"), {
        readwrite: true,
        create: false,
      });
      try {
        db.query("ATTACH DATABASE ? AS custody").run(
          join(settings.state_directory, "owner.sqlite"),
        );
        // DELETE journals give one offline transaction across the two attached files.
        db.exec(
          "PRAGMA foreign_keys=OFF; PRAGMA journal_mode=DELETE; PRAGMA custody.journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA custody.synchronous=FULL",
        );
        const present = new Set(
          (
            db
              .query("SELECT name FROM sqlite_master WHERE type='table'")
              .all() as { name: string }[]
          ).map((row) => row.name),
        );
        db.transaction(() => {
          for (const table of [
            "session",
            "verification",
            "oauthAccessToken",
            "oauthRefreshToken",
            "oauthConsent",
            "oauthClientAssertion",
            "oauthClientResource",
            "oauthClient",
            "plugin_auth_private",
            "plugin_account_selection",
            "plugin_client_management_audit",
            "plugin_client_scope_audit",
            "icloudOutbound",
            "calendar_ledger",
            "photos_operations",
            "photos_reviews",
            "photos_shared_operations",
            "photos_shared_uploads",
            "photos_admin_policy",
            "rateLimit",
          ])
            if (present.has(table)) db.exec('DELETE FROM "' + table + '"');
          if (present.has("icloudOperatorPolicy"))
            db.exec(
              "UPDATE icloudOperatorPolicy SET readEnabled=0,writeEnabled=0,sendEnabled=0,unsubscribeEnabled=0",
            );
          db.exec(
            "DELETE FROM custody.provider_sessions; DELETE FROM custody.mail_accounts; UPDATE custody.owner_state SET legacy_account=NULL,secret=NULL,version=version+1 WHERE singleton=1",
          );
        }).immediate();
      } finally {
        db.close();
      }
      if (existsSync(files[3]!)) rmSync(files[3]!);
    }
    syncTree(settings.state_directory);
    for (const file of files) if (existsSync(file)) syncTree(file);
    for (const path of new Set(files.map(dirname))) {
      const fd = openSync(path, "r");
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    }
    save(settings, { ...applying, phase: "completed" });
  } catch {
    save(settings, { ...applying, phase: "failed" });
    throw Error("RESET_FAILED");
  }
  return { backup };
}
