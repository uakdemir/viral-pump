/**
 * Dashboard DTO types — derived from server route response shapes.
 *
 * These types model what the API actually returns (Drizzle select shapes + joins),
 * NOT the raw Drizzle schema types. JSONB fields use `unknown` unless the
 * dashboard accesses specific sub-fields, in which case we define a narrow
 * interface for those accessed fields.
 */

// ---------------------------------------------------------------------------
// Shared JSONB sub-types (only fields actually accessed in dashboard JSX)
// ---------------------------------------------------------------------------

/** Metrics JSONB blob — fields accessed in PostMonitor inline metrics */
export interface PostMetrics {
  views?: number | null;
  likes?: number | null;
  shares?: number | null;
  comments?: number | null;
  saves?: number | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// /api/posts — GET response
// ---------------------------------------------------------------------------

/** Single row from the /api/posts joined select */
export interface PostDTO {
  id: string;
  contentId: string;
  accountId: string;
  status: string;
  postedAt: string | null;
  platformPostId: string | null;
  url: string | null;
  failureReason: string | null;
  metrics: PostMetrics;
  createdAt: string;
  // Joined from content_items
  generatedText: string | null;
  finalText: string | null;
  visualUrl: string | null;
  templateId: string | null;
  // Joined from accounts
  accountName: string | null;
  platform: string | null;
  language: string | null;
}

/** Summary aggregates returned when summary=true */
export interface PostsSummary {
  totalPosts: number;
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  totalComments: number;
}

/** Polymorphic response from /api/posts */
export type PostsResponse = PostDTO[] | { items: PostDTO[]; summary: PostsSummary };

// ---------------------------------------------------------------------------
// /api/content-items — GET response
// ---------------------------------------------------------------------------

/** Single row from /api/content-items (full table select) */
export interface ContentItemDTO {
  id: string;
  verticalId: string;
  templateId: string | null;
  eventData: unknown;
  generatedText: string | null;
  visualUrl: string | null;
  mediaMeta: unknown;
  generationStatus: string;
  reviewStatus: string;
  finalText: string | null;
  reviewNotes: string | null;
  editedAt: string | null;
  tags: unknown;
  aiConfig: ContentItemAiConfig;
  cost: ContentItemCost;
  createdAt: string;
  reviewedAt: string | null;
  updatedAt: string;
}

/** aiConfig JSONB — fields accessed in ContentCard */
export interface ContentItemAiConfig {
  templateName?: string;
  [key: string]: unknown;
}

/** cost JSONB — fields accessed in ContentCard */
export interface ContentItemCost {
  apiTokens?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// /api/verticals — GET response
// ---------------------------------------------------------------------------

export interface AccountDTO {
  id: string;
  verticalId: string;
  platform: string;
  name: string;
  language: string;
  market: string;
  credentials: unknown;
  config: unknown;
  status: string;
  updatedAt: string;
  createdAt: string;
}

export interface DataSourceDTO {
  id: string;
  verticalId: string;
  provider: string;
  config: unknown;
  pollIntervalMs: number;
  status: string;
  lastPolledAt: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface TriggerRuleDTO {
  id: string;
  verticalId: string;
  name: string;
  condition: unknown;
  fireMode: string;
  cooldownMs: number;
  lookbackWindowMs: number;
  contentConfig: unknown;
  schedule: string | null;
  nextScheduledAt: string | null;
  lastPredicateResult: boolean | null;
  lastFiredAt: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContentTemplateDTO {
  id: string;
  verticalId: string;
  name: string;
  category: string;
  contentLayer: string;
  platform: string | null;
  promptTemplate: string;
  visualTemplate: unknown;
  platformMeta: unknown;
  generationConfig: unknown;
  tags: unknown;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Vertical with nested related entities */
export interface VerticalDTO {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  depth: number;
  config: unknown;
  status: string;
  createdAt: string;
  updatedAt: string;
  accounts: AccountDTO[];
  dataSources: DataSourceDTO[];
  triggerRules: TriggerRuleDTO[];
  contentTemplates: ContentTemplateDTO[];
}

// ---------------------------------------------------------------------------
// /api/posts/:id/metrics-history — GET response
// ---------------------------------------------------------------------------

/** Single snapshot row from metrics-history */
export interface MetricsSnapshotDTO {
  collectedAt: string;
  metrics: PostMetrics;
}

/** Full response from /api/posts/:id/metrics-history */
export interface MetricsHistoryResponse {
  postId: string;
  snapshots: MetricsSnapshotDTO[];
}
