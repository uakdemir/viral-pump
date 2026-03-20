-- db/seed.sql
-- Development seed data for all verticals
-- Run manually: psql $VIRAL_DATABASE_URL -f db/seed.sql

-- ============================================================
-- CLEAR ALL SEED DATA (idempotent)
-- ============================================================
DELETE FROM posts;
DELETE FROM content_items;
DELETE FROM job_queue;
DELETE FROM content_templates;
DELETE FROM trigger_rules;
DELETE FROM data_sources;
DELETE FROM accounts;
DELETE FROM verticals;

-- ============================================================
-- VERTICAL 1: GOLD & FOREX
-- ============================================================

INSERT INTO verticals (id, name, slug, depth, config, status) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Gold & Forex',
  'gold-forex',
  0,
  '{
    "defaults": {
      "contentGenerator": { "provider": "claude", "model": "claude-haiku-4-5-20251001" },
      "visualGenerator": { "provider": "puppeteer-html" },
      "language": "en",
      "tone": "informative",
      "brandVoice": "data-driven, concise, no hype",
      "tagVocabulary": ["urgent", "data-driven", "historical", "prediction", "educational"]
    }
  }'::jsonb,
  'active'
);

-- Gold/Forex Accounts (multi-platform, dryRun: true)
INSERT INTO accounts (id, vertical_id, platform, name, language, market, config, status) VALUES
(
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'twitter', 'Gold Forex EN', 'en', 'global',
  '{ "postingStrategy": "twitter-api", "dryRun": true }'::jsonb, 'active'
),
(
  '00000000-0000-0000-0000-000000000009',
  '00000000-0000-0000-0000-000000000001',
  'twitter', 'Altın Döviz TR', 'tr', 'turkey',
  '{ "postingStrategy": "twitter-api", "dryRun": true }'::jsonb, 'active'
),
(
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-000000000001',
  'instagram', 'Gold Forex IG', 'en', 'global',
  '{ "postingStrategy": "instagram-api", "dryRun": true }'::jsonb, 'active'
),
(
  '00000000-0000-0000-0000-0000000000a2',
  '00000000-0000-0000-0000-000000000001',
  'linkedin', 'Gold Forex LinkedIn', 'en', 'global',
  '{ "postingStrategy": "linkedin-api", "dryRun": true }'::jsonb, 'active'
),
(
  '00000000-0000-0000-0000-0000000000a3',
  '00000000-0000-0000-0000-000000000001',
  'telegram', 'Gold Forex Telegram', 'en', 'global',
  '{ "postingStrategy": "telegram-api", "dryRun": true, "platformMeta": { "channelId": "@goldforex_test" } }'::jsonb, 'active'
);

-- Data Sources
INSERT INTO data_sources (id, vertical_id, provider, config, poll_interval_ms, status) VALUES
(
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'coingecko',
  '{ "endpoint": "https://api.coingecko.com/api/v3/simple/price", "assets": { "bitcoin": "BTC" }, "vsCurrencies": ["usd"] }'::jsonb,
  60000, 'active'
),
(
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000001',
  'exchangerate',
  '{ "endpoint": "https://open.er-api.com/v6/latest", "base": "USD", "symbols": ["TRY", "EUR"] }'::jsonb,
  300000, 'active'
);

-- Trigger Rules (updated to predicates array + content_config)
INSERT INTO trigger_rules (id, vertical_id, name, condition, content_config, fire_mode, cooldown_ms, lookback_window_ms, enabled) VALUES
(
  '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000001',
  'BTC moves >1% in 5 min',
  '{ "match": { "source": "coingecko", "instrument": "BTC/USD" }, "predicates": [{ "field": "changePct", "operator": "gt", "value": 1.0 }], "logic": "AND" }'::jsonb,
  '{ "templateSelection": "named", "templateNames": ["gold-price-alert"] }'::jsonb,
  'threshold_cross', 3600000, 300000, true
),
(
  '00000000-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000001',
  'USD/TRY moves >0.5% in 5 min',
  '{ "match": { "source": "exchangerate", "instrument": "USD/TRY" }, "predicates": [{ "field": "changePct", "operator": "gt", "value": 0.5 }], "logic": "AND" }'::jsonb,
  '{ "templateSelection": "named", "templateNames": ["forex-rate-alert"] }'::jsonb,
  'threshold_cross', 3600000, 300000, true
);

