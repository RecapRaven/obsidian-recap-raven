import { describe, expect, it } from "vitest";
import {
  collisionSessionPath,
  campaignAlternateIndexPath,
  campaignIndexPath,
  campaignSessionsFolderPath,
  normalizeImportRoot,
  sanitizePathSegment,
  sessionNotePath,
  UnsafeVaultPathError,
} from "../../src/utils/paths";

describe("vault path policy", () => {
  it.each(["", "/tmp", "C:\\vault", "../outside", "safe/../outside", `.${"obsidian"}/plugins`, "https://evil.test"])(
    "rejects unsafe import root %s",
    (root) => expect(() => normalizeImportRoot(root)).toThrow(UnsafeVaultPathError),
  );

  it("normalizes a nested relative import root", () => {
    expect(normalizeImportRoot(" Campaigns / Recaps ")).toBe("Campaigns/Recaps");
  });

  it.each(["CON", "prn.md", "LPT9", "nul"])("neutralizes Windows reserved name %s", (name) => {
    expect(sanitizePathSegment(name, "Fallback")).toBe(`_${name}`);
  });

  it("removes separators, control characters, traversal and bidi controls from a segment", () => {
    expect(sanitizePathSegment("../bad\\name/\u202esecret\0", "Fallback")).toBe("bad-name-secret");
  });

  it("builds a contained deterministic note path", () => {
    expect(sessionNotePath("Recap Raven", "Glass/Archive", "2026-08-16T19:00:00Z", 7, "Midnight: Archive")).toBe(
      "Recap Raven/Glass-Archive/Sessions/2026-08-16 - Session 7 - Midnight-Archive.md",
    );
  });

  it("falls back to the session-first filename when the recorded date is unavailable", () => {
    expect(sessionNotePath("Recap Raven", "Glass Archive", null, 7, "Midnight Archive")).toBe(
      "Recap Raven/Glass Archive/Sessions/Session 7 - Midnight Archive.md",
    );
  });

  it("does not place an invalid recorded date in a filename", () => {
    expect(sessionNotePath("Recap Raven", "Glass Archive", "2026-02-30T19:00:00Z", 7, null)).toBe(
      "Recap Raven/Glass Archive/Sessions/Session 7.md",
    );
  });

  it("places a create-only campaign index outside the sessions folder", () => {
    expect(campaignIndexPath("Recap Raven", "Glass/Archive")).toBe(
      "Recap Raven/Glass-Archive/Campaign index.md",
    );
  });

  it("provides a deterministic alternate index path for an occupied user index", () => {
    expect(campaignAlternateIndexPath("Recap Raven", "Glass/Archive")).toBe(
      "Recap Raven/Glass-Archive/Campaign index (Recap Raven).md",
    );
  });

  it("provides the campaign sessions folder for the dynamic index query", () => {
    expect(campaignSessionsFolderPath("Recap Raven", "Glass/Archive")).toBe(
      "Recap Raven/Glass-Archive/Sessions",
    );
  });

  it("adds a stable UUID suffix for a collision", () => {
    expect(
      collisionSessionPath(
        "Recap Raven/Campaign/Sessions/Session.md",
        "123e4567-e89b-42d3-a456-426614174000",
      ),
    ).toBe("Recap Raven/Campaign/Sessions/Session [123e4567].md");
  });
});
