# v10 — Picking Persistence Fix

The picking quantity is authoritative only after the Depot/Picking save action.

Required flow:
Depot input -> persistent save -> order record -> Management/Agent read the same saved values.

Acceptance test:
1. Order: 16 kg.
2. Enter picked: 6 kg.
3. Finalize/save picking.
4. Leave the app completely.
5. Reopen the order.
6. Values must remain 16 ordered / 6 picked / 10 missing.
7. With warning=15% and critical=40%, severity is CRITICAL (62.5%).

The same persisted record must feed dashboard aggregation and order details.
