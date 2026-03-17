# Review Queue — Wireframe

The primary screen. Shows content items awaiting human review.

## Desktop Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ViralEngine          Review Queue    Posts    Verticals    [U] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Filters: [All Verticals ▼]  [All Categories ▼]  [All Layers ▼]│
│                                                                 │
│  Pending Review (3)                                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ┌──────────┐                                             │  │
│  │  │          │  Gold Price Alert — L1 Real-time Event      │  │
│  │  │  [PNG    │  Template: gold-price-alert                 │  │
│  │  │  Preview]│                                             │  │
│  │  │          │  "Gold just crossed $2,350 — up 1.2% in    │  │
│  │  │          │   the last 5 minutes. Last time this        │  │
│  │  └──────────┘   happened was Feb 14, when it continued    │  │
│  │                  to rise 3% over the next 48 hours."      │  │
│  │                                                           │  │
│  │  Generated: 2 min ago    Cost: 142 tokens / 1.2s         │  │
│  │                                                           │  │
│  │  [ Approve ]   [ Edit ]   [ Reject ]                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ┌──────────┐                                             │  │
│  │  │          │  USD/TRY Movement — L1 Real-time Event      │  │
│  │  │  [PNG    │  Template: forex-rate-alert                 │  │
│  │  │  Preview]│                                             │  │
│  │  │          │  "USD/TRY just hit 38.45 — a 0.6% jump     │  │
│  │  │          │   in 5 minutes. The lira has weakened..."   │  │
│  │  └──────────┘                                             │  │
│  │                                                           │  │
│  │  Generated: 5 min ago    Cost: 128 tokens / 1.1s         │  │
│  │                                                           │  │
│  │  [ Approve ]   [ Edit ]   [ Reject ]                     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Mobile Layout (accessed via Telegram deep-link in future)

```
┌─────────────────────────────┐
│  ViralEngine        [≡]    │
├─────────────────────────────┤
│                             │
│  Pending Review (3)         │
│                             │
│  ┌───────────────────────┐  │
│  │  ┌─────────────────┐  │  │
│  │  │                  │  │  │
│  │  │   [PNG Preview]  │  │  │
│  │  │                  │  │  │
│  │  └─────────────────┘  │  │
│  │                        │  │
│  │  Gold Price Alert      │  │
│  │  L1 · Real-time Event  │  │
│  │                        │  │
│  │  "Gold just crossed    │  │
│  │   $2,350 — up 1.2%    │  │
│  │   in the last 5 min.  │  │
│  │   Last time this..."  │  │
│  │                        │  │
│  │  2 min ago · 142 tkns  │  │
│  │                        │  │
│  │  [Approve] [Edit] [✗]  │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │  ┌─────────────────┐  │  │
│  │  │   [PNG Preview]  │  │  │
│  │  └─────────────────┘  │  │
│  │  USD/TRY Movement     │  │
│  │  ...                  │  │
│  └───────────────────────┘  │
│                             │
│  [Review Queue] [Posts] [⚙] │
└─────────────────────────────┘
```

## Edit Modal (opens on "Edit" click)

```
┌─────────────────────────────────────────┐
│  Edit Content                     [✕]   │
├─────────────────────────────────────────┤
│                                         │
│  Original (read-only):                  │
│  ┌───────────────────────────────────┐  │
│  │ "Gold just crossed $2,350 — up   │  │
│  │  1.2% in the last 5 minutes..."  │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Your edit:                             │
│  ┌───────────────────────────────────┐  │
│  │ "Gold just crossed $2,350 — up   │  │
│  │  1.2% in the last 5 minutes.     │  │
│  │  [cursor]                         │  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│  Characters: 142 / 280                  │
│                                         │
│  [ Cancel ]         [ Save & Approve ]  │
└─────────────────────────────────────────┘
```
