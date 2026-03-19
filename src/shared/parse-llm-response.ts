/**
 * Parses LLM response into text + tags.
 * Expected format:
 *   Tweet: <tweet text>
 *   Tags: tag1, tag2, tag3
 *
 * Handles multiline tags (everything after "Tags:" marker is the tag section).
 * Graceful degradation: if no Tags: marker, full response becomes text, tags empty.
 */
export function parseLlmResponse(raw: string): { text: string; tags: string[] } {
  const tagsIndex = raw.toLowerCase().lastIndexOf('tags:');

  let text: string;
  let tags: string[] = [];

  if (tagsIndex !== -1) {
    // Everything before "Tags:" is tweet text
    text = raw.substring(0, tagsIndex).trim();

    // Everything after "Tags:" is the tag section (handles multiline)
    const tagSection = raw.slice(tagsIndex + 5);
    tags = tagSection
      .split(/[,\n]/)
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);
  } else {
    text = raw.trim();
  }

  // Strip "Tweet:" prefix if present
  if (text.toLowerCase().startsWith('tweet:')) {
    text = text.substring(6).trim();
  }

  return { text, tags };
}
