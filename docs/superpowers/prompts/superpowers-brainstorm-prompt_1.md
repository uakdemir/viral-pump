# Superpowers Brainstorming Prompt — ViralEngine

## How to Use
Paste everything below the line into Claude Code after invoking `/superpowers:brainstorm`

---

## Product Vision

I want to build **ViralEngine** — an AI-powered platform that automates the creation and distribution of genuinely useful, data-driven viral content across social media platforms, with the goal of building targeted audiences that can be monetized through app install affiliate programs, product referrals, and eventually direct B2B services to app developers.

The core insight: AI can generate genuinely valuable real-time content (not ads, not spam — actually useful information) at near-zero marginal cost. When that content goes viral, it builds audiences with clear intent signals. Those audiences are worth money to app developers and product companies who want targeted installs.

**Proof of concept already exists:** A co-founder built an automated earthquake detection/alert system on Twitter that generates visual GIF summaries of significant earthquakes and posts them automatically. Within 2 weeks a single tweet reached 75,000 views with zero ad spend. We want to generalize this pattern across multiple verticals and platforms.

## Core Product Goal

Build a **Marketing Reasoning Engine** that:

1. **Detects events** from real-time data sources (APIs, scrapers, feeds)
2. **Generates content** (text + visuals — GIFs, cards, infographics) using AI, tailored per platform
3. **Posts automatically** to the right platform at the optimal time
4. **Measures performance** (views, engagement, clicks, conversions)
5. **Learns patterns** about what content types, formats, and timing work for which audience segments
6. **Reasons about future content** — the AI uses accumulated data to decide what to post next, which format, which platform, and which audience segment to target
7. **Requires minimal human involvement** — human-in-the-loop only for: quick approve/reject of generated content (~30 sec per post), weekly strategy review, and new vertical onboarding decisions

The system should be designed so that the AI prompt/reasoning layer gets richer over time as more data flows through it. The real moat is the accumulated dataset of "what works for which audience on which platform" — not the code itself.

## Validated Verticals (Test Phase)

We've validated these 7 verticals through market research. The first 4 are for the initial 2-week test. The last 3 are Phase 2 expansion:

### Phase 1 — Initial Test (2 weeks)

**1. Altın & Döviz → Personal Finance (Turkish start, global evolution)**
- Content: Real-time gold/USD/EUR price movements with visual context
- Data sources: Free APIs — CoinGecko, TCMB (Turkish Central Bank), exchangerate.host, metalpriceapi.com
- Platforms: Twitter/X (data alerts), Newsletter (weekly analysis)
- Affiliate targets: Trading/investment apps (eToro $50-200/funded account), neobanks (Papara, Wise, Revolut $5-20/signup), budgeting apps ($3-8/install)
- Content layers: L1=price alerts, L2=historical context ("last 3 times gold crossed this level..."), L3=polls/predictions, L4=weekly narratives, L5=audience-requested analysis
- Start in Turkish, evolve to English for global personal finance brand

**2. Fitness / Health / Nutrition (Global from day one)**
- Content: Quick workout tips, calorie comparisons, health stats, transformation data
- Data sources: Exercise databases, nutrition APIs (Nutritionix, USDA FoodData), trending fitness topics from social APIs
- Platforms: Twitter/X, TikTok, Instagram — all three from start
- Affiliate targets: Fitness apps ($5-15/install), calorie trackers, wearable brands, supplement companies, gym membership platforms
- Content layers: L1=daily tips with visuals, L2=myth-busting with data, L3=challenges/quizzes, L4=weekly roundups, L5=user Q&A
- English-first for maximum global reach. $12B+ market growing at 13% CAGR

**3. Language Learning (Perfect for Turkey/SEA geographies)**
- Content: Quick language tips, common mistakes, "how to say X in Y languages", pronunciation guides, cultural differences
- Data sources: Curated linguistic databases, trending phrases, cultural events calendar
- Platforms: Twitter/X, TikTok, Instagram
- Affiliate targets: Duolingo, Babbel, Busuu ($3-8/install), Cambly ($10-15/trial signup — actively spending in Turkey, Vietnam, Philippines, Indonesia), italki
- Content layers: L1=word/phrase of the day, L2=common mistakes explained, L3=guess-the-language quizzes, L4=weekly themed sets, L5=audience-requested translations
- Start with Turkish↔English, replicate for Vietnamese↔English, Bahasa↔English, Filipino↔English

