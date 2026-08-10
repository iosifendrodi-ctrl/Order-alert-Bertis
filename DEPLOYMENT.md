# Deployment & COSYS Integration Guide

## Prototype
The included application is intentionally vendor-neutral. It uses a replaceable `IntegrationConnector` boundary.

## Production integration
Replace the prototype connector with the real COSYS integration after confirming:
1. API/WebService availability
2. Authentication mechanism
3. Order endpoint / export
4. Picking endpoint / export
5. Order and line identifiers
6. Status values
7. Push notification mechanism, if available

## Security
For production:
- HTTPS only
- secrets in environment variables / secret manager
- role-based access
- audit logging
- database backups
- monitoring
- no credentials in source code

## Recommended production stack
- Backend: ASP.NET Core / .NET or the existing organization's standard
- DB: SQL Server or PostgreSQL
- Frontend: React + TypeScript
- Notifications: COSYS push if supported, otherwise a dedicated mobile companion or approved messaging gateway

## Important
The prototype is a functional demonstration of the business logic, not a claim that it is already connected to a specific COSYS installation.
