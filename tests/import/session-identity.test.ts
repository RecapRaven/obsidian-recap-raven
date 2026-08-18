import { describe, expect, it } from "vitest";
import {
  buildSessionIdentityIndex,
  normalizeStoredSessionIdentities,
  sessionIdFromFrontmatter,
} from '../../src/import/session-identity';

const id = "123e4567-e89b-42d3-a456-426614174000";

describe("session identity index", () => {
  it("finds an imported session by frontmatter even after a note is renamed", () => {
    const index = buildSessionIdentityIndex([
      { path: "Renamed/by-the-user.md", frontmatter: { recap_raven_session_id: id } },
    ]);
    expect(index.has(id)).toBe(true);
    expect(index.paths(id)).toEqual(["Renamed/by-the-user.md"]);
  });

  it("tracks duplicate IDs without trusting invalid values", () => {
    const index = buildSessionIdentityIndex([
      { path: "one.md", frontmatter: { recap_raven_session_id: id } },
      { path: "two.md", frontmatter: { recap_raven_session_id: id.toUpperCase() } },
      { path: "bad.md", frontmatter: { recap_raven_session_id: "../../bad" } },
    ]);
    expect(index.paths(id)).toEqual(["one.md", "two.md"]);
    expect(index.has("../../bad")).toBe(false);
  });

  it('moves and deletes stored paths without changing the stable session identity', () => {
    const index = buildSessionIdentityIndex([], [{ sessionId: id, path: 'Recap Raven/Original.md' }]);

    expect(index.renamePath('Recap Raven/Original.md', 'Campaign notes/Renamed.md')).toBe(true);
    expect(index.paths(id)).toEqual(['Campaign notes/Renamed.md']);
    expect(index.removePath('Campaign notes/Renamed.md')).toBe(true);
    expect(index.has(id)).toBe(false);
  });

  it('rebases and removes every indexed note below a folder boundary', () => {
    const secondId = '223e4567-e89b-42d3-a456-426614174000';
    const index = buildSessionIdentityIndex([], [
      { sessionId: id, path: 'Recap Raven/Campaign/Sessions/One.md' },
      { sessionId: secondId, path: 'Recap Raven/Campaign/Sessions/Nested/Two.md' },
      { sessionId: secondId, path: 'Recap Raven/Campaign/Sessions-old/Unchanged.md' },
    ]);

    expect(index.renamePathsUnder('Recap Raven/Campaign/Sessions', 'Archive/Played')).toBe(true);
    expect(index.paths(id)).toEqual(['Archive/Played/One.md']);
    expect(index.paths(secondId)).toEqual([
      'Recap Raven/Campaign/Sessions-old/Unchanged.md',
      'Archive/Played/Nested/Two.md',
    ]);
    expect(index.removePathsUnder('Archive/Played')).toBe(true);
    expect(index.paths(id)).toEqual([]);
    expect(index.paths(secondId)).toEqual(['Recap Raven/Campaign/Sessions-old/Unchanged.md']);
  });

  it('reassigns a path when its frontmatter identity changes', () => {
    const replacement = '223e4567-e89b-42d3-a456-426614174000';
    const index = buildSessionIdentityIndex([], [{ sessionId: id, path: 'Recap Raven/Recap.md' }]);

    expect(index.add(replacement, 'Recap Raven/Recap.md')).toBe(true);
    expect(index.has(id)).toBe(false);
    expect(index.paths(replacement)).toEqual(['Recap Raven/Recap.md']);
  });

  it('bounds and validates untrusted persisted metadata', () => {
    expect(normalizeStoredSessionIdentities([
      { sessionId: id.toUpperCase(), path: 'Recap Raven/Valid.md' },
      { sessionId: id, path: '../Outside.md' },
      { sessionId: id, path: 'Recap Raven\\Windows.md' },
      { sessionId: 'not-an-id', path: 'Recap Raven/Invalid.md' },
      null,
    ])).toEqual([{ sessionId: id, path: 'Recap Raven/Valid.md' }]);
    expect(sessionIdFromFrontmatter({ recap_raven_session_id: id.toUpperCase() })).toBe(id);
    expect(sessionIdFromFrontmatter({ recap_raven_session_id: '../../bad' })).toBeNull();
  });
});
