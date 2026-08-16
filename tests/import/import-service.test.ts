import { describe, expect, it, vi } from "vitest";
import type { Campaign, Session, SessionSummary } from "../../src/api/contract";
import {
  type CreateOnlyVault,
  SessionImportService,
} from "../../src/import/import-service";
import { buildSessionIdentityIndex } from "../../src/import/session-identity";
import { sha256Hex } from "../../src/utils/markdown";

const campaign: Campaign = {
  id: "223e4567-e89b-42d3-a456-426614174000",
  name: "Rime",
  updated_at: "2026-08-16T12:00:00Z",
  source_url: "https://recapraven.com/campaigns/223e4567-e89b-42d3-a456-426614174000",
};
const ids = [
  "123e4567-e89b-42d3-a456-426614174000",
  "323e4567-e89b-42d3-a456-426614174000",
  "423e4567-e89b-42d3-a456-426614174000",
] as const;

async function detail(id: string): Promise<Session> {
  const markdown = `# Session ${id.slice(0, 4)}\n`;
  return {
    id,
    campaign_id: campaign.id,
    session_number: 1,
    title: `Title ${id.slice(0, 4)}`,
    recorded_at: null,
    ready_at: "2026-08-16T12:00:00Z",
    artifact_created_at: "2026-08-16T12:01:00Z",
    source_url: `https://recapraven.com/recaps/${id}`,
    content_type: "text/markdown",
    markdown,
    content_sha256: await sha256Hex(new TextEncoder().encode(markdown)),
  };
}

function summary(id: string): SessionSummary {
  return { id, campaign_id: campaign.id } as SessionSummary;
}

function vault(existing: readonly string[] = []) {
  const created = new Map(existing.map((path) => [path, "existing"]));
  return {
    created,
    exists: vi.fn(async (path: string) => created.has(path)),
    ensureFolder: vi.fn(async () => undefined),
    createExclusive: vi.fn(async (path: string, content: string) => {
      if (created.has(path)) {
        return false;
      }
      created.set(path, content);
      return true;
    }),
  } satisfies CreateOnlyVault & { created: Map<string, string> };
}

