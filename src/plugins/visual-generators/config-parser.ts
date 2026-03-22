export interface VisualTemplateConfig {
  template?: string;
  skipVisual?: boolean;
  config?: { width?: number; height?: number };
}

export function asVisualTemplateConfig(raw: unknown): VisualTemplateConfig {
  return (raw ?? {}) as VisualTemplateConfig;
}
