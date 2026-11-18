/**
 * Electron main process for Block Consult DD.
 *
 * Startup: resolve the data folder, install the desktop bridge on
 * globalThis.__bcDesktop, start the Next.js standalone server inside this
 * process on 127.0.0.1 (route handlers share this V8 context), wait for
 * /api/health, set the per-launch session cookie, then open the window.
 * BC_SMOKE_TEST=1 runs smoke-test.ts instead of opening a window.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  BrowserWindow,
  Menu,
  app,
  dialog,
  ipcMain,
  session,
  shell,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
  type WebContents,
} from "electron";
import { createDesktopBridge, isPdfRendererContents } from "./bridge";
import { APP_VERSION_ARG, IpcChannel } from "./ipc-channels";
import { installFileLogging } from "./logging";
import { findFreePort, findPrismaEngine, startNextServer, waitForHealth, withTimeout } from "./server";
import { runSmokeTest, smokeFailure, writeSmokeResult, type KeychainMode } from "./smoke-test";

const processStart = Date.now();
const HOST = "127.0.0.1";
const SESSION_COOKIE = "bc_session";
const APP_ID = "com.blockconsult.dd";
const SERVER_START_TIMEOUT_MS = 60_000;
const HEALTH_TIMEOUT_MS = 30_000;
const ALLOWED_PERMISSIONS = new Set<string>(["clipboard-read", "clipboard-sanitized-write", "fullscreen"]);
const isSmokeTest = process.env.BC_SMOKE_TEST === "1";

// Next.js patches globalThis.fetch when it loads; main-process checks use the original.
const nodeFetch: typeof fetch = globalThis.fetch.bind(globalThis);

// BC_USER_DATA_DIR points the app at another data folder (smoke tests, support).
const userDataOverride = process.env.BC_USER_DATA_DIR?.trim();
if (userDataOverride) {
  const dir = path.resolve(userDataOverride);
  fs.mkdirSync(dir, { recursive: true });
  app.setPath("userData", dir);
  app.setPath("sessionData", dir);
}
const userData = app.getPath("userData");
const logsDir = path.join(userData, "logs");
app.setAppLogsPath(logsDir);
const logger = installFileLogging(logsDir);

// A smoke run must not create keychain items or block on a keychain prompt.
const keychain: KeychainMode =
  isSmokeTest && process.platform === "darwin" && process.env.BC_SMOKE_REAL_KEYCHAIN !== "1" ? "mock" : "system";
if (keychain === "mock") app.commandLine.appendSwitch("use-mock-keychain");

app.enableSandbox();
if (process.platform === "win32") app.setAppUserModelId(APP_ID);

let appOrigin: string | null = null;
let serverReady = false;
let mainWindow: BrowserWindow | null = null;

const logUncaughtException = (error: unknown): void => {
  console.error("[main] uncaught exception:", error);
};
const logUnhandledRejection = (reason: unknown): void => {
  console.error("[main] unhandled promise rejection:", reason);
};

if (app.requestSingleInstanceLock()) {
  bootstrap();
} else {
  console.warn("[main] another instance already uses this data folder; exiting");
  app.exit(isSmokeTest ? 1 : 0);
}

function bootstrap(): void {
  console.info(
    `[main] Block Consult DD ${app.getVersion()} (Electron ${process.versions.electron}, ${process.platform}-${process.arch}${app.isPackaged ? "" : ", unpackaged"})`,
  );
  console.info(`[main] data folder: ${userData}`);
  // Next.js installs its own handlers once it runs; these cover startup.
  process.on("uncaughtException", logUncaughtException);
  process.on("unhandledRejection", logUnhandledRejection);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => app.quit());

  registerNavigationGuards();
  registerIpcHandlers();
  app.on("second-instance", () => focusMainWindow());
  app.on("activate", () => focusMainWindow());
  app.on("window-all-closed", () => {
    // macOS apps stay running without windows; the smoke test manages its own exit.
    if (!isSmokeTest && process.platform !== "darwin") app.quit();
  });

  startApp().catch(handleStartupFailure);
}

async function startApp(): Promise<void> {
  await app.whenReady();
  if (!isSmokeTest) Menu.setApplicationMenu(buildAppMenu());

  const serverDir = resolveServerDir();
  const port = await findFreePort(HOST);
  const token = randomBytes(32).toString("hex");
  const origin = `http://${HOST}:${port}`;
  appOrigin = origin;
  const databaseFile = configureServerEnvironment(serverDir, port, token);

  // Route handlers read the bridge as soon as they run, so it must exist before Next loads.
  const bridge = createDesktopBridge(app.getVersion());
  globalThis.__bcDesktop = bridge;

  console.info(`[main] starting the server from ${serverDir} on ${origin}`);
  await withTimeout(
    startNextServer({ serverDir, hostname: HOST, port }),
    SERVER_START_TIMEOUT_MS,
    `The server did not start within ${SERVER_START_TIMEOUT_MS / 1000} s.`,
  );
  process.title = app.getName(); // Next.js renames the process to "next-server".
  const cookieHeader = `${SESSION_COOKIE}=${token}`;
  const health = await waitForHealth(origin, cookieHeader, HEALTH_TIMEOUT_MS, nodeFetch);
  process.off("uncaughtException", logUncaughtException);
  process.off("unhandledRejection", logUnhandledRejection);
  console.info(`[main] server ready after ${Date.now() - processStart} ms (bridge visible: ${health.desktop})`);

  installSessionPolicy();
  await session.defaultSession.cookies.set({
    url: origin,
    name: SESSION_COOKIE,
    value: token,
    path: "/",
    httpOnly: true,
    sameSite: "strict",
  });
  serverReady = true;

  if (isSmokeTest) {
    const result = await runSmokeTest(
      {
        origin,
        port,
        cookieHeader,
        bridge,
        databaseFile,
        logsDir,
        serverDir,
        keychain,
        webPreferences: appWebPreferences(),
        fetchImpl: nodeFetch,
      },
      processStart,
    );
    await writeSmokeResult(result, logsDir);
    app.exit(result.ok ? 0 : 1);
    return;
  }
  showMainWindow(origin);
}

function handleStartupFailure(error: unknown): void {
  console.error("[main] startup failed:", error);
  if (isSmokeTest) {
    void writeSmokeResult(smokeFailure(error, processStart, keychain), logsDir).finally(() => app.exit(1));
    return;
  }
  const reason = error instanceof Error ? error.message : String(error);
  dialog.showErrorBox(
    "Block Consult DD could not start",
    `The app's built-in server did not start.\n\n${reason}\n\nDetails are in the log file:\n${logger.file}`,
  );
  app.exit(1);
}

function resolveServerDir(): string {
  const dir = app.isPackaged
    ? path.join(process.resourcesPath, "server")
    : path.join(app.getAppPath(), ".next", "standalone");
  if (!fs.existsSync(path.join(dir, ".next", "required-server-files.json"))) {
    throw new Error(
      app.isPackaged
        ? `The server files are missing from the app (${dir}). Reinstall Block Consult DD.`
        : `No standalone server in ${dir}. Run "npm run desktop:prepare" first.`,
    );
  }
  return dir;
}

/** Sets the environment the server code reads. Returns the SQLite file path. */
function configureServerEnvironment(serverDir: string, port: number, token: string): string {
  // Next's types mark NODE_ENV read-only; the server reads it, so it must be set here.
  const env: Record<string, string | undefined> = process.env;
  const databaseFile = path.join(userData, "blockconsult.db");
  const storageDir = path.join(userData, "storage");
  const dataDir = path.join(userData, "data");
  // Case files and key material: readable by the current user only.
  fs.mkdirSync(storageDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

  delete env.APP_ACCESS_TOKEN;
  Object.assign(env, {
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: HOST,
    // Prisma accepts forward slashes on Windows; backslashes are not portable in a URL.
    DATABASE_URL: `file:${process.platform === "win32" ? databaseFile.replace(/\\/g, "/") : databaseFile}`,
    STORAGE_DIR: storageDir,
    BC_DATA_DIR: dataDir,
    BC_USER_DATA_DIR: userData,
    BC_MIGRATIONS_DIR: path.join(serverDir, "prisma", "migrations"),
    BC_SESSION_TOKEN: token,
    BC_EXPECTED_HOST: `${HOST}:${port}`,
    BC_DESKTOP: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    // Electron handles SIGINT/SIGTERM (see bootstrap); Next would call process.exit.
    NEXT_MANUAL_SIG_HANDLE: "true",
  });
  const engine = findPrismaEngine(serverDir);
  if (engine) env.PRISMA_QUERY_ENGINE_LIBRARY = engine;
  else console.warn(`[main] no Prisma query engine found under ${serverDir}; Prisma will search for one`);
  return databaseFile;
}

function appWebPreferences(extra: Electron.WebPreferences = {}): Electron.WebPreferences {
  return {
    preload: path.join(__dirname, "preload.cjs"),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    webSecurity: true,
    spellcheck: true,
    additionalArguments: [`${APP_VERSION_ARG}${app.getVersion()}`],
    ...extra,
  };
}

function showMainWindow(origin: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    focusWindow(mainWindow);
    return;
  }
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 640,
    show: false,
    backgroundColor: "#08090a",
    title: "Block Consult DD",
    webPreferences: appWebPreferences(),
  });
  mainWindow = win;
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[main] the window's renderer exited (${details.reason})`);
  });
  win.loadURL(`${origin}/`).catch((error: unknown) => console.error("[main] could not load the app UI:", error));
}

function focusWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function focusMainWindow(): void {
  if (isSmokeTest) return;
  if (mainWindow && !mainWindow.isDestroyed()) focusWindow(mainWindow);
  else if (serverReady && appOrigin) showMainWindow(appOrigin);
}

function isAppUrl(raw: string): boolean {
  if (!appOrigin) return false;
  try {
    return new URL(raw).origin === appOrigin;
  } catch {
    return false;
  }
}

function isWebUrl(raw: string): boolean {
  try {
    const { protocol } = new URL(raw);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

async function openExternalWebUrl(raw: string): Promise<void> {
  if (!isWebUrl(raw)) throw new Error("Only http and https links open outside the app");
  await shell.openExternal(raw);
}

function openExternalQuietly(raw: string): void {
  openExternalWebUrl(raw).catch((error: unknown) => console.warn(`[main] could not open ${raw}:`, error));
}

function windowOpenPolicy(contents: WebContents, url: string): Electron.WindowOpenHandlerResponse {
  if (isPdfRendererContents(contents)) return { action: "deny" };
  if (isAppUrl(url)) {
    // Report previews and PDFs (target=_blank) open in the same session; plugins turn on the PDF viewer.
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        width: 1200,
        height: 900,
        minWidth: 600,
        minHeight: 400,
        autoHideMenuBar: true,
        webPreferences: appWebPreferences({ plugins: true }),
      },
    };
  }
  if (isWebUrl(url)) openExternalQuietly(url);
  return { action: "deny" };
}

