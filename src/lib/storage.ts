/**
 * Local file storage for generated artifacts (HTML/PDF/Markdown/manifest) and
 * fetched source text. Paths are stored relative to the storage root so a data
 * folder can move between machines or app versions.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { isInside, storageRoot } from "./paths";

const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function assertSafeSegment(segment: string): void {
  if (!SAFE_SEGMENT.test(segment) || segment === "." || segment === "..") {
    throw new Error(`Unsafe storage path segment: ${segment}`);
  }
}

export async function writeArtifact(
  caseId: string,
  filename: string,
  data: string | Buffer,
  subdir?: string,
): Promise<{ path: string; sizeBytes: number }> {
  assertSafeSegment(caseId);
  assertSafeSegment(filename);
  if (subdir) assertSafeSegment(subdir);
  const rel = subdir ? path.join(caseId, subdir, filename) : path.join(caseId, filename);
  const full = path.join(storageRoot(), rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  const stat = await fs.stat(full);
  return { path: rel.split(path.sep).join("/"), sizeBytes: stat.size };
}

/**
 * Read an artifact by its stored path. Rows written before paths became
 * storage-relative hold a cwd-relative path such as `storage/<case>/<file>`;
 * those still resolve. Anything outside the storage root is refused.
 */
export async function readArtifact(storedPath: string): Promise<Buffer> {
  const root = storageRoot();
  const candidates = [path.resolve(root, storedPath), path.resolve(storedPath)];
  for (const full of candidates) {
    if (!isInside(root, full)) continue;
    try {
      return await fs.readFile(full);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
  throw new Error("Artifact not found in storage");
}

export async function deleteCaseStorage(caseId: string): Promise<void> {
  assertSafeSegment(caseId);
  await fs.rm(path.join(storageRoot(), caseId), { recursive: true, force: true });
}
