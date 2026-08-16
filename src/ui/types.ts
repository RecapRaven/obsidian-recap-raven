export type PlannedImportState = 'new' | 'imported' | 'collision';

export interface PlannedImportItem {
  sessionId: string;
  title: string;
  sessionNumber: number | null;
  recordedAt: string | null;
  destinationPath: string;
  state: PlannedImportState;
  existingPath?: string;
}

export interface ImportPlan {
  campaignId: string;
  campaignName: string;
  items: PlannedImportItem[];
}

export interface ImportFailure {
  sessionId: string;
  title: string;
  message: string;
}

export interface ImportSummary {
  imported: Array<{ sessionId: string; title: string; path: string }>;
  skipped: Array<{ sessionId: string; title: string; path?: string; reason: string }>;
  failed: ImportFailure[];
  notAttempted: number;
}

export interface ImportProgress {
  current: number;
  total: number;
  title: string;
}

export type SelectionResult =
  | { action: 'cancel' }
  | { action: 'preview'; sessionIds: string[] }
  | { action: 'import'; sessionIds: string[] };