-- Content Templates (updated with tag extraction)
INSERT INTO content_templates (id, vertical_id, name, category, content_layer, platform, prompt_template, visual_template, generation_config, tags, enabled) VALUES
(
  '00000000-0000-0000-0000-000000000007',
  '00000000-0000-0000-0000-000000000001',
  'gold-price-alert', 'real-time-event', 'L1', NULL,
  'You are a concise financial content writer for social media. Write a tweet (max 270 chars, leave room for an image link) about this price movement.

Event data:
- Instrument: {{instrument}}
- Current price: ${{price}}
- Change: {{changePct}}% in the last {{lookbackMinutes}} minutes
- Direction: {{direction}}
- Previous price: ${{previousPrice}}

Requirements:
- Lead with the price and percentage change
- Add brief historical context if the move is significant
- Use a data-driven, no-hype tone
- Do NOT use hashtags or emojis
- Do NOT give financial advice

Return your response in this format:
Tweet: <your tweet text>
Tags: <2-5 comma-separated tags from: urgent, data-driven, historical, prediction, educational>',
  '{ "template": "price-card", "config": { "width": 1200, "height": 628 } }'::jsonb,
  '{ "temperature": 0.7 }'::jsonb,
  '["urgent", "data-driven"]'::jsonb, true
),
(
  '00000000-0000-0000-0000-000000000008',
  '00000000-0000-0000-0000-000000000001',
  'forex-rate-alert', 'real-time-event', 'L1', NULL,
  'You are a concise financial content writer for social media. Write a tweet (max 270 chars) about this forex rate movement.

Event data:
- Pair: {{instrument}}
- Current rate: {{price}}
- Change: {{changePct}}% in the last {{lookbackMinutes}} minutes
- Direction: {{direction}}
- Previous rate: {{previousPrice}}

Requirements:
- Lead with the rate and percentage change
- Mention impact on Turkish market if USD/TRY or EUR/TRY
- Use a data-driven, no-hype tone
- Do NOT use hashtags or emojis
- Do NOT give financial advice

Return your response in this format:
Tweet: <your tweet text>
Tags: <2-5 comma-separated tags from: urgent, data-driven, historical, prediction, educational>',
  '{ "template": "price-card", "config": { "width": 1200, "height": 628 } }'::jsonb,
  '{ "temperature": 0.7 }'::jsonb,
  '["urgent", "data-driven"]'::jsonb, true
),
-- Platform-specific: Instagram (1080x1080 square)
(
  '00000000-0000-0000-0000-0000000000d1',
  '00000000-0000-0000-0000-000000000001',
  'gold-price-alert-instagram', 'real-time-event', 'L1', 'instagram',
  'You are a concise financial content writer for Instagram. Write a caption (max 2000 chars) about this price movement.

Event data:
- Instrument: {{instrument}}
- Current price: ${{price}}
- Change: {{changePct}}% in the last {{lookbackMinutes}} minutes
- Direction: {{direction}}

Requirements:
- Lead with the key number
- More detail than a tweet — add context and analysis
- Use a data-driven, no-hype tone
- Do NOT give financial advice

Return your response in this format:
Tweet: <your caption text>
Tags: <2-5 comma-separated tags from: urgent, data-driven, historical, prediction, educational>',
  '{ "template": "price-card", "config": { "width": 1080, "height": 1080 } }'::jsonb,
  '{}'::jsonb,
  '{ "temperature": 0.7 }'::jsonb,
  '["urgent", "data-driven"]'::jsonb, true
);

-- ============================================================
-- VERTICAL 2: FITNESS
-- ============================================================

