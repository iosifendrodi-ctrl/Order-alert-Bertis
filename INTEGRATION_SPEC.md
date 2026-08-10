# Order Alert — Universal Integration Specification

## Purpose
Order Alert is an integration-neutral order exception and verification layer. It is not tied to COSYS, ERP, WMS, TMS, CRM or a specific database.

## Integration boundary
The application consumes and emits a small canonical order model. A connector/adapter translates between the host system and this model.

### Canonical inbound events
- `order.created`
- `order.picking.updated`
- `order.picking.completed`
- `order.cancelled`

### Canonical outbound events
- `order.alert.created`
- `order.alert.acknowledged`
- `order.verification.requested`
- `order.verification.resolved`
- `order.closed`
- `order.close.blocked`

## Canonical order model
```json
{
  "id": "internal-id",
  "external_id": "source-system-order-id",
  "customer": "Customer",
  "agent": "Agent",
  "status": "PICKING_COMPLETED",
  "lines": [
    {"sku":"SKU-1","name":"Product","ordered":10,"picked":8,"unit":"kg"}
  ]
}
```

## Adapter contract
Implement the host-system adapter with:
- `get_orders()`
- `get_order_lines(order_id)`
- `get_picking_lines(order_id)`
- `acknowledge_alert(order_id, actor)`
- `request_verification(order_id, actor)`
- `resolve_verification(order_id, actor, reason, note)`
- `publish_event(event_type, payload)`

The business rules remain in Order Alert; only transport/data mapping belongs in the adapter.

## Supported integration styles
1. REST/JSON API
2. Webhooks
3. Message broker/event bus
4. Database adapter
5. File/CSV/ETL adapter
6. Custom SDK or WebService adapter

No COSYS-specific API is required by the core domain model.

## Production requirements
- TLS for network transport
- authenticated service-to-service calls
- idempotency keys for inbound events
- correlation/request IDs
- server-side audit trail
- persistent database (PostgreSQL recommended for production)
- secret management outside source code
- retry/dead-letter handling for asynchronous events
