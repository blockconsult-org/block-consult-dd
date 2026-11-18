/**
 * Filesystem locations. Every path is resolved once from the environment so the
 * same code runs from the repo (`npm run dev`), a standalone server, and the
 * desktop app, which points these at the OS user-data folder.
 *
 * - STORAGE_DIR        generated reports and fetched source text
 * - BC_DATA_DIR        private app data (local encryption key)
 * - BC_MIGRATIONS_DIR  SQL migrations shipped with the build
 */
import path from "node:path";

export function storageRoot(): string {
  return path.resolve(process.env.STORAGE_DIR || "./storage");
}

export function dataDir(): string {
  return path.resolve(process.env.BC_DATA_DIR || "./.bc-data");
}

export function migrationsDir(): string {
  return path.resolve(process.env.BC_MIGRATIONS_DIR || path.join("prisma", "migrations"));
}

/**
 * Absolute path of the SQLite file behind a Prisma `file:` URL, or null for
 * other providers. Prisma resolves relative SQLite paths against the folder
 * that holds schema.prisma, so a relative URL is resolved against ./prisma.
 */
export function sqliteFileFromUrl(url: string): string | null {
  if (!url.startsWith("file:")) return null;
  const raw = url.slice("file:".length).split("?")[0] ?? "";
  if (!raw) return null;
  return path.isAbsolute(raw) ? raw : path.resolve("prisma", raw);
}

/** True when `child` resolves to a location inside `parent`. */
export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}
