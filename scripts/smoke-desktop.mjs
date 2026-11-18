#!/usr/bin/env node
/**
 * Runs the desktop app once in smoke-test mode (BC_SMOKE_TEST=1) with a
 * throwaway data folder and exits with the app's result.
 *
 *   node scripts/smoke-desktop.mjs               electron . (after npm run desktop:prepare)
 *   node scripts/smoke-desktop.mjs --packaged    the unpacked app in release/
 *   node scripts/smoke-desktop.mjs --app <path>  a specific executable
 *   --keep                                       keep the data folder after a pass
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRODUCT_NAME = "Block Consult DD";
const TIMEOUT_MS = 180_000;

const argv = process.argv.slice(2);
const keep = argv.includes("--keep");
const appFlag = argv.indexOf("--app");
const explicitApp = appFlag >= 0 ? argv[appFlag + 1] : undefined;
if (appFlag >= 0 && !explicitApp) fail("--app needs the path of an executable");

function fail(message) {
  console.error(`[smoke] ${message}`);
  process.exit(1);
}

function packagedExecutable() {
  const release = path.join(root, "release");
  const byArch = (arm64Dir, x64Dir) => (process.arch === "arm64" ? [arm64Dir, x64Dir] : [x64Dir, arm64Dir]);
  let candidates;
  if (process.platform === "darwin") {
    candidates = [...byArch("mac-arm64", "mac"), "mac-universal"].map((dir) =>
      path.join(release, dir, `${PRODUCT_NAME}.app`, "Contents", "MacOS", PRODUCT_NAME),
    );
  } else if (process.platform === "win32") {
    candidates = byArch("win-arm64-unpacked", "win-unpacked").map((dir) => path.join(release, dir, `${PRODUCT_NAME}.exe`));
  } else {
    candidates = byArch("linux-arm64-unpacked", "linux-unpacked").map((dir) => path.join(release, dir, "block-consult-dd"));
  }
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) fail(`No packaged app in release/. Run npm run desktop:pack first. Looked for:\n  ${candidates.join("\n  ")}`);
  return found;
}

let command;
let commandArgs = [];
if (explicitApp) {
  command = path.resolve(explicitApp);
} else if (argv.includes("--packaged")) {
  command = packagedExecutable();
} else {
  if (!fs.existsSync(path.join(root, "dist-electron", "main.cjs"))) fail("dist-electron/main.cjs is missing. Run npm run desktop:prepare first.");
  command = createRequire(import.meta.url)("electron"); // the electron package exports the binary path
  commandArgs = [root];
}

// The space in the folder name exercises paths like "Application Support".
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "bc smoke-"));
const env = { ...process.env, BC_SMOKE_TEST: "1", BC_USER_DATA_DIR: userData };
delete env.ELECTRON_RUN_AS_NODE;

console.log(`[smoke] running ${command}${commandArgs.length > 0 ? ` ${commandArgs.join(" ")}` : ""}`);
console.log(`[smoke] data folder: ${userData}`);
const child = spawn(command, commandArgs, { env, stdio: ["ignore", "inherit", "inherit"] });
const timer = setTimeout(() => {
  console.error(`[smoke] no result after ${TIMEOUT_MS / 1000} s; stopping the app`);
  child.kill("SIGKILL");
}, TIMEOUT_MS);

child.on("error", (error) => {
  clearTimeout(timer);
  fail(`could not start the app: ${error.message}`);
});

child.on("exit", (code, signal) => {
  clearTimeout(timer);
  let result = null;
  try {
    result = JSON.parse(fs.readFileSync(path.join(userData, "logs", "smoke-test.json"), "utf8"));
  } catch {
    console.error("[smoke] the app wrote no smoke-test.json");
  }
  const passed = code === 0 && result?.ok === true;
  if (passed && !keep) fs.rmSync(userData, { recursive: true, force: true });
  else console.log(`[smoke] logs and results kept in ${userData}`);
  console.log(passed ? "[smoke] PASSED" : `[smoke] FAILED (exit ${code ?? signal})`);
  process.exit(passed ? 0 : 1);
});
