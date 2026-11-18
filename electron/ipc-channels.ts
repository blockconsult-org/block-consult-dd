/**
 * Names shared by the main process and the preload script. Keep this file free
 * of Electron and Node imports: it is bundled into the sandboxed preload.
 */
export const IpcChannel = {
  openExternal: "bc:open-external",
  openDataFolder: "bc:open-data-folder",
  openLogsFolder: "bc:open-logs-folder",
} as const;

/** Renderer command-line switch that carries app.getVersion() into the preload. */
export const APP_VERSION_ARG = "--bc-app-version=";
