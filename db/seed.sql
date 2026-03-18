-- db/seed.sql
-- Development seed data for Gold/Forex vertical
-- Run manually: psql $DATABASE_URL -f db/seed.sql

-- Clear existing seed data (idempotent)
DELETE FROM posts WHERE content_id IN (SELECT id FROM content_items WHERE vertical_id IN (SELECT id FROM verticals WHERE slug = 'gold-forex'));
DELETE FROM content_items WHERE vertical_id IN (SELECT id FROM verticals WHERE slug = 'gold-forex');
DELETE FROM job_queue WHERE payload->>'verticalSlug' = 'gold-forex';
DELETE FROM content_templates WHERE vertical_id IN (SELECT id FROM verticals WHERE slug = 'gold-forex');
DELETE FROM trigger_rules WHERE vertical_id IN (SELECT id FROM verticals WHERE slug = 'gold-forex');
DELETE FROM data_sources WHERE vertical_id IN (SELECT id FROM verticals WHERE slug = 'gold-forex');
DELETE FROM accounts WHERE vertical_id IN (SELECT id FROM verticals WHERE slug = 'gold-forex');
DELETE FROM verticals WHERE slug = 'gold-forex';

-- 1. Vertical
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
      "brandVoice": "data-driven, concise, no hype"
    }
  }'::jsonb,
  'active'
);

-- 2. Account
INSERT INTO accounts (id, vertical_id, platform, name, language, market, config, status) VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'twitter',
  'Gold Forex EN',
  'en',
  'global',
  '{ "postingStrategy": "twitter-api" }'::jsonb,
  'active'
);

-- 3. Data Sources
INSERT INTO data_sources (id, vertical_id, provider, config, poll_interval_ms, status) VALUES
(
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000001',
  'coingecko',
  '{ "endpoint": "https://api.coingecko.com/api/v3/simple/price", "assets": { "gold": "XAU" }, "vsCurrencies": ["usd"] }'::jsonb,
  60000,
  'active'
),
(
  '00000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000001',
  'exchangerate',
  '{ "endpoint": "https://api.exchangerate.host/latest", "base": "USD", "symbols": ["TRY", "EUR"] }'::jsonb,
  300000,
  'active'
);

-- 4. Trigger Rules
INSERT INTO trigger_rules (id, vertical_id, name, condition, fire_mode, cooldown_ms, lookback_window_ms, enabled) VALUES
(
  '00000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000001',
  'Gold moves >1% in 5 min',
  '{ "match": { "source": "coingecko", "instrument": "XAU/USD" }, "predicate": { "field": "changePct", "operator": "gt", "value": 1.0 } }'::jsonb,
  'threshold_cross',
  3600000,
  300000,
  true
),
(
  '00000000-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000001',
  'USD/TRY moves >0.5% in 5 min',
  '{ "match": { "source": "exchangerate", "instrument": "USD/TRY" }, "predicate": { "field": "changePct", "operator": "gt", "value": 0.5 } }'::jsonb,
  'threshold_cross',
  3600000,
  300000,
  true
);

-- 5. Content Templates
INSERT INTO content_templates (id, vertical_id, name, category, content_layer, platform, prompt_template, visual_template, generation_config, tags, enabled) VALUES
(
  '00000000-0000-0000-0000-000000000007',
  '00000000-0000-0000-0000-000000000001',
  'gold-price-alert',
  'real-time-event',
  'L1',
  NULL,
  'You are a concise financial content writer for social media. Write a tweet (max 270 chars, leave room for an image link) about this gold price movement.

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
- Do NOT give financial advice',
  '{ "provider": "puppeteer-html", "template": "price-card", "config": { "width": 1200, "height": 628 } }'::jsonb,
  '{ "temperature": 0.7 }'::jsonb,
  '["urgent", "data-driven"]'::jsonb,
  true
),
(
  '00000000-0000-0000-0000-000000000008',
  '00000000-0000-0000-0000-000000000001',
  'forex-rate-alert',
  'real-time-event',
  'L1',
  NULL,
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
- Do NOT give financial advice',
  '{ "provider": "puppeteer-html", "template": "price-card", "config": { "width": 1200, "height": 628 } }'::jsonb,
  '{ "temperature": 0.7 }'::jsonb,
  '["urgent", "data-driven"]'::jsonb,
  true
);
