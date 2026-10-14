import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import type { AppSettings } from "./settings.js";
export type ResetRestart = "supervisor" | "direct" | "service";
export function resetRestartPlan(
  settings: AppSettings,
  moduleDirectory: string,
  deps: {
    pid?: number;
    ppid?: number;
    platform?: string;
    uid?: number;
    serviceName?: string;
    launcherPid?: number;
    parentOf?: (pid:number)=>number;
    probe?: (label: string) => { present: boolean; pid?: number };
  } = {},
): ResetRestart {
  const platform = deps.platform ?? process.platform,
    pid = deps.pid ?? process.pid,
    ppid = deps.ppid ?? process.ppid;
  if (platform !== "darwin")
    return process.env.INVOCATION_ID ? "supervisor" : "direct";
  const uid = deps.uid ?? process.getuid?.();
  if (uid === undefined) throw Error("RESET_SUPERVISION_UNKNOWN");
  const roots = [
    dirname(settings.state_directory),
    dirname(dirname(settings.state_directory)),
    resolve(moduleDirectory, "../../../../.."),
  ];
  const service = deps.serviceName ?? process.env.XPC_SERVICE_NAME;
  const labels = new Set([
    "com.decompozr.icloud-plugin",
    "local.icloud-mail-mcp",
    ...roots.map(
      (root) => "local.icloud-plugin." + Bun.hash(root).toString(16),
    ),
    ...(service &&
    /^local\.icloud-(?:plugin\.[a-z0-9]+|mail-mcp)$/.test(service)
      ? [service]
      : []),
  ]);
  const probe =
    deps.probe ??
    ((label: string) => {
      try {
        const output = execFileSync(
          "/bin/launchctl",
          ["print", `gui/${uid}/${label}`],
          {
            encoding: "utf8",
            timeout: 1500,
            maxBuffer: 65536,
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        const value = /^\s*pid = (\d+)\s*$/m.exec(output);
        return { present: true, pid: value ? Number(value[1]) : undefined };
      } catch (e) {
        const error = e as { stderr?: string; code?: string };
        if (String(error.stderr ?? "").includes("Could not find service"))
          return { present: false };
        throw Error("RESET_SUPERVISION_UNKNOWN");
      }
    });
  const launcher=deps.launcherPid??(process.env.ICLOUD_SERVICE_LAUNCHER_PID?Number(process.env.ICLOUD_SERVICE_LAUNCHER_PID):undefined);
  if(launcher!==undefined){const parentOf=deps.parentOf??((child:number)=>Number(execFileSync("/bin/ps",["-p",String(child),"-o","ppid="],{encoding:"utf8",timeout:1500}).trim()));if(!Number.isSafeInteger(launcher)||launcher<2||parentOf(ppid)!==launcher)throw Error("RESET_SUPERVISION_UNKNOWN");}
  for (const label of labels) {
    const job = probe(label);
    if (job.present && (job.pid === pid || job.pid === ppid || (launcher !== undefined && job.pid === launcher)))
      return label==="com.decompozr.icloud-plugin"?"service":"supervisor";
    if (job.present) throw Error("RESET_SUPERVISION_UNKNOWN");
  }
  return process.env.ICLOUD_INSTALL_PREFIX?"service":"direct";
}
