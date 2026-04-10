# Analytics Directories, Detail & Export — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add user directory, restaurant directory, restaurant detail view, and CSV export to the analytics dashboard.

**Architecture:** 4 new endpoints in analytics-api (users, restaurants, restaurants/:id, export/:type) + 3 new frontend pages + export proxy route. All read-only, same auth pattern.

**Tech Stack:** Fastify, pg (analytics-api) · Next.js 13, shadcn/ui Table, Recharts (frontend)

---

## Phase 1: Backend — New API Endpoints

### Task 1: Users list endpoint

**Files:**
- Create: `analytics-api/src/routes/users.ts`
- Modify: `analytics-api/src/index.ts`

**Step 1: Create users.ts**

```typescript
import { FastifyInstance } from 'fastify';
import { query } from '../db';
import * as cache from '../cache';

interface QueryParams {
  search?: string;
  type?: string;
  page?: string;
  limit?: string;
}

export async function usersRoutes(app: FastifyInstance) {
  app.get('/', async (request) => {
    const { search, type, page = '1', limit = '25' } = request.query as QueryParams;
    const key = cache.cacheKey('/users', { search: search || '', type: type || '', page, limit });
    const cached = cache.get(key);
    if (cached) return cached;

    const conditions: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    const p = parseInt(page);
    const l = Math.min(parseInt(limit), 100);

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }
    if (type && ['business', 'customer'].includes(type)) {
      params.push(type);
      conditions.push(`account_type = $${params.length}`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [countResult] = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM users ${where}`, params
    );

    const offset = (p - 1) * l;
    const rows = await query<{
      id: string; email: string; full_name: string;
      account_type: string; email_verified: boolean; created_at: string;
    }>(
      `SELECT id, email, full_name, account_type, email_verified, created_at
      FROM users ${where}
      ORDER BY created_at DESC
      LIMIT ${l} OFFSET ${offset}`,
      params
    );

    const data = {
      data: rows.map(r => ({
        id: r.id, email: r.email, fullName: r.full_name,
        accountType: r.account_type, emailVerified: r.email_verified,
        createdAt: r.created_at,
      })),
      total: +countResult.total,
      page: p,
      limit: l,
    };

    cache.set(key, data);
    return data;
  });
}
```

**Step 2: Register route in index.ts**

Add import and registration:
```typescript
import { usersRoutes } from './routes/users';
// ...
app.register(usersRoutes, { prefix: '/users' });
```

**Step 3: Verify build**

Run: `cd analytics-api && npm run build`
Expected: No errors

**Step 4: Commit**

```bash
git add analytics-api/src/routes/users.ts analytics-api/src/index.ts
git commit -m "feat: add users list endpoint with search and pagination"
```

---

### Task 2: Restaurants list endpoint

**Files:**
- Create: `analytics-api/src/routes/restaurants.ts`
- Modify: `analytics-api/src/index.ts`

**Step 1: Create restaurants.ts**

```typescript
import { FastifyInstance } from 'fastify';
import { query } from '../db';
import * as cache from '../cache';

interface QueryParams {
  search?: string;
  page?: string;
  limit?: string;
}

