export interface MetricsData {
  views?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  saves?: number;
  clicks?: number;
  reach?: number;
  impressions?: number;
  extra?: Record<string, unknown>;
}

export interface MetricsCollector {
  collect(platformPostId: string, credentials: Record<string, unknown>): Promise<MetricsData>;
}
