const SESSION_ID_PROPERTY = 'recap_raven_session_id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_RECORDS = 10_000;
const MAX_PATH_LENGTH = 1_024;

export interface NoteMetadata {
  readonly path: string;
  readonly frontmatter: Readonly<Record<string, unknown>> | null;
}

/** The minimum private metadata needed to recognise a note without reading its contents. */
export interface StoredSessionIdentity {
  readonly sessionId: string;
  readonly path: string;
}

export interface SessionIdentityIndex {
  has(sessionId: string): boolean;
  hasPath(path: string): boolean;
  add(sessionId: string, path: string): boolean;
  removePath(path: string): boolean;
  removePathsUnder(rootPath: string): boolean;
  renamePath(oldPath: string, newPath: string): boolean;
  renamePathsUnder(oldRootPath: string, newRootPath: string): boolean;
  paths(sessionId: string): readonly string[];
  entries(): readonly StoredSessionIdentity[];
}

export function buildSessionIdentityIndex(
  notes: readonly NoteMetadata[] = [],
  stored: readonly StoredSessionIdentity[] = [],
): SessionIdentityIndex {
  const byId = new Map<string, Set<string>>();
  const byPath = new Map<string, string>();

  const removePath = (path: string): boolean => {
    const existingId = byPath.get(path);
    if (existingId === undefined) return false;
    const paths = byId.get(existingId);
    paths?.delete(path);
    if (paths?.size === 0) byId.delete(existingId);
    byPath.delete(path);
    return true;
  };

  const add = (sessionId: string, path: string): boolean => {
    const id = normalizeSessionId(sessionId);
    if (id === null || !isSafeStoredPath(path)) return false;
    if (byPath.get(path) === id) return false;
    removePath(path);
    const paths = byId.get(id) ?? new Set<string>();
    paths.add(path);
    byId.set(id, paths);
    byPath.set(path, id);
    return true;
  };

  for (const identity of stored.slice(0, MAX_RECORDS)) add(identity.sessionId, identity.path);
  for (const note of notes.slice(0, MAX_RECORDS)) {
    const sessionId = sessionIdFromFrontmatter(note.frontmatter);
    if (sessionId !== null) add(sessionId, note.path);
  }

  return {
    has: (sessionId) => {
      const id = normalizeSessionId(sessionId);
      return id !== null && byId.has(id);
    },
    hasPath: (path) => byPath.has(path),
    add,
    removePath,
    removePathsUnder: (rootPath) => {
      if (!isSafeVaultPath(rootPath, false)) return false;
      const prefix = `${rootPath}/`;
      let changed = false;
      for (const path of [...byPath.keys()]) {
        if (path.startsWith(prefix)) changed = removePath(path) || changed;
      }
      return changed;
    },
    renamePath: (oldPath, newPath) => {
      const id = byPath.get(oldPath);
      if (id === undefined || oldPath === newPath || !isSafeStoredPath(newPath)) return false;
      removePath(oldPath);
      add(id, newPath);
      return true;
    },
    renamePathsUnder: (oldRootPath, newRootPath) => {
      if (oldRootPath === newRootPath
        || !isSafeVaultPath(oldRootPath, false)
        || !isSafeVaultPath(newRootPath, false)) return false;
      const oldPrefix = `${oldRootPath}/`;
      const moves = [...byPath.entries()]
        .filter(([path]) => path.startsWith(oldPrefix))
        .map(([path, sessionId]) => ({
          oldPath: path,
          newPath: `${newRootPath}/${path.slice(oldPrefix.length)}`,
          sessionId,
        }));
      if (moves.length === 0 || moves.some(({ newPath }) => !isSafeStoredPath(newPath))) return false;
      for (const { oldPath } of moves) removePath(oldPath);
      for (const { newPath, sessionId } of moves) add(sessionId, newPath);
      return true;
    },
    paths: (sessionId) => {
      const id = normalizeSessionId(sessionId);
      return id === null ? [] : [...(byId.get(id) ?? [])];
    },
    entries: () => [...byId.entries()]
      .flatMap(([sessionId, paths]) => [...paths].map((path) => ({ sessionId, path })))
      .sort((left, right) => left.sessionId.localeCompare(right.sessionId) || left.path.localeCompare(right.path)),
  };
}

export function normalizeStoredSessionIdentities(value: unknown): readonly StoredSessionIdentity[] {
  if (!Array.isArray(value)) return [];
  const identities: StoredSessionIdentity[] = [];
  for (const candidate of value.slice(0, MAX_RECORDS)) {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const record = candidate as Readonly<Record<string, unknown>>;
    const id = typeof record.sessionId === 'string' ? normalizeSessionId(record.sessionId) : null;
    if (id !== null && typeof record.path === 'string' && isSafeStoredPath(record.path)) {
      identities.push({ sessionId: id, path: record.path });
    }
  }
  return identities;
}

export function sessionIdFromFrontmatter(
  frontmatter: Readonly<Record<string, unknown>> | null | undefined,
): string | null {
  const value = frontmatter?.[SESSION_ID_PROPERTY];
  return typeof value === 'string' ? normalizeSessionId(value) : null;
}

function normalizeSessionId(value: string): string | null {
  return UUID.test(value) ? value.toLocaleLowerCase('en-US') : null;
}

function isSafeStoredPath(path: string): boolean {
  return isSafeVaultPath(path, true);
}

function isSafeVaultPath(path: string, requireMarkdown: boolean): boolean {
  return path.length > (requireMarkdown ? 3 : 0)
    && path.length <= MAX_PATH_LENGTH
    && (!requireMarkdown || path.endsWith('.md'))
    && !path.startsWith('/')
    && !path.includes('\\')
    && !/^[a-z]:/iu.test(path)
    && !Array.from(path).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
    && !path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}
