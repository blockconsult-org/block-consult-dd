/**
 * Encrypted credential store (API keys). Server-only.
 *
 * Desktop app: values are encrypted with the OS keychain through Electron
 * safeStorage (macOS Keychain, Windows DPAPI, libsecret/kwallet on Linux).
 * Browser setup: AES-256-GCM with a random per-install key kept in
 * BC_DATA_DIR/secret.key (mode 0600), or BC_SECRET_KEY when set.
 *
 * Plaintext is only returned to server code that calls a provider. API routes
 * expose presence and a short hint, never the value.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "./db";
import { getDesktopBridge } from "./desktop-bridge";
import { dataDir } from "./paths";

export type SecretScheme = "os-keychain" | "local-aes-gcm";

export interface SecretStatus {
  present: boolean;
  hint: string | null;
  scheme: SecretScheme | null;
  updatedAt: string | null;
  /** False when a stored value can no longer be decrypted (e.g. data copied from another machine). */
  readable: boolean;
}

const AES_PREFIX = "v1:";

async function readOrCreateLocalKey(): Promise<Buffer> {
  const fromEnv = process.env.BC_SECRET_KEY;
  if (fromEnv) {
    const key = /^[0-9a-f]{64}$/i.test(fromEnv) ? Buffer.from(fromEnv, "hex") : Buffer.from(fromEnv, "base64");
    if (key.length !== 32) throw new Error("BC_SECRET_KEY must be 32 bytes, hex- or base64-encoded");
    return key;
  }
  const dir = dataDir();
  const file = path.join(dir, "secret.key");
  try {
    const existing = await fs.readFile(file);
    if (existing.length === 32) return existing;
    throw new Error(`${file} is corrupt (expected 32 bytes)`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    await fs.writeFile(file, randomBytes(32), { mode: 0o600, flag: "wx" });
  } catch (err) {
    // Another request created it first; use theirs.
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
  return fs.readFile(file);
}

async function preferredScheme(): Promise<SecretScheme> {
  const bridge = getDesktopBridge();
  return bridge && (await bridge.encryptionAvailable()) ? "os-keychain" : "local-aes-gcm";
}

async function encrypt(name: string, plain: string, scheme: SecretScheme): Promise<string> {
  if (scheme === "os-keychain") {
    const bridge = getDesktopBridge();
    if (!bridge) throw new Error("OS keychain is only available in the desktop app");
    return bridge.encryptString(plain);
  }
  const key = await readOrCreateLocalKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(name, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return AES_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

async function decrypt(name: string, ciphertext: string, scheme: SecretScheme): Promise<string> {
  if (scheme === "os-keychain") {
    const bridge = getDesktopBridge();
    if (!bridge) throw new Error("This key was saved by the desktop app; open the desktop app or enter it again");
    return bridge.decryptString(ciphertext);
  }
  if (!ciphertext.startsWith(AES_PREFIX)) throw new Error("Unknown secret format");
  const raw = Buffer.from(ciphertext.slice(AES_PREFIX.length), "base64");
  const key = await readOrCreateLocalKey();
  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
  decipher.setAAD(Buffer.from(name, "utf8"));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

function hintFor(value: string): string {
  return value.length > 8 ? `…${value.slice(-4)}` : "…";
}

function isScheme(v: string): v is SecretScheme {
  return v === "os-keychain" || v === "local-aes-gcm";
}

export async function setSecret(name: string, value: string): Promise<SecretStatus> {
  const scheme = await preferredScheme();
  const ciphertext = await encrypt(name, value, scheme);
  const row = await prisma.secret.upsert({
    where: { name },
    create: { name, ciphertext, scheme, hint: hintFor(value) },
    update: { ciphertext, scheme, hint: hintFor(value) },
  });
  return { present: true, hint: row.hint, scheme, updatedAt: row.updatedAt.toISOString(), readable: true };
}

/** Plaintext secret, or null when absent. Throws when present but undecryptable. */
export async function getSecret(name: string): Promise<string | null> {
  const row = await prisma.secret.findUnique({ where: { name } });
  if (!row) return null;
  if (!isScheme(row.scheme)) throw new Error(`Unknown secret scheme for ${name}`);
  return decrypt(name, row.ciphertext, row.scheme);
}

export async function deleteSecret(name: string): Promise<void> {
  await prisma.secret.deleteMany({ where: { name } });
}

export async function secretStatus(name: string): Promise<SecretStatus> {
  const row = await prisma.secret.findUnique({ where: { name } });
  if (!row || !isScheme(row.scheme)) {
    return { present: false, hint: null, scheme: null, updatedAt: null, readable: false };
  }
  let readable = true;
  try {
    await decrypt(name, row.ciphertext, row.scheme);
  } catch {
    readable = false;
  }
  return { present: true, hint: row.hint, scheme: row.scheme, updatedAt: row.updatedAt.toISOString(), readable };
}

/** Where newly saved keys will be protected; shown in Settings. */
export async function secretStorageDescription(): Promise<{ scheme: SecretScheme; label: string }> {
  return (await preferredScheme()) === "os-keychain"
    ? { scheme: "os-keychain", label: "Encrypted with your operating system's keychain" }
    : { scheme: "local-aes-gcm", label: "Encrypted with a local key stored in the app's data folder" };
}