function showEditContextMenu(contents: WebContents, params: Electron.ContextMenuParams): void {
  if (isPdfRendererContents(contents)) return;
  const { isEditable, selectionText, editFlags } = params;
  if (!isEditable && !selectionText.trim()) return;
  const template: MenuItemConstructorOptions[] = isEditable
    ? [
        { role: "cut", enabled: editFlags.canCut },
        { role: "copy", enabled: editFlags.canCopy },
        { role: "paste", enabled: editFlags.canPaste },
        { type: "separator" },
        { role: "selectAll", enabled: editFlags.canSelectAll },
      ]
    : [{ role: "copy", enabled: editFlags.canCopy }];
  const win = BrowserWindow.fromWebContents(contents);
  Menu.buildFromTemplate(template).popup(win ? { window: win } : undefined);
}

function registerNavigationGuards(): void {
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => windowOpenPolicy(contents, url));
    contents.on("will-navigate", (event) => {
      if (isPdfRendererContents(contents)) {
        event.preventDefault();
        return;
      }
      if (isAppUrl(event.url)) return;
      event.preventDefault();
      if (isWebUrl(event.url)) openExternalQuietly(event.url);
    });
    contents.on("will-redirect", (event) => {
      if (isPdfRendererContents(contents)) {
        event.preventDefault();
        return;
      }
      if (!event.isMainFrame || isAppUrl(event.url)) return;
      event.preventDefault();
      if (isWebUrl(event.url)) openExternalQuietly(event.url);
    });
    contents.on("context-menu", (_event, params) => showEditContextMenu(contents, params));
  });
}

function installSessionPolicy(): void {
  const defaultSession = session.defaultSession;
  defaultSession.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(ALLOWED_PERMISSIONS.has(permission) && isAppUrl(details.requestingUrl));
  });
  defaultSession.setPermissionCheckHandler(
    (_contents, permission, requestingOrigin) => ALLOWED_PERMISSIONS.has(permission) && isAppUrl(requestingOrigin),
  );
}

function assertAppSender(event: IpcMainInvokeEvent): void {
  if (!isAppUrl(event.senderFrame?.url ?? "")) throw new Error("Rejected: the request did not come from the app window");
}

async function openFolder(dir: string): Promise<void> {
  fs.mkdirSync(dir, { recursive: true });
  const failure = await shell.openPath(dir);
  if (failure) throw new Error(failure);
}

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.openExternal, async (event, url: unknown) => {
    assertAppSender(event);
    if (typeof url !== "string" || url.length > 8192) throw new Error("openExternal expects a URL string");
    await openExternalWebUrl(url);
  });
  ipcMain.handle(IpcChannel.openDataFolder, async (event) => {
    assertAppSender(event);
    await openFolder(userData);
  });
  ipcMain.handle(IpcChannel.openLogsFolder, async (event) => {
    assertAppSender(event);
    await openFolder(logsDir);
  });
}

function buildAppMenu(): Menu {
  const openFolderItem = (label: string, dir: string): MenuItemConstructorOptions => ({
    label,
    click: () => {
      openFolder(dir).catch((error: unknown) => console.warn(`[main] could not open ${dir}:`, error));
    },
  });
  const viewMenu: MenuItemConstructorOptions[] = [
    { role: "reload" },
    { type: "separator" },
    { role: "resetZoom" },
    { role: "zoomIn" },
    { role: "zoomOut" },
    { type: "separator" },
    { role: "togglefullscreen" },
  ];
  if (!app.isPackaged) viewMenu.push({ type: "separator" }, { role: "toggleDevTools" });

  const template: MenuItemConstructorOptions[] = [];
  if (process.platform === "darwin") template.push({ role: "appMenu" });
  else template.push({ label: "File", submenu: [{ role: "quit" }] });
  template.push(
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { type: "separator" },
        { role: "selectAll" },
      ],
    },
    { label: "View", submenu: viewMenu },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [openFolderItem("Open data folder", userData), openFolderItem("Open logs folder", logsDir)],
    },
  );
  return Menu.buildFromTemplate(template);
}
