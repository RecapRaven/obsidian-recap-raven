const SESSION_ID_PROPERTY = "recap_raven_session_id";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface NoteMetadata {
  readonly path: string;
  readonly frontmatter: Readonly<Record<string, unknown>> | null;
}

export interface SessionIdentityIndex {
  has(sessionId: string): boolean;
  add(sessionId: string, path: string): void;
  paths(sessionId: string): readonly string[];
}

export function buildSessionIdentityIndex(notes: readonly NoteMetadata[]): SessionIdentityIndex {
  const byId = new Map<string, string[]>();
  for (const note of notes) {
    const value = note.frontmatter?.[SESSION_ID_PROPERTY];
    if (typeof value !== "string" || !UUID.test(value)) {
      continue;
    }
    const id = value.toLocaleLowerCase("en-US");
    const paths = byId.get(id) ?? [];
    paths.push(note.path);
    byId.set(id, paths);
  }

  return {
    has: (sessionId) => byId.has(sessionId.toLocaleLowerCase("en-US")),
    add: (sessionId, path) => {
      const id = sessionId.toLocaleLowerCase("en-US");
      const paths = byId.get(id) ?? [];
      if (!paths.includes(path)) {
        paths.push(path);
      }
      byId.set(id, paths);
    },
    paths: (sessionId) => [...(byId.get(sessionId.toLocaleLowerCase("en-US")) ?? [])],
  };
}
