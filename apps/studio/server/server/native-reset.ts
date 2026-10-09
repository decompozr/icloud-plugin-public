import { spawn } from "node:child_process";
import { dirname,join } from "node:path";
import type { AppSettings } from "./settings.js";
import {
  queueSystemReset,
  performSystemReset,
  systemResetStatus,
  type ResetMode,
} from "./system-reset.js";
import { resetRestartPlan } from "./reset-restart.js";
/** Entry-point controller: confirmed requests schedule work after their response. */
export function createNativeReset(
  settings: AppSettings,
  options: {
    entry: string;
    configPath: string;
    cwd: string;
    drainAndClose: () => Promise<void>;
    restartPlan?: () => "supervisor" | "direct" | "service";
    exit?: (code: number) => void;
  },
) {
  const exit = options.exit ?? ((code: number) => process.exit(code));
  async function execute(id: string, restart: "supervisor" | "direct" | "service") {
    try {
      await options.drainAndClose();
      performSystemReset(settings, id);
      if (restart === "service") {const prefix=process.env.ICLOUD_INSTALL_PREFIX;if(!prefix)throw Error("Installed prefix unavailable");const control=spawn(process.execPath,[join(prefix,"current/icloud-plugin.js"),"service","restart","--prefix",prefix],{cwd:prefix,env:process.env,stdio:"ignore",detached:true});await new Promise<void>((resolve,reject)=>{control.once("close",code=>code===0?resolve():reject(Error("Service restart not queued")));control.once("error",reject)});control.unref();}
      if (restart === "direct") {
        const next = spawn(
          process.execPath,
          [options.entry, "--config", options.configPath],
          {
            cwd: options.cwd,
            env: process.env,
            stdio: "inherit",
            detached: true,
          },
        );
        await new Promise<void>((resolve, reject) => {
          next.once("spawn", resolve);
          next.once("error", reject);
        });
        next.unref();
      }
      exit(0);
    } catch {
      console.error(
        "System reset failed. Protected backup recovery is required.",
      );
      exit(1);
    }
  }
  return {
    resetRuntime: (mode: ResetMode) => {
      const restart =
        options.restartPlan?.() ??
        resetRestartPlan(settings, dirname(options.entry));
      const id = queueSystemReset(settings, mode);
      setTimeout(() => {
        void execute(id, restart);
      }, 150);
      return id;
    },
    resetStatus: (id: string) => systemResetStatus(settings, id),
  };
}
