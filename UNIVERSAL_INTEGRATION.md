# Universal Integration Architecture

Order Alert is designed as a **vendor-neutral exception layer**.

```text
ERP / OMS / WMS / TMS / POS / Custom Software
                │
        Adapter / API / Webhook
                │
        Canonical Order Model
                │
          ORDER ALERT CORE
      ┌─────────┼──────────┐
      │         │          │
   Alerts   Verification  History
      │         │          │
      └─────────┼──────────┘
                │
        Events / REST API
                │
       Host system / BI / Audit
```

The existing demo keeps SQLite for demonstration. For production, replace it with a managed relational database and implement one adapter for the target system. The business workflow does not need to change when the source system changes.
