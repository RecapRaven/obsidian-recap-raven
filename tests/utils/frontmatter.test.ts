import { describe, expect, it } from "vitest";
import type { Campaign, Session } from "../../src/api/contract";
import {
  buildCampaignIndexNote,
  buildSessionNote,
  neutralizeExecutionDelimiters,
  normalizeTags,
} from "../../src/utils/frontmatter";

const campaign = {
  id: "223e4567-e89b-42d3-a456-426614174000",
  name: 'Night:\n---\nadmin: true',
  updated_at: "2026-08-16T12:00:00Z",
  source_url: "https://recapraven.com/campaigns/223e4567-e89b-42d3-a456-426614174000",
} as Campaign;

const session = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  campaign_id: campaign.id,
  session_number: 4,
  title: 'A: "quoted"\n---',
  recorded_at: null,
  ready_at: "2026-08-16T12:00:00Z",
  artifact_created_at: "2026-08-16T12:01:00Z",
  source_url: "https://recapraven.com/recaps/123e4567-e89b-42d3-a456-426614174000",
  content_type: "text/markdown",
  markdown: "# Safe recap\n",
  content_sha256: "a".repeat(64),
} as Session;

describe("frontmatter", () => {
  it("quotes every remote string so it cannot add YAML properties", () => {
    const note = buildSessionNote(session, campaign, ["#recap", 'x\nadmin: true']);
    const delimiterCount = note.split("\n").filter((line) => line === "---").length;

    expect(delimiterCount).toBe(2);
    expect(note).toContain('recap_raven_campaign: "Night:\\n---\\nadmin: true"');
    expect(note).toContain('title: "A: \\"quoted\\"\\n---"');
    expect(note).toContain('tags: ["recap","x\\nadmin: true"]');
    expect(note.endsWith(session.markdown)).toBe(true);
  });

  it("normalizes, deduplicates and bounds configured tags", () => {
    const tags = Array.from({ length: 40 }, (_, index) => `#tag-${index}`);
    expect(normalizeTags(["#recap", "recap", "", ...tags])).toHaveLength(32);
    expect(normalizeTags(["#recap", "recap"])).toEqual(["recap"]);
    expect(normalizeTags(["x".repeat(65)])).toEqual([]);
  });

  it("builds a safe deterministic campaign index with a scoped vault query", () => {
    const note = buildCampaignIndexNote(campaign, "Recap Raven/Night/Sessions");
    expect(note).toContain('recap_raven_campaign: "Night:\\n---\\nadmin: true"');
    expect(note).toContain("# Night: \\-\\-\\- admin: true");
    expect(note).toContain("[Open campaign in Recap Raven](https://recapraven.com/campaigns/223e4567-e89b-42d3-a456-426614174000)");
    expect(note).toContain('```query\npath:"Recap Raven/Night/Sessions"\n```');
    expect(note.split("\n").filter((line) => line === "---")).toHaveLength(2);
  });

  it("neutralizes Templater and Dataview delimiters in every persisted remote label", () => {
    const hostileCampaign = { ...campaign, name: "<% run %> {{x}} {% y %} $=dv.current() `= query`" };
    const hostileSession = { ...session, title: "<% title %> $=evil() `= inline`" };
    const note = buildSessionNote(hostileSession, hostileCampaign, ["<% tag %>", "$=tag"]);
    const index = buildCampaignIndexNote(hostileCampaign, "Recap Raven/Safe/Sessions");

    for (const value of [note, index]) {
      expect(value).not.toContain("<%");
      expect(value).not.toContain("{{");
      expect(value).not.toContain("{%");
      expect(value).not.toContain("$=");
      expect(value).not.toMatch(/`\s*=/);
    }
    expect(neutralizeExecutionDelimiters("safe label")).toBe("safe label");
  });

  it("keeps the campaign index query inside its generated code fence", () => {
    const index = buildCampaignIndexNote(
      campaign,
      'Recap Raven/Bad"\\`\n```query\npath:"Outside"/Sessions',
    );

    expect(index.match(/```/gu)).toHaveLength(2);
    const queryPathLine = index.split("\n").find((line) => line.startsWith('path:"'));
    expect(queryPathLine).toBeDefined();
    expect(queryPathLine).not.toContain("`");
    expect(queryPathLine).not.toContain("\\");
    expect(queryPathLine?.match(/"/gu)).toHaveLength(2);
  });
});
