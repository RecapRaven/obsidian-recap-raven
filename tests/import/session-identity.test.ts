import { describe, expect, it } from "vitest";
import { buildSessionIdentityIndex } from "../../src/import/session-identity";

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
});