describe("create-only session import", () => {
  it("skips a known UUID before downloading detail", async () => {
    const reader = { getSession: vi.fn(detail) };
    const store = vault();
    const service = new SessionImportService(
      reader,
      store,
      buildSessionIdentityIndex([{ path: "renamed.md", frontmatter: { recap_raven_session_id: ids[0] } }]),
    );
    const result = await service.importSessions(campaign, [summary(ids[0])], {
      importRoot: "Recap Raven",
      tags: [],
    });
    expect(result.skipped).toBe(1);
    expect(reader.getSession.mock.calls).toHaveLength(0);
    expect(store.createExclusive.mock.calls).toHaveLength(0);
  });

  it("validates and exclusively creates a new note", async () => {
    const store = vault();
    const service = new SessionImportService(
      { getSession: detail },
      store,
      buildSessionIdentityIndex([]),
    );
    const result = await service.importSessions(campaign, [summary(ids[0])], {
      importRoot: "Recap Raven",
      tags: ["recap"],
    });
    expect(result.imported).toBe(1);
    expect(result.total).toBe(1);
    expect(store.createExclusive.mock.calls).toHaveLength(1);
    expect([...store.created.values()][0]).toContain(`recap_raven_session_id: "${ids[0]}"`);
  });

  it("dry run performs no vault mutation", async () => {
    const store = vault();
    const service = new SessionImportService({ getSession: detail }, store, buildSessionIdentityIndex([]));
    const result = await service.importSessions(campaign, [summary(ids[0])], {
      importRoot: "Recap Raven",
      tags: [],
      dryRun: true,
    });
    expect(result.wouldImport).toBe(1);
    expect(store.ensureFolder.mock.calls).toHaveLength(0);
    expect(store.createExclusive.mock.calls).toHaveLength(0);
  });

  it("uses a stable suffix rather than overwriting a same-name note", async () => {
    const canonical = "Recap Raven/Rime/Sessions/Session 1 - Title 123e.md";
    const store = vault([canonical]);
    const service = new SessionImportService({ getSession: detail }, store, buildSessionIdentityIndex([]));
    const result = await service.importSessions(campaign, [summary(ids[0])], {
      importRoot: "Recap Raven",
      tags: [],
    });
    expect(result.items[0]?.path).toBe("Recap Raven/Rime/Sessions/Session 1 - Title 123e [123e4567].md");
    expect(store.created.get(canonical)).toBe("existing");
  });

  it("treats an atomic create race as skipped and never retries with an overwrite", async () => {
    const store = vault();
    store.createExclusive.mockResolvedValue(false);
    const service = new SessionImportService({ getSession: detail }, store, buildSessionIdentityIndex([]));
    const result = await service.importSessions(campaign, [summary(ids[0])], {
      importRoot: "Recap Raven",
      tags: [],
    });
    expect(result).toMatchObject({ imported: 0, skipped: 1 });
    expect(store.createExclusive.mock.calls).toHaveLength(1);
  });

  it("fails a cross-campaign summary before detail or vault access", async () => {
    const reader = { getSession: vi.fn(detail) };
    const store = vault();
    const service = new SessionImportService(reader, store, buildSessionIdentityIndex([]));
    const result = await service.importSessions(
      campaign,
      [{ ...summary(ids[0]), campaign_id: "523e4567-e89b-42d3-a456-426614174000" }],
      { importRoot: "Recap Raven", tags: [] },
    );
    expect(result.failed).toBe(1);
    expect(reader.getSession.mock.calls).toHaveLength(0);
    expect(store.exists.mock.calls).toHaveLength(0);
  });

  it("keeps successful notes and reports an individual failure", async () => {
    const store = vault();
    const reader = {
      getSession: vi.fn(async (id: string) => {
        if (id === ids[1]) throw new Error("detail unavailable");
        return detail(id);
      }),
    };
    const service = new SessionImportService(reader, store, buildSessionIdentityIndex([]));
    const result = await service.importSessions(campaign, ids.map(summary), {
      importRoot: "Recap Raven",
      tags: [],
    });
    expect(result).toMatchObject({ total: 3, imported: 2, failed: 1, stoppedEarly: false });
    expect(store.created.size).toBe(2);
  });

  it("stops after a classified authentication failure and redacts credentials", async () => {
    const reader = { getSession: vi.fn(async () => Promise.reject(new Error("401"))) };
    const service = new SessionImportService(reader, vault(), buildSessionIdentityIndex([]));
    const onProgress = vi.fn();
    const result = await service.importSessions(campaign, ids.map(summary), {
      importRoot: "Recap Raven",
      tags: [],
      classifyError: () => ({ message: "Key raven_obs_supersecret rejected", fatal: true }),
      onProgress,
    });
    expect(result).toMatchObject({ candidateTotal: 3, total: 1, remaining: 2, failed: 1, stoppedEarly: true });
    expect(result.items[0]?.reason).toBe("Key [credential redacted] rejected");
    expect(reader.getSession.mock.calls).toHaveLength(1);
    expect(onProgress.mock.calls).toEqual([[
      { current: 1, total: 3, summary: summary(ids[0]) },
    ]]);
  });

  it("does not run two batches concurrently", async () => {
    let release!: (value: Session) => void;
    const waiting = new Promise<Session>((resolve) => {
      release = resolve;
    });
    const service = new SessionImportService(
      { getSession: () => waiting },
      vault(),
      buildSessionIdentityIndex([]),
    );
    const first = service.importSessions(campaign, [summary(ids[0])], { importRoot: "Recap Raven", tags: [] });
    await expect(
      service.importSessions(campaign, [summary(ids[1])], { importRoot: "Recap Raven", tags: [] }),
    ).rejects.toThrow("already running");
    release(await detail(ids[0]));
    await first;
  });
});
