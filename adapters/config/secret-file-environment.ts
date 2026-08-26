import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

const MAX_SECRET_BYTES = 16 * 1024;

/**
 * Resolve one deployment value from either NAME or NAME_FILE.
 *
 * File indirection keeps credentials out of Compose interpolation, container
 * metadata and process arguments. It is intentionally implemented in an
 * outer adapter so no deployment mechanism leaks into the domain.
 */
export async function readSecretFileEnvironment(
  name: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  const inline = environment[name]?.trim();
  const fileName = environment[`${name}_FILE`]?.trim();
  if (inline && fileName) throw new Error(`${name}_SOURCE_AMBIGUOUS`);
  if (inline) return inline;
  if (!fileName) return undefined;
  if (!isAbsolute(fileName) || fileName.includes("\0")) {
    throw new Error(`${name}_FILE_PATH_INVALID`);
  }
  const metadata = await stat(fileName);
  if (!metadata.isFile() || metadata.size < 1 || metadata.size > MAX_SECRET_BYTES) {
    throw new Error(`${name}_FILE_INVALID`);
  }
  const value = (await readFile(fileName, "utf8")).trim();
  if (!value || Buffer.byteLength(value, "utf8") > MAX_SECRET_BYTES) {
    throw new Error(`${name}_FILE_INVALID`);
  }
  return value;
}
