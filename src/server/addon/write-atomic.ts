import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/** Writes a file so concurrent readers see the old or the new content, never a partial one. */
export async function writeAtomic(file: string, data: Uint8Array | string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}