INSERT INTO verticals (id, name, slug, depth, config, status) VALUES (
  '00000000-0000-0000-0000-000000000010',
  'Fitness',
  'fitness',
  0,
  '{
    "defaults": {
      "contentGenerator": { "provider": "claude", "model": "claude-haiku-4-5-20251001" },
      "visualGenerator": { "provider": "puppeteer-html" },
      "language": "en",
      "tone": "encouraging",
      "brandVoice": "knowledgeable, practical, no bro-science",
      "tagVocabulary": ["motivation", "discipline", "nutrition", "workout", "recovery", "mindset", "beginner", "advanced"]
    }
  }'::jsonb,
  'active'
);

-- Fitness Accounts (multi-platform, dryRun: true)
INSERT INTO accounts (id, vertical_id, platform, name, language, market, config, status) VALUES
(
  '00000000-0000-0000-0000-000000000011',
  '00000000-0000-0000-0000-000000000010',
  'twitter', 'Fitness Daily EN', 'en', 'global',
  '{ "postingStrategy": "twitter-api", "dryRun": true }'::jsonb, 'active'
),
(
  '00000000-0000-0000-0000-0000000000b1',
  '00000000-0000-0000-0000-000000000010',
  'instagram', 'Fitness Daily IG', 'en', 'global',
  '{ "postingStrategy": "instagram-api", "dryRun": true }'::jsonb, 'active'
),
(
  '00000000-0000-0000-0000-0000000000b2',
  '00000000-0000-0000-0000-000000000010',
  'pinterest', 'Fitness Tips Pinterest', 'en', 'global',
  '{ "postingStrategy": "pinterest-api", "dryRun": true, "platformMeta": { "boardId": "fitness-tips-board" } }'::jsonb, 'active'
),
(
  '00000000-0000-0000-0000-0000000000b3',
  '00000000-0000-0000-0000-000000000010',
  'newsletter', 'Fitness Weekly Newsletter', 'en', 'global',
  '{ "postingStrategy": "newsletter", "dryRun": true }'::jsonb, 'active'
);

-- Trigger Rules (scheduled, cron-based)
INSERT INTO trigger_rules (id, vertical_id, name, condition, content_config, fire_mode, schedule, cooldown_ms, lookback_window_ms, enabled) VALUES
(
  '00000000-0000-0000-0000-000000000012',
  '00000000-0000-0000-0000-000000000010',
  'Daily workout tip',
  '{ "match": {}, "predicates": [], "logic": "AND" }'::jsonb,
  '{ "templateSelection": "named", "templateNames": ["fitness-workout-tip", "fitness-myth-bust"] }'::jsonb,
  'scheduled', '0 8 * * *', 3600000, 0, true
),
(
  '00000000-0000-0000-0000-000000000013',
  '00000000-0000-0000-0000-000000000010',
  'Nutrition fact',
  '{ "match": {}, "predicates": [], "logic": "AND" }'::jsonb,
  '{ "templateSelection": "named", "templateNames": ["fitness-nutrition-fact"] }'::jsonb,
  'scheduled', '0 14 * * *', 3600000, 0, true
),
(
  '00000000-0000-0000-0000-000000000014',
  '00000000-0000-0000-0000-000000000010',
  'Motivation Monday',
  '{ "match": {}, "predicates": [], "logic": "AND" }'::jsonb,
  '{ "templateSelection": "named", "templateNames": ["fitness-motivation"] }'::jsonb,
  'scheduled', '0 10 * * 1', 3600000, 0, true
);

