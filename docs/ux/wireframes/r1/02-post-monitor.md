# Post Monitor — Wireframe

Shows automated posting status. Posts are sent to Twitter/X via API automatically after approval.

## Desktop Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ViralEngine          Review Queue    Posts    Verticals    [U] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Tabs: [ Pending (1) ]  [ Posted (15) ]  [ Failed (0) ]        │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Gold Price Alert — @GoldForexEN (Twitter)                │  │
│  │  Status: ● Posted                                         │  │
│  │  Posted: Mar 17, 2026 at 14:32    Tweet ID: 18392847...   │  │
│  │                                                           │  │
│  │  ┌──────────┐  "Gold just crossed $2,350 — up 1.2%       │  │
│  │  │  [PNG    │   in the last 5 minutes. Last time this     │  │
│  │  │  thumb]  │   happened was Feb 14, when it continued    │  │
│  │  │          │   to rise 3% over the next 48 hours."       │  │
│  │  └──────────┘                                             │  │
│  │                                                           │  │
│  │  Template: gold-price-alert · L1 · Real-time Event        │  │
│  │  Cost: 142 tokens · Generated 45 min ago                  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  USD/TRY Movement — @GoldForexEN (Twitter)                │  │
│  │  Status: ● Posted                                         │  │
│  │  Posted: Mar 17, 2026 at 13:15    Tweet ID: 18392631...   │  │
│  │  ...                                                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Failed Post (with retry)

```
┌───────────────────────────────────────────────────────────────┐
│  Gold Historical Context — @GoldForexEN (Twitter)             │
│  Status: ● Failed (attempt 3/3)                               │
│  Error: "Rate limit exceeded. Retry after 2026-03-17T15:00Z"  │
│                                                               │
│  ┌──────────┐  "In the last 30 days, gold has crossed the    │
│  │  [PNG    │   $2,300 mark five times..."                    │
│  │  thumb]  │                                                 │
│  └──────────┘                                                 │
│                                                               │
│  [ Retry Now ]                                                │
└───────────────────────────────────────────────────────────────┘
```

## Pending Post (queued, awaiting worker)

```
┌───────────────────────────────────────────────────────────────┐
│  EUR/TRY Alert — @GoldForexEN (Twitter)                       │
│  Status: ○ Pending (queued for posting)                       │
│  Approved: 30 seconds ago                                     │
│                                                               │
│  "EUR/TRY just hit 41.20 — a 0.7% jump..."                   │
│                                                               │
│  ⏳ Waiting for worker to post...                             │
└───────────────────────────────────────────────────────────────┘
```

## Mobile Layout

```
┌─────────────────────────────┐
│  ViralEngine        [≡]    │
├─────────────────────────────┤
│                             │
│ [Pending(1)] [Posted] [Fail]│
│                             │
│  ┌───────────────────────┐  │
│  │  ● Posted             │  │
│  │  Gold Price Alert     │  │
│  │  @GoldForexEN         │  │
│  │  14:32 · ID: 1839...  │  │
│  │                        │  │
│  │  "Gold just crossed   │  │
│  │   $2,350 — up 1.2%"  │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │  ● Posted             │  │
│  │  USD/TRY Movement     │  │
│  │  ...                  │  │
│  └───────────────────────┘  │
│                             │
│  [Review Queue] [Posts] [⚙] │
└─────────────────────────────┘
```

## Notes

- Posts are sent automatically via Twitter/X API after approval
- No manual copy/paste/compose workflow needed
- Failed posts can be retried with a single click
- Pending tab shows posts queued but not yet picked up by worker
