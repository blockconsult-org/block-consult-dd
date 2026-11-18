#!/usr/bin/env node
/**
 * Desktop build: Next.js standalone server, Electron main/preload bundles and,
 * optionally, the installers for this OS and CPU.
 *
 *   node scripts/build-desktop.mjs              next build (BC_STANDALONE=1), assemble, bundle
 *   node scripts/build-desktop.mjs --skip-next  reuse the existing .next/standalone
 *   node scripts/build-desktop.mjs --package    also run electron-builder (installers)
 *   node scripts/build-desktop.mjs --dir        unpacked app only (implies --package)
 *
 * macOS signing: CSC_LINK + CSC_KEY_PASSWORD (or CSC_NAME for a keychain
 * identity); notarization additionally needs APPLE_ID,
 * APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID. Without a certificate the app
 * is signed ad hoc, without a trusted publisher identity, and notarization
 * is skipped. Windows signing: WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, ".next", "standalone");
const PRODUCT_NAME = "Block Consult DD";
const SIGNING_VARS = [
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "CSC_NAME",
  "WIN_CSC_LINK",
  "WIN_CSC_KEY_PASSWORD",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
  "APPLE_KEYCHAIN_PROFILE",
];
const NOTARIZATION_VARS = SIGNING_VARS.filter((name) => name.startsWith("APPLE_"));
// Files that must never ship inside the app: developer env files and local databases.
const SENSITIVE_FILE = [/^\.env(\..+)?$/, /\.(db|sqlite|sqlite3)$/i, /\.db-(journal|wal|shm)$/i, /\.db\.backup-/i];
// Only needed to install Electron (the electron package holds Electron.app,
// about 275 MB). Removed in case a traced dependency pulls them into the server;
// in the app, require("electron") always returns Electron's built-in module.
const INSTALLER_ONLY_PACKAGES = ["electron", "@electron/get", "@electron-internal"];

const argv = process.argv.slice(2);
const unknownArgs = argv.filter((arg) => !["--skip-next", "--package", "--dir"].includes(arg));
if (unknownArgs.length > 0) fail(`Unknown option(s): ${unknownArgs.join(" ")}`);
const skipNext = argv.includes("--skip-next");
const dirOnly = argv.includes("--dir");
const pack = dirOnly || argv.includes("--package");

function log(message) {
  console.log(`[desktop] ${message}`);
}

function fail(message) {
  console.error(`[desktop] ${message}`);
  process.exit(1);
}

function rel(file) {
  return path.relative(root, file) || ".";
}

function run(label, args, env) {
  log(`${label}...`);
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit", env });
  if (result.error) fail(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} failed (exit code ${result.status ?? result.signal})`);
}

function replaceDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) total += fs.statSync(full).size;
  }
  return total;
}

function megabytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function expectedPrismaEngine() {
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "libquery_engine-darwin-arm64.dylib.node" : "libquery_engine-darwin.dylib.node";
  }
  if (process.platform === "win32") return "query_engine-windows.dll.node";
  return null; // Linux: the file name depends on the distribution and OpenSSL version.
}

function isPrismaEngine(name) {
  return /^(lib)?query_engine-.+\.node$/.test(name);
}

function ensurePrismaClient() {
  const source = path.join(root, "node_modules", ".prisma", "client");
  const target = path.join(standalone, "node_modules", ".prisma", "client");
  if (!fs.existsSync(path.join(source, "index.js"))) fail("node_modules/.prisma/client is missing. Run `npx prisma generate` first.");
  if (!fs.existsSync(path.join(target, "index.js"))) {
    log("the generated Prisma client was not traced into the standalone build; copying it");
    fs.cpSync(source, target, { recursive: true });
  }
  for (const name of fs.readdirSync(source)) {
    if ((isPrismaEngine(name) || name === "schema.prisma") && !fs.existsSync(path.join(target, name))) {
      fs.copyFileSync(path.join(source, name), path.join(target, name));
      log(`copied ${name} into ${rel(target)}`);
    }
  }
  if (!fs.existsSync(path.join(standalone, "node_modules", "@prisma", "client", "package.json"))) {
    fail("@prisma/client is missing from .next/standalone/node_modules");
  }
  const engines = fs.readdirSync(target).filter(isPrismaEngine);
  const expected = expectedPrismaEngine();
  if (expected ? !engines.includes(expected) : engines.length === 0) {
    fail(
      `The Prisma query engine for ${process.platform}-${process.arch}${expected ? ` (${expected})` : ""} is missing ` +
        `(found: ${engines.join(", ") || "none"}). Run \`npx prisma generate\` on this machine.`,
    );
  }
  log(`Prisma query engine: ${engines.join(", ")}`);
}

// The root package.json has "type": "module" and Next copies it into the
// standalone folder; Next then emits server.js as ESM and marks its compiled
// output CommonJS with .next/package.json. main.ts loads that output with
// require(), so check the marker is present.
function ensureCommonJsMarker() {
  const marker = path.join(standalone, ".next", "package.json");
  let type = null;
  try {
    type = JSON.parse(fs.readFileSync(marker, "utf8")).type;
  } catch {
    // Missing or unreadable: rewrite below.
  }
  if (type !== "commonjs") {
    fs.writeFileSync(marker, `${JSON.stringify({ type: "commonjs" })}\n`);
    log(`wrote ${rel(marker)} with "type": "commonjs"`);
  }
}

function removeSensitiveFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") removeSensitiveFiles(full);
    } else if (SENSITIVE_FILE.some((pattern) => pattern.test(entry.name))) {
      fs.rmSync(full, { force: true });
      log(`removed ${rel(full)} (must not ship in the app)`);
    }
  }
}

function assembleStandalone() {
  for (const required of ["server.js", ".next/required-server-files.json", ".next/BUILD_ID", "node_modules/next/package.json"]) {
    if (!fs.existsSync(path.join(standalone, required))) {
      fail(
        `${rel(path.join(standalone, required))} is missing. Build with BC_STANDALONE=1 and keep ` +
          "outputFileTracingRoot at the project root so the server lands directly in .next/standalone.",
      );
    }
  }
  replaceDir(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"));
  if (fs.existsSync(path.join(root, "public"))) replaceDir(path.join(root, "public"), path.join(standalone, "public"));
  // File tracing copies the whole prisma/ folder (seed script, local databases).
  // The server needs only the schema and the migrations.
  const prismaOut = path.join(standalone, "prisma");
  fs.rmSync(prismaOut, { recursive: true, force: true });
  replaceDir(path.join(root, "prisma", "migrations"), path.join(prismaOut, "migrations"));
  fs.copyFileSync(path.join(root, "prisma", "schema.prisma"), path.join(prismaOut, "schema.prisma"));
  ensurePrismaClient();
  ensureCommonJsMarker();
  removeSensitiveFiles(standalone);
  // Runtime caches left by an earlier `electron .` run must not ship.
  fs.rmSync(path.join(standalone, ".next", "cache"), { recursive: true, force: true });
  for (const name of INSTALLER_ONLY_PACKAGES) {
    const dir = path.join(standalone, "node_modules", name);
    if (!fs.existsSync(dir)) continue;
    fs.rmSync(dir, { recursive: true, force: true });
    log(`removed ${rel(dir)} (only used to install Electron)`);
  }
  log(`standalone server assembled: ${megabytes(dirSize(standalone))} in ${rel(standalone)}`);
}

async function bundleElectron() {
  const outdir = path.join(root, "dist-electron");
  fs.rmSync(outdir, { recursive: true, force: true });
  await esbuild({
    absWorkingDir: root,
    entryPoints: { main: "electron/main.ts", preload: "electron/preload.ts" },
    outdir,
    outExtension: { ".js": ".cjs" },
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24", // Electron 45 ships Node 24
    external: ["electron"],
    legalComments: "none",
    logLevel: "warning",
  });
  log(`bundled the Electron main process and preload into ${rel(outdir)}/`);
}

function ensureIcon() {
  if (!fs.existsSync(path.join(root, "build", "icon.png"))) {
    run("generating build/icon.png", [path.join(root, "scripts", "generate-icon.mjs")], process.env);
  }
}

function packageApp() {
  const builderCli = path.join(root, "node_modules", "electron-builder", "cli.js");
  if (!fs.existsSync(builderCli)) fail("electron-builder is not installed");
  // npm versions that require explicit install-script approval may leave the
  // Electron package present without its platform binary.
  if (!fs.existsSync(path.join(root, "node_modules", "electron", "dist"))) {
    run("install the matching Electron binary", [path.join(root, "node_modules", "electron", "install.js")], process.env);
  }
  const platformFlag = { darwin: "--mac", win32: "--win", linux: "--linux" }[process.platform];
  if (!platformFlag) fail(`Unsupported build platform: ${process.platform}`);
  // Native files (Prisma engine, sharp) match the build machine, so build for its CPU only.
  const args = [builderCli, platformFlag, process.arch === "arm64" ? "--arm64" : "--x64", "--publish", "never"];
  if (dirOnly) args.push("--dir");

  const env = { ...process.env };
  for (const name of SIGNING_VARS) if (!env[name]?.trim()) delete env[name];
  if (process.platform === "darwin" && !env.CSC_LINK && !env.CSC_NAME) {
    args.push("--config.mac.identity=-");
    for (const name of NOTARIZATION_VARS) delete env[name];
    log("no signing certificate (CSC_LINK / CSC_NAME): signing ad hoc, notarization skipped");
  }
  run(`electron-builder ${args.slice(1).join(" ")}`, args, env);

  const unpackedDir =
    process.platform === "darwin"
      ? path.join(root, "release", process.arch === "arm64" ? "mac-arm64" : "mac", `${PRODUCT_NAME}.app`)
      : path.join(root, "release", `${process.platform === "win32" ? "win" : "linux"}${process.arch === "arm64" ? "-arm64" : ""}-unpacked`);
  if (fs.existsSync(unpackedDir)) log(`app: ${rel(unpackedDir)} (${megabytes(dirSize(unpackedDir))})`);
}

if (skipNext) {
  if (!fs.existsSync(standalone)) fail(".next/standalone does not exist; run without --skip-next");
  log("reusing the existing .next/standalone");
} else {
  run("next build (standalone output)", [path.join(root, "node_modules", "next", "dist", "bin", "next"), "build"], {
    ...process.env,
    BC_STANDALONE: "1",
  });
}
assembleStandalone();
await bundleElectron();
if (pack) {
  ensureIcon();
  packageApp();
}
log("done");