-- Content Templates
INSERT INTO content_templates (id, vertical_id, name, category, content_layer, platform, prompt_template, visual_template, generation_config, tags, enabled) VALUES
(
  '00000000-0000-0000-0000-000000000015',
  '00000000-0000-0000-0000-000000000010',
  'fitness-workout-tip', 'tip', 'L1', NULL,
  'You are a fitness content creator for social media. Write a tweet (max 270 chars) with a practical workout tip.

Requirements:
- Focus on one specific, actionable exercise or technique
- Include a brief explanation of why it works
- Tone: encouraging, knowledgeable, no bro-science
- Do NOT use hashtags or emojis

Return your response in this format:
Tweet: <your tweet text>
Tags: <2-5 comma-separated tags from: motivation, discipline, nutrition, workout, recovery, mindset, beginner, advanced>',
  '{ "template": "tip-card", "config": { "width": 1200, "height": 628 } }'::jsonb,
  '{ "temperature": 0.8 }'::jsonb,
  '["workout", "educational"]'::jsonb, true
),
(
  '00000000-0000-0000-0000-000000000016',
  '00000000-0000-0000-0000-000000000010',
  'fitness-nutrition-fact', 'educational', 'L1', NULL,
  'You are a nutrition-focused fitness content creator for social media. Write a tweet (max 270 chars) with a surprising or useful nutrition fact.

Requirements:
- Lead with a specific number or comparison (e.g., "100g of chicken breast has 31g of protein")
- Make it practical and actionable
- Tone: informative, no-nonsense
- Do NOT use hashtags or emojis

Return your response in this format:
Tweet: <your tweet text>
Tags: <2-5 comma-separated tags from: motivation, discipline, nutrition, workout, recovery, mindset, beginner, advanced>',
  '{ "template": "stat-card", "config": { "width": 1200, "height": 628 } }'::jsonb,
  '{ "temperature": 0.7 }'::jsonb,
  '["nutrition", "educational"]'::jsonb, true
),
(
  '00000000-0000-0000-0000-000000000017',
  '00000000-0000-0000-0000-000000000010',
  'fitness-motivation', 'motivation', 'L2', NULL,
  'You are a motivational fitness content creator for social media. Write a tweet (max 270 chars) that inspires people to stay consistent with their fitness journey.

Requirements:
- Focus on discipline, consistency, or overcoming obstacles
- Be genuine and encouraging, not cheesy or cliche
- Tone: empowering, real
- Do NOT use hashtags or emojis

Return your response in this format:
Tweet: <your tweet text>
Tags: <2-5 comma-separated tags from: motivation, discipline, nutrition, workout, recovery, mindset, beginner, advanced>',
  '{ "template": "quote-card", "config": { "width": 1200, "height": 628 } }'::jsonb,
  '{ "temperature": 0.9 }'::jsonb,
  '["motivation", "mindset"]'::jsonb, true
),
(
  '00000000-0000-0000-0000-000000000018',
  '00000000-0000-0000-0000-000000000010',
  'fitness-myth-bust', 'educational', 'L2', NULL,
  'You are a science-based fitness content creator for social media. Write a tweet (max 270 chars) that busts a common fitness or nutrition myth.

Requirements:
- State the myth briefly, then explain the reality
- Cite science or expert consensus where possible
- Tone: authoritative but approachable
- Do NOT use hashtags or emojis

Return your response in this format:
Tweet: <your tweet text>
Tags: <2-5 comma-separated tags from: motivation, discipline, nutrition, workout, recovery, mindset, beginner, advanced>',
  '{ "template": "tip-card", "config": { "width": 1200, "height": 628 } }'::jsonb,
  '{ "temperature": 0.7 }'::jsonb,
  '["educational", "nutrition"]'::jsonb, true
),
-- Platform-specific: Pinterest (1000x1500, 2:3 ratio)
(
  '00000000-0000-0000-0000-0000000000d2',
  '00000000-0000-0000-0000-000000000010',
  'fitness-tip-pinterest', 'tip', 'L1', 'pinterest',
  'You are a fitness content creator for Pinterest. Write a Pin description (max 500 chars) with a practical fitness tip.

Requirements:
- One specific, actionable tip
- Tone: encouraging, knowledgeable
- Do NOT use hashtags

Return your response in this format:
Tweet: <your description>
Tags: <2-5 comma-separated tags from: motivation, discipline, nutrition, workout, recovery, mindset, beginner, advanced>',
  '{ "template": "tip-card", "config": { "width": 1000, "height": 1500 } }'::jsonb,
  '{ "boardId": "fitness-tips-board" }'::jsonb,
  '{ "temperature": 0.8 }'::jsonb,
  '["workout", "educational"]'::jsonb, true
);

