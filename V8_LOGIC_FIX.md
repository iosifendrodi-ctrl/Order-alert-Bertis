# Order Alert v8 — Logic Fix

Canonical shortage calculation:

shortage_pct = max(0, (ordered - picked) / ordered * 100)

Severity:
- shortage_pct < warning threshold -> ok
- shortage_pct >= warning threshold and < critical threshold -> warning
- shortage_pct >= critical threshold -> critical

Acceptance test:
- ordered = 16
- picked = 15
- missing = 1
- shortage_pct = 6.25%
- warning = 5%
- critical = 20%
- expected severity = warning

Thresholds remain configurable.
