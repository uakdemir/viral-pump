# C4: Data Model — Entity Relationships

```mermaid
erDiagram
    verticals ||--o{ verticals : "parent_id (hierarchy)"
    verticals ||--o{ accounts : "has many"
    verticals ||--o{ data_sources : "has many"
    verticals ||--o{ trigger_rules : "has many"
    verticals ||--o{ content_templates : "has many"
    verticals ||--o{ content_items : "has many"

    content_templates ||--o{ content_items : "template_id"
    content_items ||--o{ posts : "content_id"
    accounts ||--o{ posts : "account_id"

    verticals {
        uuid id PK
        uuid parent_id FK "nullable, self-ref"
        text name
        text slug UK
        int depth "0=root, 1=sub"
        jsonb config "defaults, tagVocabulary, triggerEvaluator"
        text status
    }

    accounts {
        uuid id PK
        uuid vertical_id FK
        text platform "twitter, instagram, linkedin, etc."
        text name
        text language
        text market
        jsonb credentials "per-account OAuth tokens"
        jsonb config "postingStrategy, dryRun, platformMeta"
        text status
    }

    data_sources {
        uuid id PK
        uuid vertical_id FK
        text provider "coingecko, exchangerate, etc."
        jsonb config
        int poll_interval_ms
        text status
        timestamptz last_polled_at
    }

    trigger_rules {
        uuid id PK
        uuid vertical_id FK
        text name
        jsonb condition "match + predicates[] + logic (AND/OR)"
        jsonb content_config "templateSelection + templateNames"
        text fire_mode "threshold_cross, stateful_true, every_poll, scheduled"
        text schedule "cron expression (nullable)"
        timestamptz next_scheduled_at "persisted for durability"
        boolean last_predicate_result "threshold_cross state"
        int cooldown_ms
        int lookback_window_ms
        timestamptz last_fired_at
        boolean enabled
    }

    content_templates {
        uuid id PK
        uuid vertical_id FK
        text name UK "unique per vertical"
        text category
        text content_layer "L1-L5"
        text platform "nullable — filters post routing"
        text prompt_template
        jsonb visual_template "template name + config + skipVisual"
        jsonb generation_config
        jsonb tags "author-defined template tags"
        jsonb platform_meta "per-template platform metadata"
        boolean enabled
    }

    content_items {
        uuid id PK
        uuid vertical_id FK
        uuid template_id FK
        jsonb event_data "generic DetectedEvent"
        text generated_text
        text visual_url
        text generation_status "generating, ready, failed"
        text review_status "draft, pending, approved, rejected"
        text final_text "nullable — edited version"
        jsonb tags "AI-assigned per generation"
        jsonb media_meta "mimeType, width, height, fileSizeBytes"
        jsonb ai_config "provider, model, tokensUsed"
        jsonb cost "apiTokens, generationTimeMs"
    }

    posts {
        uuid id PK
        uuid content_id FK
        uuid account_id FK "UK with content_id"
        text status "ready, posted, failed, skipped"
        timestamptz posted_at
        text platform_post_id
        text url "direct link to posted content"
        text failure_reason "validation or API error"
        jsonb metrics "platform-specific"
        jsonb cost
    }

    job_queue {
        uuid id PK
        text type "generate-content, generate-visual, post-to-platform"
        jsonb payload
        text status "pending, processing, completed, failed"
        int attempts
        int max_attempts
        text locked_by
        timestamptz locked_at
        timestamptz lease_expires_at
        timestamptz scheduled_at
    }
```

## Platform Coverage (accounts.platform values)

| Platform | PostingStrategy | Status | Content Format |
|---|---|---|---|
| `twitter` | `twitter-api` | Full | Text + image |
| `instagram` | `instagram-api` | Full | Text + image (required) |
| `linkedin` | `linkedin-api` | Full | Text + image |
| `pinterest` | `pinterest-api` | Full | Text + image (required) |
| `telegram` | `telegram-api` | Full | Text + image |
| `newsletter` | `newsletter` | Stub (file) | Text + image (email HTML) |
| `tiktok` | `tiktok-api` | Stub (needs video) | Video required |
| `youtube` | `youtube-api` | Stub (needs video) | Video required |
| `reddit` | `reddit-api` | Stub (needs long-form) | Long text + subreddit |
| `blog` | `blog` | Stub (needs long-form) | HTML + SEO metadata |
| (any) | `dry-run` | Testing | Saves to JSON file |
