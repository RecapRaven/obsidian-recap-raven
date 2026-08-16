const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const INVALID_SEGMENT_CHARACTER = /[<>:"/\\|?*]/g;
const URI_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBSIDIAN_CONFIG_DIRECTORY = `.${"obsidian"}`;

export const DEFAULT_IMPORT_ROOT = "Recap Raven";

export class UnsafeVaultPathError extends Error {
  constructor(message = "The configured import folder is not a safe vault path.") {
    super(message);
    this.name = "UnsafeVaultPathError";
  }
}

export function normalizeImportRoot(input: string): string {
  const value = input.normalize("NFKC").trim();
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[a-z]:/i.test(value) ||
    URI_SCHEME.test(value) ||
    hasUnsafeCharacter(value)
  ) {
    throw new UnsafeVaultPathError();
  }

  const segments = value.replace(/\\/g, "/").split("/");
  if (
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        segment.toLocaleLowerCase("en-US") === OBSIDIAN_CONFIG_DIRECTORY,
    )
  ) {
    throw new UnsafeVaultPathError();
  }

  return segments.map((segment) => sanitizePathSegment(segment, "Notes")).join("/");
}

export function sanitizePathSegment(input: string | null | undefined, fallback: string): string {
  let value = Array.from((input ?? "").normalize("NFKC"))
    .map((character) => (isUnsafeCodePoint(character.codePointAt(0) ?? 0) ? " " : character))
    .join("")
    .replace(INVALID_SEGMENT_CHARACTER, "-")
    .replace(/\s+/g, " ")
    .replace(/\s*-\s*/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[ .-]+|[ .-]+$/g, "");

  if (value === "" || value === "." || value === "..") {
    value = fallback;
  }
  if (WINDOWS_RESERVED_NAME.test(value) || value.toLocaleLowerCase("en-US") === OBSIDIAN_CONFIG_DIRECTORY) {
    value = `_${value}`;
  }

  const characters = Array.from(value);
  return characters.length <= 96 ? value : characters.slice(0, 96).join("").replace(/[ .-]+$/g, "");
}

export function sessionFilename(
  sessionNumber: number | null,
  title: string | null,
): string {
  const number = sessionNumber === null ? "Session" : `Session ${sessionNumber}`;
  const safeTitle = sanitizePathSegment(title, number);
  return safeTitle.toLocaleLowerCase("en-US") === number.toLocaleLowerCase("en-US")
    ? `${number}.md`
    : `${number} - ${safeTitle}.md`;
}

export function sessionNotePath(
  importRoot: string,
  campaignName: string,
  sessionNumber: number | null,
  title: string | null,
): string {
  const root = normalizeImportRoot(importRoot);
  const path = `${campaignFolderPath(importRoot, campaignName)}/Sessions/${sessionFilename(sessionNumber, title)}`;
  assertContainedPath(root, path);
  return path;
}

export function campaignFolderPath(importRoot: string, campaignName: string): string {
  const root = normalizeImportRoot(importRoot);
  const campaign = sanitizePathSegment(campaignName, "Campaign");
  const path = `${root}/${campaign}`;
  assertContainedPath(root, path);
  return path;
}

export function campaignIndexPath(importRoot: string, campaignName: string): string {
  return `${campaignFolderPath(importRoot, campaignName)}/Campaign index.md`;
}

export function collisionSessionPath(path: string, sessionId: string): string {
  if (!UUID.test(sessionId)) {
    throw new UnsafeVaultPathError("The session identifier is invalid.");
  }
  const suffix = sessionId.slice(0, 8).toLocaleLowerCase("en-US");
  const result = path.endsWith(".md") ? `${path.slice(0, -3)} [${suffix}].md` : `${path} [${suffix}]`;
  const root = path.split("/")[0] ?? "";
  assertContainedPath(root, result);
  return result;
}

export function parentFolder(path: string): string {
  const separator = path.lastIndexOf("/");
  if (separator < 1) {
    throw new UnsafeVaultPathError();
  }
  return path.slice(0, separator);
}

export function assertContainedPath(root: string, candidate: string): void {
  const normalizedRoot = normalizeSimplePath(root);
  const normalizedCandidate = normalizeSimplePath(candidate);
  if (
    normalizedCandidate === normalizedRoot ||
    !normalizedCandidate.startsWith(`${normalizedRoot}/`) ||
    normalizedCandidate
      .split("/")
      .some((segment) => segment === ".." || segment === OBSIDIAN_CONFIG_DIRECTORY)
  ) {
    throw new UnsafeVaultPathError();
  }
}

function normalizeSimplePath(value: string): string {
  return value.normalize("NFKC").replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\.\//, "");
}

function hasUnsafeCharacter(value: string): boolean {
  return Array.from(value).some((character) => isUnsafeCodePoint(character.codePointAt(0) ?? 0));
}

function isUnsafeCodePoint(codePoint: number): boolean {
  return (
    codePoint <= 0x1f ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069)
  );
}