export async function restaurantsRoutes(app: FastifyInstance) {
  app.get('/', async (request) => {
    const { search, page = '1', limit = '25' } = request.query as QueryParams;
    const key = cache.cacheKey('/restaurants', { search: search || '', page, limit });
    const cached = cache.get(key);
    if (cached) return cached;

    const conditions: string[] = [];
    const params: unknown[] = [];
    const p = parseInt(page);
    const l = Math.min(parseInt(limit), 100);

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`a.name ILIKE $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult] = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM activities a ${where}`, params
    );

    const offset = (p - 1) * l;
    const rows = await query<{
      id: string; name: string; owner_name: string; owner_email: string;
      created_at: string; has_menu: boolean; has_hours: boolean;
      has_tables: boolean; has_staff: boolean; has_epagos: boolean;
    }>(
      `SELECT
        a.id, a.name, u.full_name AS owner_name, u.email AS owner_email,
        a.created_at,
        EXISTS(SELECT 1 FROM menu_items mi WHERE mi.activity_id = a.id) AS has_menu,
        EXISTS(SELECT 1 FROM business_hours bh WHERE bh.restaurant_id = a.id) AS has_hours,
        EXISTS(SELECT 1 FROM tables t WHERE t.restaurant_id = a.id) AS has_tables,
        EXISTS(SELECT 1 FROM staff s WHERE s.restaurant_id = a.id AND s.is_active) AS has_staff,
        EXISTS(SELECT 1 FROM epagos_config ec WHERE ec.restaurant_id = a.id) AS has_epagos
      FROM activities a
      JOIN users u ON a.owner_id = u.id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT ${l} OFFSET ${offset}`,
      params
    );

    const data = {
      data: rows.map(r => ({
        id: r.id, name: r.name, ownerName: r.owner_name, ownerEmail: r.owner_email,
        createdAt: r.created_at,
        hasMenu: r.has_menu, hasHours: r.has_hours, hasTables: r.has_tables,
        hasStaff: r.has_staff, hasEpagos: r.has_epagos,
      })),
      total: +countResult.total,
      page: p,
      limit: l,
    };

    cache.set(key, data);
    return data;
  });

  // Restaurant detail - Task 3
}
```

**Step 2: Register route in index.ts**

```typescript
import { restaurantsRoutes } from './routes/restaurants';
// ...
app.register(restaurantsRoutes, { prefix: '/restaurants' });
```

**Step 3: Verify build and commit**

```bash
cd analytics-api && npm run build
git add analytics-api/src/routes/restaurants.ts analytics-api/src/index.ts
git commit -m "feat: add restaurants list endpoint with completeness flags"
```

---

### Task 3: Restaurant detail endpoint

**Files:**
- Modify: `analytics-api/src/routes/restaurants.ts`

**Step 1: Add detail route inside restaurantsRoutes**

After the list route, add:

```typescript
  app.get('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const key = cache.cacheKey(`/restaurants/${id}`, {});
    const cached = cache.get(key);
    if (cached) return cached;

    // Restaurant info
    const [info] = await query<{
      id: string; name: string; owner_name: string; owner_email: string;
      address: string; phone: string; email: string; created_at: string;
      is_open: boolean;
    }>(
      `SELECT a.id, a.name, u.full_name AS owner_name, u.email AS owner_email,
        a.address, a.phone, a.email, a.created_at, a.is_open
      FROM activities a
      JOIN users u ON a.owner_id = u.id
      WHERE a.id = $1`, [id]
    );

    if (!info) return { error: 'Restaurant not found' };

    // Metrics
    const [metrics] = await query<{
      total_orders: string; revenue: string; avg_ticket: string;
    }>(
      `SELECT COUNT(*) AS total_orders, COALESCE(SUM(total), 0) AS revenue,
        COALESCE(AVG(total), 0) AS avg_ticket
      FROM orders WHERE restaurant_id = $1 AND status != 'cancelled'`, [id]
    );

    const [feedback] = await query<{ avg_rating: string; total_reviews: string }>(
      `SELECT AVG(rating) AS avg_rating, COUNT(*) AS total_reviews
      FROM customer_feedback WHERE restaurant_id = $1`, [id]
    );

    // Completeness
    const [completeness] = await query<{
      has_menu: boolean; has_hours: boolean; has_tables: boolean;
      has_staff: boolean; has_epagos: boolean;
    }>(
      `SELECT
        EXISTS(SELECT 1 FROM menu_items WHERE activity_id = $1) AS has_menu,
        EXISTS(SELECT 1 FROM business_hours WHERE restaurant_id = $1) AS has_hours,
        EXISTS(SELECT 1 FROM tables WHERE restaurant_id = $1) AS has_tables,
        EXISTS(SELECT 1 FROM staff WHERE restaurant_id = $1 AND is_active) AS has_staff,
        EXISTS(SELECT 1 FROM epagos_config WHERE restaurant_id = $1) AS has_epagos`,
      [id]
    );

    // Top 5 items
    const topItems = await query<{ name: string; quantity: string; revenue: string }>(
      `SELECT mi.name, SUM(oi.quantity) AS quantity, SUM(oi.subtotal) AS revenue
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.restaurant_id = $1 AND o.status != 'cancelled'
      GROUP BY mi.name ORDER BY quantity DESC LIMIT 5`, [id]
    );

    // Staff
    const staffByRole = await query<{ role: string; count: string }>(
      `SELECT role, COUNT(*) AS count FROM staff
      WHERE restaurant_id = $1 AND is_active GROUP BY role ORDER BY count DESC`, [id]
    );

    const [staffTotals] = await query<{ total: string; active: string }>(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active
      FROM staff WHERE restaurant_id = $1`, [id]
    );

    const data = {
      info: {
        id: info.id, name: info.name, ownerName: info.owner_name,
        ownerEmail: info.owner_email, address: info.address,
        phone: info.phone, email: info.email, createdAt: info.created_at,
        isOpen: info.is_open,
      },
      metrics: {
        totalOrders: +metrics.total_orders, revenue: +metrics.revenue,
        avgTicket: +(+metrics.avg_ticket).toFixed(2),
        avgRating: feedback.avg_rating ? +(+feedback.avg_rating).toFixed(1) : null,
        totalReviews: +feedback.total_reviews,
      },
      completeness: {
        hasMenu: completeness.has_menu, hasHours: completeness.has_hours,
        hasTables: completeness.has_tables, hasStaff: completeness.has_staff,
        hasEpagos: completeness.has_epagos,
      },
      topItems: topItems.map(r => ({ name: r.name, quantity: +r.quantity, revenue: +(+r.revenue).toFixed(2) })),
      staff: {
        total: +staffTotals.total, active: +staffTotals.active,
        byRole: staffByRole.map(r => ({ role: r.role, count: +r.count })),
      },
    };

    cache.set(key, data);
    return data;
  });
```

**Step 2: Verify build and commit**

```bash
cd analytics-api && npm run build
git add analytics-api/src/routes/restaurants.ts
git commit -m "feat: add restaurant detail endpoint with metrics and completeness"
```

---

### Task 4: CSV export endpoint

**Files:**
- Create: `analytics-api/src/routes/export.ts`
- Modify: `analytics-api/src/index.ts`

**Step 1: Create export.ts**

```typescript
import { FastifyInstance } from 'fastify';
import { query } from '../db';

interface QueryParams {
  search?: string;
  type?: string;
}

function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const escape = (val: unknown) => {
    const s = String(val ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

export async function exportRoutes(app: FastifyInstance) {
  app.get('/:type', async (request, reply) => {
    const { type } = request.params as { type: string };
    const q = request.query as QueryParams;

    if (type === 'users') {
      const conditions: string[] = ['deleted_at IS NULL'];
      const params: unknown[] = [];

      if (q.search) {
        params.push(`%${q.search}%`);
        conditions.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length})`);
      }
      if (q.type && ['business', 'customer'].includes(q.type)) {
        params.push(q.type);
        conditions.push(`account_type = $${params.length}`);
      }

      const where = `WHERE ${conditions.join(' AND ')}`;
      const rows = await query<Record<string, unknown>>(
        `SELECT full_name, email, account_type, email_verified, created_at
        FROM users ${where} ORDER BY created_at DESC`, params
      );

      const csv = toCsv(['full_name', 'email', 'account_type', 'email_verified', 'created_at'], rows);
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="users.csv"');
      return reply.send(csv);
    }

    if (type === 'restaurants') {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (q.search) {
        params.push(`%${q.search}%`);
        conditions.push(`a.name ILIKE $${params.length}`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = await query<Record<string, unknown>>(
        `SELECT a.name, u.full_name AS owner_name, u.email AS owner_email,
          a.address, a.phone, a.created_at
        FROM activities a
        JOIN users u ON a.owner_id = u.id
        ${where} ORDER BY a.created_at DESC`, params
      );

      const csv = toCsv(['name', 'owner_name', 'owner_email', 'address', 'phone', 'created_at'], rows);
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', 'attachment; filename="restaurants.csv"');
      return reply.send(csv);
    }

    return reply.code(400).send({ error: 'Invalid export type. Use "users" or "restaurants".' });
  });
}
```

**Step 2: Register route in index.ts**

```typescript
import { exportRoutes } from './routes/export';
// ...
app.register(exportRoutes, { prefix: '/export' });
```

**Step 3: Verify build and commit**

```bash
cd analytics-api && npm run build
git add analytics-api/src/routes/export.ts analytics-api/src/index.ts
git commit -m "feat: add CSV export endpoint for users and restaurants"
```

---

## Phase 2: Frontend — New Pages

### Task 5: Update analytics layout tabs

**Files:**
- Modify: `app/dashboard/analytics/layout.tsx`

**Step 1: Add Users and Restaurants tabs**

Add to the tabs array:
```typescript
{ label: 'Users', href: '/dashboard/analytics/users' },
{ label: 'Restaurants', href: '/dashboard/analytics/restaurants' },
```

**Step 2: Commit**

```bash
git add app/dashboard/analytics/layout.tsx
git commit -m "feat: add Users and Restaurants tabs to analytics layout"
```

---

### Task 6: Users directory page

**Files:**
- Create: `app/dashboard/analytics/users/page.tsx`

**Step 1: Create the page**

A 'use client' page with:
- Search input (debounced, 300ms)
- Type filter: All / Business / Customer (buttons or select)
- shadcn Table with columns: Name, Email, Type (badge), Verified (check/X), Created
- Pagination controls (Previous/Next + page indicator)
- "Export CSV" button top-right that triggers file download via `/api/analytics/export/users`
- Loading skeletons, error state with retry
- Fetches from `/api/analytics/users?search=&type=&page=&limit=25`

The export button should create a temporary `<a>` element with href to the export URL including current filters, triggering download.

**Step 2: Commit**

```bash
git add app/dashboard/analytics/users/
git commit -m "feat: add users directory page with search, filters, and CSV export"
```

---

### Task 7: Restaurants directory page

**Files:**
- Create: `app/dashboard/analytics/restaurants/page.tsx`

**Step 1: Create the page**

Similar to users page but for restaurants:
- Search input (debounced)
- shadcn Table: Name, Owner, Created, and 5 completeness badges (Menu, Hours, Tables, Staff, ePagos) as colored dots or checkmarks
- Clickable rows → navigate to `/dashboard/analytics/restaurants/[id]`
- Pagination, Export CSV button
- Loading skeletons, error state

**Step 2: Commit**

```bash
git add app/dashboard/analytics/restaurants/
git commit -m "feat: add restaurants directory page with completeness badges"
```

---

### Task 8: Restaurant detail page

**Files:**
- Create: `app/dashboard/analytics/restaurants/[id]/page.tsx`

**Step 1: Create the page**

- Back button (← Back to restaurants) linking to `/dashboard/analytics/restaurants`
- Restaurant info card: name, owner, email, phone, address, created date, open/closed status
- 4 KPI cards grid: Total Orders, Revenue ($), Avg Ticket ($), Avg Rating (stars)
- Completeness checklist: 5 items with green checkmark or red X
- Top 5 items table: Item name, Quantity, Revenue
- Staff summary: total/active + role breakdown
- Loading skeletons, error state, 404 if restaurant not found
- Fetches from `/api/analytics/restaurants/[id]`

**Step 2: Commit**

```bash
git add app/dashboard/analytics/restaurants/
git commit -m "feat: add restaurant detail page with metrics and completeness"
```

---

## Phase 3: Deploy

### Task 9: Build, push, and deploy

**Step 1: Verify analytics-api builds**

```bash
cd analytics-api && npm run build
```

**Step 2: Push to GitHub**

```bash
git push origin main
```

**Step 3: Trigger Vercel deploy**

```bash
curl -X POST "https://api.vercel.com/v1/integrations/deploy/prj_Nw8NPSdE0hkw9Eu7cLVZ6dZuUIGZ/jiOrD9DSf0"
```

**Step 4: Build and push analytics-api Docker image**

The CI workflow will build on push. If needed manually:
```bash
cd analytics-api && docker build --platform linux/arm64 -t ghcr.io/alvafg/analytics-api:latest .
docker push ghcr.io/alvafg/analytics-api:latest
```

**Step 5: Restart analytics-api pod to pick up new image**

```bash
export KUBECONFIG=~/.kube/config
kubectl rollout restart deployment analytics-api -n aramal
```

**Step 6: Verify endpoints work**

```bash
curl -H "x-api-key: KEY" https://analytics-api.aramal.co/users
curl -H "x-api-key: KEY" https://analytics-api.aramal.co/restaurants
curl -H "x-api-key: KEY" "https://analytics-api.aramal.co/restaurants/RESTAURANT_ID"
curl -H "x-api-key: KEY" https://analytics-api.aramal.co/export/users
```