-- ============================================================
-- VERTICAL 3: DATING
-- ============================================================

INSERT INTO verticals (id, name, slug, depth, config, status) VALUES (
  '00000000-0000-0000-0000-000000000020',
  'Dating',
  'dating',
  0,
  '{
    "defaults": {
      "contentGenerator": { "provider": "claude", "model": "claude-haiku-4-5-20251001" },
      "visualGenerator": { "provider": "puppeteer-html" },
      "language": "en",
      "tone": "witty and empowering",
      "brandVoice": "your brutally honest best friend, safety-conscious",
      "tagVocabulary": ["safety", "self-worth", "humor", "red-flag", "green-flag", "conversation", "psychology", "confidence"]
    }
  }'::jsonb,
  'active'
);

-- Dating Accounts (multi-platform, dryRun: true)
INSERT INTO accounts (id, vertical_id, platform, name, language, market, config, status) VALUES
(
  '00000000-0000-0000-0000-000000000021',
  '00000000-0000-0000-0000-000000000020',
  'twitter', 'Dating Tips EN', 'en', 'global',
  '{ "postingStrategy": "twitter-api", "dryRun": true }'::jsonb, 'active'
),
(
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-000000000020',
  'instagram', 'Dating Tips IG', 'en', 'global',
  '{ "postingStrategy": "instagram-api", "dryRun": true }'::jsonb, 'active'
),
(
  '00000000-0000-0000-0000-0000000000c2',
  '00000000-0000-0000-0000-000000000020',
  'tiktok', 'Dating Tips TikTok', 'en', 'global',
  '{ "postingStrategy": "tiktok-api", "dryRun": true }'::jsonb, 'active'
);
-- Note: Dating TikTok account is inert until video generation pipeline is implemented.
-- COMPATIBLE_PLATFORMS excludes tiktok from image-content routing.

-- Trigger Rules (scheduled, cron-based)
INSERT INTO trigger_rules (id, vertical_id, name, condition, content_config, fire_mode, schedule, cooldown_ms, lookback_window_ms, enabled) VALUES
(
  '00000000-0000-0000-0000-000000000022',
  '00000000-0000-0000-0000-000000000020',
  'Daily dating tip',
  '{ "match": {}, "predicates": [], "logic": "AND" }'::jsonb,
  '{ "templateSelection": "named", "templateNames": ["dating-daily-tip"] }'::jsonb,
  'scheduled', '0 10 * * *', 3600000, 0, true
),
(
  '00000000-0000-0000-0000-000000000023',
  '00000000-0000-0000-0000-000000000020',
  'Red/green flag',
  '{ "match": {}, "predicates": [], "logic": "AND" }'::jsonb,
  '{ "templateSelection": "random", "templateNames": ["dating-red-flag", "dating-green-flag"] }'::jsonb,
  'scheduled', '0 18 * * *', 3600000, 0, true
),
(
  '00000000-0000-0000-0000-000000000024',
  '00000000-0000-0000-0000-000000000020',
  'Weekend conversation starters',
  '{ "match": {}, "predicates": [], "logic": "AND" }'::jsonb,
  '{ "templateSelection": "named", "templateNames": ["dating-conversation-starter"] }'::jsonb,
  'scheduled', '0 12 * * 5', 3600000, 0, true
);

