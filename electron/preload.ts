/**
 * Preload for app windows (sandboxed, context-isolated). Exposes a small,
 * fixed API as window.bcDesktop; the main process validates every argument.
 */
import { contextBridge, ipcRenderer } from "electron";
import { APP_VERSION_ARG, IpcChannel } from "./ipc-channels";

export type DesktopPlatform = "darwin" | "win32" | "linux";

export interface BcDesktopApi {
  isDesktop: true;
  platform: DesktopPlatform;
  appVersion: string;
  /** Opens an http(s) URL in the default browser. */
  openExternal(url: string): Promise<void>;
  openDataFolder(): Promise<void>;
  openLogsFolder(): Promise<void>;
}

function currentPlatform(): DesktopPlatform {
  const platform = process.platform;
  return platform === "darwin" || platform === "win32" ? platform : "linux";
}

function appVersionFromArgs(): string {
  const arg = process.argv.find((value) => value.startsWith(APP_VERSION_ARG));
  return arg ? arg.slice(APP_VERSION_ARG.length) : "";
}

async function invoke(channel: string, ...args: unknown[]): Promise<void> {
  await ipcRenderer.invoke(channel, ...args);
}

const api: BcDesktopApi = {
  isDesktop: true,
  platform: currentPlatform(),
  appVersion: appVersionFromArgs(),
  openExternal: (url) => invoke(IpcChannel.openExternal, url),
  openDataFolder: () => invoke(IpcChannel.openDataFolder),
  openLogsFolder: () => invoke(IpcChannel.openLogsFolder),
};

contextBridge.exposeInMainWorld("bcDesktop", api);
