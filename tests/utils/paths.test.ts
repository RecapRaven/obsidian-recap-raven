import { describe, expect, it } from "vitest";
import {
  collisionSessionPath,
  campaignIndexPath,
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
    expect(sessionNotePath("Recap Raven", "Glass/Archive", 7, "Midnight: Archive")).toBe(
      "Recap Raven/Glass-Archive/Sessions/Session 7 - Midnight-Archive.md",
    );
  });

  it("places a create-only campaign index outside the sessions folder", () => {
    expect(campaignIndexPath("Recap Raven", "Glass/Archive")).toBe(
      "Recap Raven/Glass-Archive/Campaign index.md",
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