-- Content Templates
INSERT INTO content_templates (id, vertical_id, name, category, content_layer, platform, prompt_template, visual_template, generation_config, tags, enabled) VALUES
(
  '00000000-0000-0000-0000-000000000025',
  '00000000-0000-0000-0000-000000000020',
  'dating-daily-tip', 'tip', 'L1', NULL,
  'You are a dating advice content creator for social media. Write a tweet (max 270 chars) with a practical, genuinely helpful dating tip.

Requirements:
- Focus on one specific, actionable piece of advice
- Be relatable and grounded in real experience
- Tone: witty, empowering, like your brutally honest best friend
- Do NOT use hashtags or emojis
- Do NOT be creepy, manipulative, or pickup-artist adjacent

Return your response in this format:
Tweet: <your tweet text>
Tags: <2-5 comma-separated tags from: safety, self-worth, humor, red-flag, green-flag, conversation, psychology, confidence>',
  '{ "template": "tip-card", "config": { "width": 1200, "height": 628 } }'::jsonb,
  '{ "temperature": 0.8 }'::jsonb,
  '["conversation", "confidence"]'::jsonb, true
),
(
  '00000000-0000-0000-0000-000000000026',
  '00000000-0000-0000-0000-000000000020',
  'dating-red-flag', 'safety', 'L1', NULL,
  'You are a dating safety content creator for social media. Write a tweet (max 270 chars) about a specific dating red flag that people should watch out for.

Requirements:
- Describe one specific red flag behavior (not vague)
- Explain briefly why it matters
- Tone: direct, empowering, safety-conscious
- Do NOT use hashtags or emojis

Return your response in this format:
Tweet: <your tweet text>
Tags: <2-5 comma-separated tags from: safety, self-worth, humor, red-flag, green-flag, conversation, psychology, confidence>',
  '{ "template": "quote-card", "config": { "width": 1200, "height": 628 } }'::jsonb,
  '{ "temperature": 0.8 }'::jsonb,
  '["red-flag", "safety"]'::jsonb, true
),
(
  '00000000-0000-0000-0000-000000000027',
  '00000000-0000-0000-0000-000000000020',
  'dating-green-flag', 'positive', 'L1', NULL,
  'You are a dating advice content creator for social media. Write a tweet (max 270 chars) about a specific dating green flag — a positive sign that someone is worth your time.

Requirements:
- Describe one specific green flag behavior
- Explain briefly why it matters
- Tone: warm, encouraging, genuine
- Do NOT use hashtags or emojis

Return your response in this format:
Tweet: <your tweet text>
Tags: <2-5 comma-separated tags from: safety, self-worth, humor, red-flag, green-flag, conversation, psychology, confidence>',
  '{ "template": "quote-card", "config": { "width": 1200, "height": 628 } }'::jsonb,
  '{ "temperature": 0.8 }'::jsonb,
  '["green-flag", "self-worth"]'::jsonb, true
),
(
  '00000000-0000-0000-0000-000000000028',
  '00000000-0000-0000-0000-000000000020',
  'dating-conversation-starter', 'practical', 'L2', NULL,
  'You are a dating advice content creator for social media. Write a tweet (max 270 chars) with a creative conversation starter or first-date question that actually works.

Requirements:
- Provide one specific question or conversation opener
- Briefly explain why it works (what it reveals about the person)
- Tone: fun, smart, practical
- Do NOT use hashtags or emojis

Return your response in this format:
Tweet: <your tweet text>
Tags: <2-5 comma-separated tags from: safety, self-worth, humor, red-flag, green-flag, conversation, psychology, confidence>',
  '{ "template": "tip-card", "config": { "width": 1200, "height": 628 } }'::jsonb,
  '{ "temperature": 0.9 }'::jsonb,
  '["conversation", "humor"]'::jsonb, true
),
-- Platform-specific: Instagram (1080x1350, 4:5 ratio)
(
  '00000000-0000-0000-0000-0000000000d3',
  '00000000-0000-0000-0000-000000000020',
  'dating-tip-instagram', 'tip', 'L1', 'instagram',
  'You are a dating advice content creator for Instagram. Write a caption (max 2000 chars) with a practical dating tip.

Requirements:
- One specific, relatable piece of advice
- Tone: witty, empowering, like your best friend
- Do NOT be creepy or manipulative

Return your response in this format:
Tweet: <your caption text>
Tags: <2-5 comma-separated tags from: safety, self-worth, humor, red-flag, green-flag, conversation, psychology, confidence>',
  '{ "template": "tip-card", "config": { "width": 1080, "height": 1350 } }'::jsonb,
  '{}'::jsonb,
  '{ "temperature": 0.8 }'::jsonb,
  '["conversation", "confidence"]'::jsonb, true
);
