# Order Alert v1.4 — Prototype / Demo

A professional prototype for monitoring order vs. picked quantities, applying configurable alert rules, notifying sales agents, handling verification requests, and providing management reporting.

## Current scope
- Simulated COSYS connector (replaceable by a real API/WebService adapter later)
- Order lifecycle: Confirmed → Sent to Warehouse → Picking → Picking Completed
- Automatic comparison of ordered vs. picked quantities
- Configurable global and product-level thresholds
- Critical products
- Zero-quantity alerts
- One notification per alert event
- Agent acknowledgment and verification request
- Warehouse verification workflow
- Reason codes for shortages
- Audit trail
- Immutable close snapshot and read-only order history
- Management dashboard
- CSV export
- Demo data

## Run
1. Install Python 3.10+.
2. `pip install -r requirements.txt`
3. `python app.py`
4. Open http://127.0.0.1:5000

The prototype keeps external-system integration behind a vendor-neutral `IntegrationConnector`. Implement the adapter for the target ERP/WMS/OMS/TMS/POS/custom system without changing the core workflow.
