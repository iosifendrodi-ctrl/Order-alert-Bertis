# Order Alert v11 — Close & History

Lifecycle:
ACTIVE -> RESOLVED -> CLOSED

Management can:
- review order details;
- add a resolution note;
- close the order after confirmation;
- retain an immutable audit snapshot;
- browse active and closed orders separately.

The v10 shortage calculation and configurable thresholds are preserved.

Acceptance test:
16 ordered / 6 picked / 10 missing = 62.5% => Critical with thresholds 15% / 40%.
After closing, the order must appear in History with its original values and severity.
