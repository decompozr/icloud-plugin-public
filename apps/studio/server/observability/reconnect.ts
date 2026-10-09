import {reconnectErrorCode} from '@decompozr/account/server';
import { AsyncLocalStorage } from "node:async_hooks";
import {
  lstatSync,
  openSync,
  closeSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  constants,
} from "node:fs";
import { join } from "node:path";

const routes = {
  "/.well-known/oauth-protected-resource/icloud/mcp": "discovery",
  "/.well-known/oauth-authorization-server/icloud/auth": "discovery",
  "/icloud/auth/.well-known/oauth-authorization-server": "discovery",
  "/icloud/auth/oauth2/register": "registration",
  "/icloud/auth/oauth2/authorize": "authorization",
  "/icloud/auth/oauth2/continue": "authorization",
  "/icloud/auth/oauth2/consent": "authorization",
  "/icloud/sign-in": "authorization",
  "/icloud/consent": "authorization",
  "/icloud/connect": "authorization",
  "/icloud/connect/select": "authorization",
  "/icloud/auth/get-session": "authorization",
  "/icloud/auth/passkey/generate-authenticate-options": "authorization",
  "/icloud/auth/passkey/verify-authentication": "authorization",
  "/icloud/auth/oauth2/token": "token",
  "/icloud/mcp": "mcp",
} as const;
type Route = keyof typeof routes;
type RecordEntry = {
  timestamp: string;
  stage: (typeof routes)[Route];
  route: Route;
  status: number;
  errorCode: string;
};
export const RECONNECT_LIMIT = 256,
  RECONNECT_WINDOW_MS = 30 * 60 * 1000;
export {reconnectErrorCode,reconnectRedirectError} from '@decompozr/account/server';
/** Owner-only local files; no diagnostic endpoint and no production state mutation. */
export class ReconnectCapture {
  private readonly context = new AsyncLocalStorage<{ errorCode?: string }>();
  private records: RecordEntry[] = [];
  private generation = "";
  constructor(
    private readonly directory: string,
    private readonly now = Date.now,
  ) {}
  private active(): boolean {
    try {
      const marker = lstatSync(
        join(this.directory, "reconnect-diagnostics.enable"),
      );
      if (
        !marker.isFile() ||
        (marker.mode & 0o077) !== 0 ||
        marker.uid !== process.getuid?.()
      )
        return false;
      const age = this.now() - marker.mtimeMs;
      if (age < 0 || age >= RECONNECT_WINDOW_MS) return false;
      const generation = `${marker.ino}:${marker.mtimeMs}`;
      if (generation !== this.generation) {
        this.generation = generation;
        this.records = [];
      }
      return true;
    } catch {
      return false;
    }
  }
  noteError = (code: unknown): void => {
    const state = this.context.getStore();
    if (state) state.errorCode = reconnectErrorCode(code);
  };
  run<T>(
    path: string,
    operation: () => Promise<T>,
    onFinish: (callback: (status: number) => void) => void,
  ): Promise<T> {
    // Only the literal pathname enters capture; query, headers and bodies never do.
    if (!Object.hasOwn(routes, path) || !this.active()) return operation();
    const route = path as Route,
      generation = this.generation,
      state: { errorCode?: string } = {};
    onFinish((status) => {
      try {
        if (
          !this.active() ||
          generation !== this.generation ||
          !Number.isInteger(status) ||
          status < 100 ||
          status > 599
        )
          return;
        const errorCode =
          state.errorCode ?? (status < 300 ? "none" : "unavailable");
        this.records.push({
          timestamp: new Date(this.now()).toISOString(),
          stage: routes[route],
          route,
          status,
          errorCode,
        });
        if (this.records.length > RECONNECT_LIMIT) this.records.shift();
        this.persist();
      } catch {
        /* Diagnostics must never change request behavior. */
      }
    });
    return this.context.run(state, operation);
  }
  private persist(): void {
    const target = join(this.directory, "reconnect-diagnostics.json");
    try {
      const existing = lstatSync(target);
      if (
        !existing.isFile() ||
        (existing.mode & 0o077) !== 0 ||
        existing.uid !== process.getuid?.()
      )
        return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
    }
    const temporary = join(
      this.directory,
      `.reconnect-diagnostics-${process.pid}.tmp`,
    );
    let fd: number | undefined,
      created = false;
    try {
      fd = openSync(
        temporary,
        constants.O_WRONLY |
          constants.O_CREAT |
          constants.O_EXCL |
          constants.O_NOFOLLOW,
        0o600,
      );
      created = true;
      writeFileSync(fd, JSON.stringify(this.records) + "\n");
      closeSync(fd);
      fd = undefined;
      renameSync(temporary, target);
    } finally {
      if (fd !== undefined) closeSync(fd);
      if (created)
        try {
          unlinkSync(temporary);
        } catch {}
    }
  }
}
