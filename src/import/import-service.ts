import type { Campaign, Session, SessionSummary } from "../api/contract";
import { buildSessionNote } from "../utils/frontmatter";
import {
  collisionSessionPath,
  parentFolder,
  sessionNotePath,
} from "../utils/paths";
import { validateSessionContent } from "../utils/markdown";
import type { SessionIdentityIndex } from "./session-identity";

export type ImportItemStatus = "imported" | "would-import" | "skipped" | "failed";

export interface ImportItemResult {
  readonly sessionId: string;
  readonly status: ImportItemStatus;
  readonly path?: string;
  readonly reason?: string;
}

export interface ImportBatchResult {
  readonly candidateTotal: number;
  readonly total: number;
  readonly remaining: number;
  readonly imported: number;
  readonly wouldImport: number;
  readonly skipped: number;
  readonly failed: number;
  readonly stoppedEarly: boolean;
  readonly items: readonly ImportItemResult[];
}

export interface RecapSessionReader {
  getSession(sessionId: string): Promise<Session>;
}

export interface CreateOnlyVault {
  exists(path: string): Promise<boolean>;
  ensureFolder(path: string): Promise<void>;
  /** Must perform an atomic exclusive create and return false when the path already exists. */
  createExclusive(path: string, content: string): Promise<boolean>;
}

export interface ImportErrorClassification {
  readonly message: string;
  readonly fatal: boolean;
}

export interface ImportProgressUpdate {
  readonly current: number;
  readonly total: number;
  readonly summary: SessionSummary;
}

export interface ImportOptions {
  readonly importRoot: string;
  readonly tags: readonly string[];
  readonly dryRun?: boolean;
  readonly classifyError?: (error: unknown) => ImportErrorClassification;
  readonly onProgress?: (progress: ImportProgressUpdate) => void;
}

export class SessionImportService {
  private running = false;

  constructor(
    private readonly reader: RecapSessionReader,
    private readonly vault: CreateOnlyVault,
    private readonly identities: SessionIdentityIndex,
  ) {}

  async importSessions(
    campaign: Campaign,
    summaries: readonly SessionSummary[],
    options: ImportOptions,
  ): Promise<ImportBatchResult> {
    if (this.running) {
      throw new Error("A Recap Raven import is already running.");
    }
    this.running = true;
    try {
      return await this.run(campaign, deduplicateSummaries(summaries), options);
    } finally {
      this.running = false;
    }
  }

  private async run(
    campaign: Campaign,
    summaries: readonly SessionSummary[],
    options: ImportOptions,
  ): Promise<ImportBatchResult> {
    const items: ImportItemResult[] = [];
    let stoppedEarly = false;

    for (const summary of summaries) {
      options.onProgress?.({
        current: items.length + 1,
        total: summaries.length,
        summary,
      });
      if (this.identities.has(summary.id)) {
        items.push({ sessionId: summary.id, status: "skipped", reason: "Already imported." });
        continue;
      }

      try {
        const result = await this.importOne(campaign, summary, options);
        items.push(result);
      } catch (error) {
        const classification = options.classifyError?.(error) ?? {
          message: "This recap could not be imported.",
          fatal: false,
        };
        items.push({ sessionId: summary.id, status: "failed", reason: safeErrorMessage(classification.message) });
        if (classification.fatal) {
          stoppedEarly = true;
          break;
        }
      }
    }

    return summarize(summaries.length, items, stoppedEarly);
  }

  private async importOne(
    campaign: Campaign,
    summary: SessionSummary,
    options: ImportOptions,
  ): Promise<ImportItemResult> {
    if (summary.campaign_id !== campaign.id) {
      throw new Error("The session is outside the credential-bound campaign.");
    }
    const session = await this.reader.getSession(summary.id);
    await validateSessionContent(session, summary.id, campaign.id);

    const canonicalPath = sessionNotePath(
      options.importRoot,
      campaign.name,
      session.session_number,
      session.title,
    );
    const path = (await this.vault.exists(canonicalPath))
      ? collisionSessionPath(canonicalPath, session.id)
      : canonicalPath;

    if (await this.vault.exists(path)) {
      return { sessionId: session.id, status: "skipped", path, reason: "A note already uses this path." };
    }
    if (options.dryRun === true) {
      return { sessionId: session.id, status: "would-import", path };
    }

    const note = buildSessionNote(session, campaign, options.tags);
    await this.vault.ensureFolder(parentFolder(path));
    const created = await this.vault.createExclusive(path, note);
    if (!created) {
      return { sessionId: session.id, status: "skipped", path, reason: "A note was created at this path." };
    }
    this.identities.add(session.id, path);
    return { sessionId: session.id, status: "imported", path };
  }
}

function deduplicateSummaries(summaries: readonly SessionSummary[]): readonly SessionSummary[] {
  const seen = new Set<string>();
  return summaries.filter((summary) => {
    const id = summary.id.toLocaleLowerCase("en-US");
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}

function summarize(
  candidateTotal: number,
  items: readonly ImportItemResult[],
  stoppedEarly: boolean,
): ImportBatchResult {
  const count = (status: ImportItemStatus): number => items.filter((item) => item.status === status).length;
  return {
    candidateTotal,
    total: items.length,
    remaining: candidateTotal - items.length,
    imported: count("imported"),
    wouldImport: count("would-import"),
    skipped: count("skipped"),
    failed: count("failed"),
    stoppedEarly,
    items,
  };
}

function safeErrorMessage(message: string): string {
  const withoutCredentials = message.replace(/raven_(?:obs|sk)_[A-Za-z0-9_-]+/g, "[credential redacted]");
  const printable = Array.from(withoutCredentials)
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f) ? " " : character;
    })
    .join("")
    .trim();
  return printable === "" ? "This recap could not be imported." : Array.from(printable).slice(0, 240).join("");
}
