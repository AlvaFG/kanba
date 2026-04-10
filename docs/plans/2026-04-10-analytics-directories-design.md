# Analytics Directories, Detail & Export — Design Document

**Date:** 2026-04-10
**Status:** Approved

## Problem

The 3 Aramal founders need to see individual user accounts and restaurant details in the analytics dashboard, not just aggregated metrics. They also need to export data as CSV for external reporting.

## Features

### 1. User Directory

- Page: `/dashboard/analytics/users`
- Searchable, filterable table of all users (business + customer)
- Columns: name, email (full, unmasked), account type, email verified, created date
- Filters: search (name/email), type (business/customer)
- Pagination (server-side)
- Export CSV button (respects active filters)

### 2. Restaurant Directory

- Page: `/dashboard/analytics/restaurants`
- Searchable table of all restaurants
- Columns: name, owner name, created date, completeness badges (menu, hours, tables, staff, ePagos)
- Filters: search (name)
- Pagination (server-side)
- Click row → navigate to detail page
- Export CSV button

### 3. Restaurant Detail

- Page: `/dashboard/analytics/restaurants/[id]`
- Back button to restaurant list
- Restaurant info card: name, owner, email, phone, address, created date
- KPI cards: total orders, revenue, avg ticket, avg feedback rating
- Completeness checklist: menu, hours, tables, staff, ePagos (checkmark or X)
- Top 5 menu items by quantity ordered
- Staff count and roles

### 4. CSV Export

- Available on: user directory, restaurant directory
- Endpoint returns `Content-Type: text/csv` with `Content-Disposition: attachment`
- Respects active filters (search, type)
- Next.js proxy forwards to analytics-api and streams the file

## API Endpoints

### GET /users
- Query params: `?search=`, `?type=business|customer`, `?page=1`, `?limit=25`
- Returns: `{ data: User[], total: number, page: number, limit: number }`
- User: `{ id, email, fullName, accountType, emailVerified, createdAt }`

### GET /restaurants
- Query params: `?search=`, `?page=1`, `?limit=25`
- Returns: `{ data: Restaurant[], total: number, page: number, limit: number }`
- Restaurant: `{ id, name, ownerName, ownerEmail, createdAt, hasMenu, hasHours, hasTables, hasStaff, hasEpagos }`

### GET /restaurants/:id
- Returns: `{ info: {...}, metrics: { totalOrders, revenue, avgTicket, avgRating }, completeness: {...}, topItems: [...], staff: { total, active, byRole: [...] } }`

### GET /export/:type
- Type: `users` or `restaurants`
- Query params: same as list endpoints (search, type filters)
- Returns: CSV file with `Content-Type: text/csv`

## Navigation

Tabs added to existing analytics layout:

```
Overview | Growth | Transactions | Activity | Users | Restaurants
```

Restaurant detail is a sub-page of restaurants, no tab.

## Security

- All data read-only via analytics_reader PostgreSQL user
- API key auth (same as existing endpoints)
- Full emails shown (internal tool, 3 founders only)
- No edit/delete capabilities
