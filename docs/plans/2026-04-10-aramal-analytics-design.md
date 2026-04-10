# Aramal Analytics Dashboard — Design Document

**Date:** 2026-04-10
**Status:** Approved

## Problem

Los 3 socios de Aramal necesitan un lugar para visualizar métricas de la plataforma: crecimiento de cuentas, transacciones, volumen de dinero, y actividad de los restaurantes. La información vive en la DB de producción (PostgreSQL en K3s) pero no hay forma de consultarla sin acceso directo al servidor.

## Decision

Agregar una sección de analytics al repo `kanba` (ya usado por el equipo para tareas) que consulta los datos de Aramal via un API proxy read-only desplegado en K3s.

## Architecture

```
Vercel (kanba)                        K3s Cluster (aramal)
┌─────────────────────┐              ┌─────────────────────────┐
│ Next.js             │   HTTPS      │ analytics-api (Fastify) │
│ /dashboard/analytics│──────────────▶│ read-only queries       │
│                     │  API key     │         │                │
│ Auth: Supabase      │              │         ▼                │
│ Data: Supabase      │              │ PostgreSQL (ClusterIP)   │
└─────────────────────┘              │                          │
                                     │ Cloudflare Tunnel        │
                                     │ analytics-api.aramal.co  │
                                     └─────────────────────────┘
```

### Key decisions

- **DB never exposed to internet.** The API proxy runs inside K3s and is the only thing that touches PostgreSQL.
- **Read-only PostgreSQL user** (`analytics_reader`) with SELECT-only grants.
- **API returns aggregates only** — counts, sums, averages. Never raw sensitive data (passwords, tokens).
- **Auth:** Supabase handles who can access kanba. API key authenticates kanba→analytics-api.
- **Cache:** In-memory. Auto-refreshes daily at 9:00 AM ART (12:00 UTC). Manual refresh via button.

## API Proxy (`analytics-api`)

### Stack

- Fastify (Node.js)
- pg (PostgreSQL driver, no ORM)
- node-cron (daily refresh)
- In-memory cache (Map)

### Endpoints

All endpoints accept: `?period=day|week|month|year`, `?from=DATE&to=DATE`, `?restaurant_id=UUID`

#### Overview
- `GET /overview` — KPI summary: total accounts, restaurants, orders, revenue, change vs previous period

#### Growth
- `GET /growth/accounts` — Accounts by period, business vs customer, verification rate
- `GET /growth/restaurants` — Restaurants by period, profile completeness

#### Transactions
- `GET /transactions/orders` — Orders by period/restaurant, avg ticket, top items
- `GET /transactions/revenue` — Revenue by period/restaurant/payment method
- `GET /transactions/payments` — Payment status, ePagos settlements, commissions

#### Activity
- `GET /activity/engagement` — Waiter calls, reservations, feedback, table sessions
- `GET /activity/loyalty` — Programs, points issued/redeemed, balances
- `GET /activity/staff` — Staff count per restaurant, roles

#### Cache
- `POST /refresh` — Force cache invalidation and recalculation

### Infrastructure

- Docker image: `ghcr.io/alvafg/analytics-api` (Node 20 Alpine, multi-stage, `--platform=$BUILDPLATFORM`)
- K8s: Deployment + ClusterIP Service in `k8s/base/`
- Argo CD auto-syncs from repo
- Cloudflare Tunnel route: `analytics-api.aramal.co`
- Sealed Secret for API key + DB password

### PostgreSQL user

```sql
CREATE USER analytics_reader WITH PASSWORD '...';
GRANT CONNECT ON DATABASE restaurant_db TO analytics_reader;
GRANT USAGE ON SCHEMA public TO analytics_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO analytics_reader;
```

### File structure

```
analytics-api/
  Dockerfile
  package.json
  tsconfig.json
  src/
    index.ts          — Fastify server + API key auth middleware
    cache.ts          — Cache manager + node-cron daily refresh 9am ART
    db.ts             — pg Pool (read-only connection)
    routes/
      overview.ts
      growth.ts
      transactions.ts
      activity.ts
      refresh.ts
```

## Frontend (kanba)

### New pages

```
/dashboard/analytics/              — Overview with KPI cards
/dashboard/analytics/growth        — Account & restaurant growth charts
/dashboard/analytics/transactions  — Orders, revenue, payments
/dashboard/analytics/activity      — Engagement, loyalty, staff
```

### Components

- KPI cards (total, change vs previous period)
- Line/area charts (Recharts — already installed)
- Bar charts, pie charts
- Data tables for detailed breakdowns
- Period selector (day/week/month/year)
- Date range picker
- Restaurant filter dropdown
- "Refresh" button → `POST /refresh`

### Changes to existing code

- New env vars: `NEXT_PUBLIC_ANALYTICS_API_URL`, `ANALYTICS_API_KEY`
- New hook: `useAnalytics()` — fetch wrapper with API key
- Sidebar: new "Analytics" navigation item
- 4 new page files + chart components

## Users

3 socios access the same dashboard. No role differentiation. Auth handled by existing Supabase login in kanba.

## Cache strategy

- All endpoint responses cached in-memory (Map keyed by endpoint + query params)
- Auto-refresh: node-cron clears cache daily at 12:00 UTC (9:00 AM ART)
- Manual refresh: `POST /refresh` clears entire cache, next request recalculates
- No Redis needed — single pod, low traffic
