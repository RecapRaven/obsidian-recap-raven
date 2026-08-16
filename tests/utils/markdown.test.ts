import { describe, expect, it } from "vitest";
import type { Session } from "../../src/api/contract";
import {
  isTrustedRecapSource,
  sha256Hex,
  UnsafeSessionContentError,
  validateSessionContent,
} from "../../src/utils/markdown";

const sessionId = "123e4567-e89b-42d3-a456-426614174000";
const campaignId = "223e4567-e89b-42d3-a456-426614174000";

async function session(markdown = "# Safe recap\n"): Promise<Session> {
  return {
    id: sessionId,
    campaign_id: campaignId,
    session_number: 1,
    title: "Safe",
    recorded_at: null,
    ready_at: "2026-08-16T12:00:00Z",
    artifact_created_at: "2026-08-16T12:01:00Z",
    source_url: `https://recapraven.com/recaps/${sessionId}`,
    content_type: "text/markdown",
    markdown,
    content_sha256: await sha256Hex(new TextEncoder().encode(markdown)),
  };
}

describe("session Markdown safety", () => {
  it("accepts matching inert Markdown", async () => {
    await expect(validateSessionContent(await session(), sessionId, campaignId)).resolves.toBeUndefined();
  });

  it.each([
    "<script>alert(1)</script>",
    "[[Other note]]",
    "![[embed]]",
    "[click](javascript:alert(1))",
    "[local](../../Private.md)",
    "![](//attacker.example/pixel)",
    "[obfuscated](&#x68;ttps://attacker.example)",
    "[reference][target]\n[target]: ../../Private.md",
    "https://evil.test",
    "\\https://evil.test",
    "\\obsidian://open?vault=secret",
    "\\javascript:alert(1)",
    "\\data:text/html,evil",
    "\\file:///etc/passwd",
    "{{template}}",
    "<% templater %>",
    "```dataview\nTABLE\n```",
    "~~~dataviewjs\ndv.table([])\n~~~",
    "vscode://file/etc/passwd",
    "[open](vscode://file/etc/passwd)",
    "$=dv.current()",
    "`= this.file.name`",
    "`$= dv.current()`",
  ])("rejects active content: %s", async (markdown) => {
    await expect(validateSessionContent(await session(markdown), sessionId, campaignId)).rejects.toBeInstanceOf(
      UnsafeSessionContentError,
    );
  });

  it("rejects a hash mismatch", async () => {
    const value = { ...(await session()), content_sha256: "0".repeat(64) } as Session;
    await expect(validateSessionContent(value, sessionId, campaignId)).rejects.toBeInstanceOf(
      UnsafeSessionContentError,
    );
  });

  it("rejects a response for another session or campaign", async () => {
    await expect(
      validateSessionContent(await session(), "323e4567-e89b-42d3-a456-426614174000", campaignId),
    ).rejects.toBeInstanceOf(UnsafeSessionContentError);
  });

  it.each([
    `https://evil.test/recaps/${sessionId}`,
    `http://recapraven.com/recaps/${sessionId}`,
    `https://recapraven.com.evil.test/recaps/${sessionId}`,
    `https://recapraven.com/recaps/${sessionId}?token=secret`,
    `https://user@recapraven.com/recaps/${sessionId}`,
  ])("rejects untrusted source URL %s", (source) => {
    expect(isTrustedRecapSource(source, sessionId)).toBe(false);
  });
});