**4. Dating / Relationships (Split into two sub-audiences)

**4a. Dating — Men's Audience

Content: Conversation starters that actually work (with data on response rates), profile photo analysis ("photos with dogs get 40% more matches"), first date planning tips with budget breakdowns, rejection handling and confidence building, "what she actually means when she says X" decoded with humor, dating app feature comparisons and hacks
Data sources: Published dating app statistics (Tinder Insights, Bumble reports, Hinge data blog), academic relationship research, scraping Reddit r/dating and r/Tinder for trending pain points
Platforms: Twitter/X (quick tips + data visuals), TikTok (short advice clips), Instagram (carousel guides)
Affiliate targets: Dating apps (Tinder, Bumble, Hinge — $10-30/install, among highest CPI categories), grooming/style apps, self-improvement platforms, men's subscription boxes, cologne/fragrance brands, photography services for profile photos
Content layers: L1=daily tip or stat visual, L2=data-backed "what works" analysis, L3=polls ("which opening line would you use?"), L4=weekly "dating market report" with humor, L5=audience-submitted profile reviews
Tone: Genuinely helpful, not pickup-artist cringe. Data-driven, slightly humorous, respectful. Think "your smart friend who's good at dating" not "alpha male guru"

**4b. Dating — Women's Audience

Content: Red/green flag identification with visual checklists, safety tips for first dates (share location, public places, exit strategies), "what his profile actually tells you" pattern recognition, emotional intelligence and attachment style content, self-worth and boundary-setting framing, dating app algorithm tips (how to get shown to better matches)
Data sources: Same published dating app statistics, safety-focused research, psychology/attachment theory databases, trending relationship discussions from social platforms
Platforms: Twitter/X, TikTok (strongest platform — women's dating advice is massive here), Instagram (carousel infographics)
Affiliate targets: Dating apps (same $10-30/install but women are the scarcer resource so apps value female signups even higher), safety apps (bSafe, Noonlight — $5-15/install), therapy/coaching platforms (BetterHelp $30-100/lead), self-care and wellness apps, astrology/compatibility apps (Co-Star, The Pattern — surprisingly high engagement)
Content layers: L1=daily red/green flag visual, L2=safety and psychology-backed deep dives, L3=quizzes ("what's your attachment style?"), L4=weekly dating trend roundups, L5=audience-submitted "should I respond to this?" screenshots (anonymized)
Tone: Empowering, safety-conscious, witty. Think "your brutally honest best friend" not "dating coach selling a course"

**Why split matters**: Men's content converts to dating app installs and self-improvement products. Women's content converts to dating apps (higher value per signup), safety tools, therapy platforms, and wellness products. Running them as separate accounts doubles your total addressable audience because the content that resonates with each group is fundamentally different — a "best opening lines" post alienates women, a "red flags checklist" alienates men. Two accounts, two audiences, two affiliate funnels, same underlying content engine.

### Phase 2 — Expansion (after validating Phase 1)


**5. Pet Care / Pet Owners**
- Affiliate targets: Pet insurance ($15-40/lead), pet food subscriptions ($10-25/signup), pet health apps ($5-10/install)
- Content: Health tips, cost breakdowns, breed comparisons, food safety infographics
- Pet content is among the most viral content on the internet

**6. Parenting / Baby & Child**
- Affiliate targets: Baby products (5-15% commissions on high-ticket items), parenting apps ($3-10/install), educational subscriptions ($10-20/signup), childcare platforms ($15-30/lead)
- Content: Milestone timelines, safety infographics, cost visualizations, development tips
- Parents share obsessively within friend groups — strong organic network spread

## Technical Architecture Requirements

### Content Generation Pipeline

```
EVENT DETECTION (fully automated)
    → APIs, scrapers, RSS feeds monitor data sources
    → Trigger rules: "gold moves >1%", "new 5.0+ earthquake", "flight drops below threshold"
    → Each vertical has its own trigger configuration

CONTENT STRATEGY AI (AI-driven, human confirms)
    → Receives event + context
    → Queries Learning Database for historical performance patterns
    → Selects: content layer (L1-L5), visual format, platform, language, posting time
    → Generates: text + visual (GIF/card/infographic)
    → Places in HUMAN REVIEW QUEUE

HUMAN REVIEW (30 seconds per post)
    → Approve / Edit / Reject
    → Edits feed back into learning system as "human preference signal"

POSTING ENGINE (fully automated)
    → Posts to correct platform via API at AI-selected optimal time
    → Handles platform-specific formatting (Twitter card vs Instagram carousel vs TikTok)
    → Monitors real-time engagement

METRICS COLLECTOR (fully automated)
    → Scrapes/polls platform APIs for views, likes, shares, comments, clicks
    → Tracks conversions via affiliate link clicks and UTM parameters
    → Stores all metrics in structured database

LEARNING ENGINE (fully automated, human reviews weekly)
    → Correlates content attributes with performance metrics
    → Updates pattern database: "content_type X + format Y + time Z → N views for demographic D"
    → Generates weekly optimization report for human review
    → Suggests strategy adjustments (human approves)
```

### Data Model (Core Schema)

```
Vertical: {id, name, description, data_sources[], trigger_rules[], affiliate_targets[]}

ContentTemplate: {id, vertical_id, layer (L1-L5), format (gif/card/carousel/text), 
                   platform (twitter/tiktok/instagram/newsletter), language,
                   prompt_template, visual_template, performance_history[]}

Post: {id, template_id, vertical_id, platform, language,
       generated_text, generated_visual_url, posted_at, 
       human_review_status, human_edit_delta,
       metrics: {views, likes, shares, comments, saves, link_clicks, conversions},
       cost: {api_tokens, generation_time_ms}}

Pattern: {id, description, conditions{}, expected_performance{}, 
          confidence_score, sample_size, discovered_at, last_validated,
          applicable_verticals[], applicable_platforms[]}

Campaign: {id, vertical_id, platform, target_demographic,
           strategy_config, active_templates[], budget_allocated,
           performance_summary{}}
```

### Key Technical Decisions to Make

1. **Visual generation approach**: Should we use programmatic SVG/Canvas generation (like the earthquake GIFs), AI image generation APIs, or templated design tools (Figma API, Canva API)?
2. **Platform API strategy**: Direct platform APIs vs. social media management tools (Buffer, Hootsuite APIs) vs. custom posting layer?
3. **Learning engine**: Simple rule-based pattern matching initially, or invest in ML from the start? Recommendation: start rule-based, add ML when dataset is large enough.
4. **Human review UX**: Mobile-first approval queue (founder can approve posts from phone while doing other things) vs. dashboard?
5. **Affiliate tracking**: Custom link shortener with UTM tracking vs. existing affiliate network platforms?
6. **Multi-tenancy**: Build for single-operator first (us), or design for multi-tenant from day one (future B2B)?

### Non-Functional Requirements

- The system must be able to generate and queue 50+ posts per day across all verticals
- Human review queue must be mobile-accessible (WhatsApp bot or Telegram bot for approvals)
- Metrics collection must handle rate limits from platform APIs gracefully
- Learning database must be queryable in real-time during content generation
- System must handle multiple languages (Turkish, English, Vietnamese, Indonesian, Filipino minimum)
- Total operational cost target: <$200/month for API tokens + hosting during test phase

## Business Model

**Phase 1 (Months 1-6): Build audiences, validate virality, collect data**
- Revenue: Affiliate commissions from app installs + product referrals
- Cost: API tokens (~$50-200/month), hosting, founder time

**Phase 2 (Months 6-12): Productize the learning engine**
- Revenue: Affiliate commissions + begin offering "viral content as a service" to app developers
- Pricing model: Free tier (up to 1,000 views/month), then diminishing fee per additional view delivered
- Since we post from client accounts, our only cost is API tokens per post

**Phase 3 (Year 2+): B2B platform**
- Revenue: Self-serve platform where app developers sign up, connect their social accounts, select their target vertical/audience, and the AI handles content generation and posting
- Moat: Proprietary database of "what content drives installs for which app category in which market" — accumulated from months of real experiments across all verticals

## Founders & Context

- **Umut (me)**: Senior full-stack software engineer (C#/.NET, React/TypeScript, AWS). Based in Antalya, Turkey with connections in Vietnam, Philippines, Indonesia. Consulting background, strong backend architecture skills. NOT a marketer — the whole point is to make the AI do the marketing reasoning.
- **Co-founder (developer friend)**: Already built the earthquake GIF Twitter bot that proved the concept (75K views in 2 weeks). Has the visual content generation pipeline working. Based in Turkey.
- **Geographic advantage**: Physical presence in Turkey and SEA gives us native understanding of underserved markets where ASO/marketing tools have thin data.

---

## Competitive Landscape

### Layer 1: Social Media Scheduling Tools (Buffer, Hootsuite, Sprout Social, Later)
- **What they do:** Schedule pre-written posts, suggest posting times, basic analytics
- **Why NOT our competitor:** Content *distribution* tools, not content *creation* tools. Require humans to write every post. Don't generate from data, don't create visuals, don't learn. We would use their APIs or direct platform APIs as our delivery layer
- **Maturity:** Fully commoditized. No opportunity here

### Layer 2: AI Content Writing Tools (Jasper, Copy.ai, Predis.ai, ContentStudio)
- **What they do:** Generate captions, suggest hashtags, repurpose long-form content
- **Partial overlap only:** These help humans write *generic* social content faster. They do NOT monitor real-time data, generate data visualizations/GIFs, or connect content performance to app install conversions. Writing assistants, not autonomous engines
- **Maturity:** Growing fast but converging on same features

### Layer 3: Twitter/X Growth Tools (Tweet Hunter $49/mo, Hypefury $19+/mo, Typefully)
- **Closest adjacent competitor:** Tweet Hunter has a viral tweet library (2M+ tweets), AI writing, scheduling, CRM, and growth analytics
- **Critical difference from us:** Designed for *personal brand builders* growing one account manually. Does NOT do: automated data-triggered posting, visual content generation (GIFs/cards), multi-vertical campaign management, affiliate conversion tracking, or a learning engine that reasons about what works per vertical/demographic
- **Maturity:** Tweet Hunter is well-funded and established but focused on a completely different use case

### Layer 4: Automated Twitter Bots / AI Agents (Bika.ai, n8n workflows, custom bots)
- **Our closest competitive territory:** Auto-post content on schedule
- **Critical difference from us:** Generic "set a topic and auto-post" tools. Don't connect to real-time data APIs, don't generate visual content, have no learning engine, no multi-vertical management, no affiliate tracking. Our earthquake GIF bot is already more sophisticated than anything on the market here
- **Maturity:** Very early, mostly DIY for technical users. No dominant player. This is the space we enter, but with a 10x more sophisticated product

### Layer 5: Affiliate / Influencer Platforms (impact.com, Upfluence, Social Snowball)
- **Complementary, not competitive:** These platforms are where affiliate money flows through. We integrate WITH them, not against them. They need content creators who drive installs — that's us
- **Maturity:** Fully mature infrastructure

### The Whitespace We Occupy
No existing product combines: real-time data triggers + AI visual generation (GIFs/cards) + multi-vertical campaign management + self-learning engine + affiliate conversion tracking + autonomous operation. Each piece exists in isolation; the integrated system does not exist.

### Competitive Risks
- **Not existing tools — other builders.** Vibe coding means someone could build a gold-price Twitter bot tomorrow. Our moat is accumulated learning data and speed of multi-vertical scaling, not the bot code itself
- **Platform risk.** Twitter/X API changes or crackdowns on automation could disrupt operations. Mitigation: multi-platform from early stage
- **Content quality at scale.** Spreading across too many verticals simultaneously = mediocre content everywhere. Must sequence carefully

---

## SWOT Analysis

### Strengths
- **Proven concept:** The earthquake GIF bot achieving 75K views in 2 weeks is not theoretical — it's a working prototype demonstrating the exact mechanics we want to generalize
- **Technical co-founders:** Both founders are senior developers who can build the entire system without hiring or outsourcing. No dependency on external dev teams = faster iteration, lower burn
- **Geographic arbitrage:** Physical presence in Turkey + connections in Vietnam, Philippines, Indonesia gives native market understanding in regions where marketing data is thinnest and growth is fastest. Competitors in SF/London don't have this
- **Near-zero cost structure:** API tokens ($50-200/month) + hosting is the entire operational cost during validation. No office, no employees, no ad spend. Revenue is profit from day one
- **Stealth advantage:** Individual niche accounts are invisible as a coordinated system. Competitors can't see or copy what they don't know exists. By the time we reveal the platform, we have months of proprietary data they can't replicate
- **High-value verticals selected:** Finance and dating affiliates pay $10-200 per conversion. Even modest audience sizes generate meaningful revenue
- **Content is genuinely useful:** Unlike AI slop, our content (gold alerts, price comparisons, dating stats) provides real value. This means organic growth rather than fighting algorithms designed to suppress low-quality content

### Weaknesses
- **Two-person team:** Limited bandwidth means we can't pursue all verticals simultaneously. Must ruthlessly prioritize
- **No marketing expertise:** Both founders are engineers, not marketers. The whole bet is that AI + data can substitute for marketing intuition. This is unproven
- **Platform dependency:** We don't own Twitter, TikTok, or Instagram. Account suspensions, API changes, or algorithm shifts could disrupt operations overnight. We have zero control over distribution
- **Visual content quality ceiling:** Programmatic GIF/card generation may look "automated" to sophisticated audiences. If content looks bot-generated, engagement drops and accounts get flagged
- **No existing audience:** Starting from zero followers on every account. The 2-week test must achieve organic growth without any pre-existing distribution — cold start problem
- **Learning engine is the hardest piece:** Going from "store metrics in a database" to "AI reasons about what content to create next" is a significant engineering challenge. Risk of building a glorified analytics dashboard instead of a true reasoning system
- **Affiliate program dependency:** We don't control affiliate payouts, terms, or program availability. Programs can change commissions, add restrictions, or shut down

### Opportunities
- **AI gold rush timing:** The vibe-coded app flood is creating massive demand for user acquisition. App developers desperately need installs and will pay premium prices for targeted audiences. We're building the supply side of this market
- **Emerging market mobile growth:** Turkey, Vietnam, Philippines, Indonesia are among the fastest-growing app markets globally. Western-focused tools underserve these markets. We're first to build data-driven audience intelligence for these geographies
- **Multi-vertical data network effects:** Every new vertical we add makes the learning engine smarter for ALL verticals. Patterns discovered in finance content ("negative news gets 3x engagement") apply to fitness, dating, and every other vertical. The system gets exponentially more valuable with each addition
- **Stage 2 own-app play:** Building our own apps (gold alert, price comparison, dating quiz) and funneling our audiences to them captures 100% of the value instead of affiliate commissions. The content engine becomes the distribution moat for our own products
- **Content-to-commerce pipeline:** Once we have engaged audiences with clear intent signals (finance followers = want trading tools, dating followers = want dating apps), we can negotiate direct partnerships with app companies at rates far above standard affiliate programs
- **B2B platform potential (Stage 3):** If the learning engine works, we can eventually offer "viral content as a service" to app developers directly — a new category of marketing tool with no direct competitor
- **Proprietary dataset as defensible IP:** After 6+ months of running experiments across verticals, platforms, languages, and demographics, we own a dataset about "what content drives app installs in emerging markets" that doesn't exist anywhere else. This has value to investors, app developers, and potentially to marketing research firms

### Threats
- **Platform crackdowns on automation:** Twitter/X has cracked down on bots repeatedly. Instagram and TikTok have strict automation detection. Even well-designed automated accounts risk suspension
- **API pricing changes:** Twitter/X API pricing has been volatile. A significant price increase could make high-volume posting uneconomical
- **Copycat risk post-Stage 3:** Once we publicly reveal the platform, well-funded competitors (Tweet Hunter, Buffer, Hootsuite) could build similar features in months. Our only defense is the accumulated data and head start
- **AI content detection improving:** Platforms are getting better at detecting AI-generated content and may penalize it algorithmically. LinkedIn already does this. Twitter and TikTok may follow
- **Affiliate fraud detection:** If affiliate programs detect that installs come from automated accounts rather than genuine influencers, they may reject commissions or ban our accounts
- **Content quality degradation at scale:** The more verticals we run simultaneously, the harder it is to maintain the "genuinely useful" standard. If quality drops, engagement drops, and the flywheel breaks
- **Regulatory risk in financial content:** Posting gold/forex price alerts could be interpreted as financial advice in some jurisdictions, requiring disclaimers or licenses. Turkey's capital markets board (SPK) has regulations about financial communications
- **Co-founder alignment risk:** Two-person teams are fragile. If the co-founder relationship breaks down or priorities diverge, the entire venture stalls

---

## Go-to-Market Strategy: Staged Stealth Approach

### Stage 1: Stealth Validation (Months 1-6)
**Goal:** Prove the content engine works, build audiences, generate first affiliate revenue
- Run 4 initial verticals as independent, unbranded niche accounts
- Each account appears to be a standalone passion project — no linking between accounts, no company branding, different emails/registrations
- Human-in-the-loop reviews all content (~30 seconds per post)
- Track all metrics internally in private database
- Revenue: affiliate commissions from app install links embedded in content
- Stealth posture: nobody knows these accounts are connected or that a system exists behind them
- Success metric: $1K-5K/month affiliate revenue, 10K+ followers per account, validated learning patterns across verticals

### Stage 2: Own Product Capture (Months 4-12, overlapping with Stage 1)
**Goal:** Build simple apps in our strongest verticals and funnel our audiences to them directly
- Vibe-code simple apps: gold/forex price alert app, grocery price comparison tool, dating quiz/compatibility app
- Use existing audiences as zero-cost distribution channels
- Capture 100% of value (app revenue) instead of affiliate commissions (typically 10-30% of app revenue)
- Still no public company or platform reveal — each app appears to be a standalone indie product that "happens to have a popular social media presence"
- Success metric: $5K-20K/month combined revenue from own apps + affiliates

### Stage 2.5: Quiet B2B Validation (Months 8-14)
**Goal:** Prove the system works for external apps, not just our own
- Approach 3-5 app developers we know personally (through our network, not cold outreach)
- Offer as "growth consulting" — we manage their social content and drive installs
- Don't reveal the automated system — just deliver results and let the numbers speak
- This proves the platform is generalizable (critical for Stage 3 investor pitch)
- Success metric: demonstrable install growth for 3+ external apps with clear attribution

### Stage 3: Company Formation & Fundraising (Months 12-18+)
**Goal:** Formalize the company, reveal the platform, seek investment for scaling
- Only enter this stage with: real revenue ($20K+/month), proven multi-vertical results, external client case studies, and a working learning engine
- Pitch to investors: "We already generate $X/month across Y verticals. Here's our proprietary data on what drives viral content performance for app install funnels in emerging markets. We want funding to scale the platform and open it to self-serve B2B customers."
- At this point, the accumulated data (6-12 months of experiments across verticals, platforms, and geographies) is the primary defensible asset
- Success metric: seed round closed, B2B platform MVP launched

### Stealth Maintenance Rules
- Never cross-promote between vertical accounts
- Never publicly brand accounts under one company name until Stage 3
- Use separate email addresses, separate API keys, separate everything per account
- If asked "is this AI-generated?" — the content IS genuinely useful regardless of how it was made, but don't volunteer the existence of the platform
- Keep the learning engine database, pattern library, and cross-vertical intelligence strictly internal
- Even in Stage 2.5 B2B validation, present as "growth consulting" not "automated platform"

---

## What I Need From This Brainstorm

1. Validate or challenge the technical architecture above
2. Help me identify the right MVP scope — what's the absolute minimum we build for the 2-week test across 4 verticals?
3. Propose the tech stack (languages, frameworks, databases, APIs, hosting)
4. Identify the riskiest technical assumptions and how to de-risk them
5. Create a development plan with clear phases and milestones
6. Flag any architectural decisions that would be expensive to change later (build right from the start vs. prototype fast)
7. Assess the SWOT — are there threats or weaknesses I'm underestimating?
8. Challenge the staged go-to-market — does the stealth approach make sense, or should we move faster to public?
