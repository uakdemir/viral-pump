# Vertical Management — Wireframe

Basic admin screen for viewing and toggling verticals, data sources, and trigger rules.

## Desktop Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ViralEngine          Review Queue    Posts    Verticals    [U] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Verticals                                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Gold/Forex                                    [Active ●] │  │
│  │  Slug: gold-forex                                         │  │
│  │  Accounts: 1 (Gold Forex EN — Twitter)                    │  │
│  │                                                           │  │
│  │  Data Sources                                             │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  CoinGecko         Poll: 60s    Last: 30s ago  [●] │  │  │
│  │  │  exchangerate.host  Poll: 300s   Last: 2m ago   [●] │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  Trigger Rules                                            │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  Gold >1% (5 min)      Cooldown: 1h   Last: 14:32  │  │  │
│  │  │  Mode: threshold_cross                          [●] │  │  │
│  │  ├─────────────────────────────────────────────────────┤  │  │
│  │  │  USD/TRY >0.5% (5 min) Cooldown: 1h   Last: 13:15  │  │  │
│  │  │  Mode: threshold_cross                          [●] │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                           │  │
│  │  Content Templates                                        │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  gold-price-alert       L1  real-time-event    [●]  │  │  │
│  │  │  gold-historical-ctx    L2  historical-context [●]  │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Notes

- [●] = toggle switch (enabled/disabled)
- MVP is read-only + toggle. No CRUD for verticals/rules/templates via UI.
  Configuration is done via seed SQL and database tools.
- Future: full CRUD forms for creating verticals, adding data sources,
  writing trigger rules, and editing content templates.
