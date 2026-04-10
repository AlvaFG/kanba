# Aramal Analytics Dashboard — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add analytics dashboards to kanba that display Aramal platform metrics via a read-only API proxy.

**Architecture:** Fastify API proxy in K3s reads from PostgreSQL with a read-only user. Kanba (Next.js on Vercel) calls the API to display charts. Cache refreshes daily at 9am ART + manual refresh button.

**Tech Stack:** Fastify, pg, node-cron (API proxy) · Next.js 13, Recharts, shadcn/ui, Tailwind (frontend)

---

## Phase 1: API Proxy Service

### Task 1: Create analytics-api project scaffold

**Files:**
- Create: `analytics-api/package.json`
- Create: `analytics-api/tsconfig.json`
- Create: `analytics-api/.gitignore`

**Step 1: Create package.json**

```json
{
  "name": "aramal-analytics-api",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "fastify": "^5.3.3",
    "@fastify/cors": "^11.0.1",
    "pg": "^8.13.1",
    "node-cron": "^3.0.3"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/pg": "^8.11.0",
    "typescript": "^5.3.3",
    "tsx": "^4.7.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
.env
```

**Step 4: Install dependencies**

Run: `cd analytics-api && npm install`

**Step 5: Commit**

```bash
git add analytics-api/
git commit -m "feat: scaffold analytics-api project"
```

---

### Task 2: Database connection and cache module

**Files:**
- Create: `analytics-api/src/db.ts`
- Create: `analytics-api/src/cache.ts`

**Step 1: Create db.ts — read-only PostgreSQL pool**

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
});

export async function query<T extends Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

export default pool;
```

**Step 2: Create cache.ts — in-memory cache with daily refresh**

```typescript
import cron from 'node-cron';

const store = new Map<string, { data: unknown; ts: number }>();

export function get<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  return entry.data as T;
}

export function set(key: string, data: unknown): void {
  store.set(key, { data, ts: Date.now() });
}

export function clear(): void {
  store.clear();
}

export function cacheKey(path: string, params: Record<string, string>): string {
  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  return `${path}?${sorted.map(([k, v]) => `${k}=${v}`).join('&')}`;
}

// Refresh daily at 12:00 UTC (9:00 AM ART)
cron.schedule('0 12 * * *', () => {
  console.log('[cache] Daily refresh at 9:00 AM ART');
  clear();
});
```

**Step 3: Commit**

```bash
git add analytics-api/src/
git commit -m "feat: add db pool and cache module with daily refresh"
```

---

### Task 3: Fastify server with API key auth

**Files:**
- Create: `analytics-api/src/index.ts`

**Step 1: Create index.ts**

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { overviewRoutes } from './routes/overview';
import { growthRoutes } from './routes/growth';
import { transactionsRoutes } from './routes/transactions';
import { activityRoutes } from './routes/activity';
import { refreshRoutes } from './routes/refresh';

const app = Fastify({ logger: true });

// CORS for Vercel
app.register(cors, {
  origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST'],
});

// API key auth
app.addHook('onRequest', async (request, reply) => {
  if (request.url === '/health') return;
  const apiKey = request.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});

// Health check
app.get('/health', async () => ({ status: 'ok' }));

// Routes
app.register(overviewRoutes, { prefix: '/overview' });
app.register(growthRoutes, { prefix: '/growth' });
app.register(transactionsRoutes, { prefix: '/transactions' });
app.register(activityRoutes, { prefix: '/activity' });
app.register(refreshRoutes, { prefix: '/refresh' });

const start = async () => {
  const port = parseInt(process.env.PORT || '4000');
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Analytics API listening on port ${port}`);
};

start();
```

**Step 2: Commit**

```bash
git add analytics-api/src/index.ts
git commit -m "feat: add Fastify server with API key auth and CORS"
```

---

### Task 4: Overview endpoint

**Files:**
- Create: `analytics-api/src/routes/overview.ts`

**Step 1: Create overview.ts**

This endpoint returns KPI summary cards: total accounts, restaurants, orders, revenue, and change vs previous period.

```typescript
import { FastifyInstance } from 'fastify';
import { query } from '../db';
import * as cache from '../cache';

export async function overviewRoutes(app: FastifyInstance) {
  app.get('/', async (request) => {
    const key = cache.cacheKey('/overview', {});
    const cached = cache.get(key);
    if (cached) return cached;

    const [accounts] = await query<{ total: string; business: string; customer: string }>(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE account_type = 'business') AS business,
        COUNT(*) FILTER (WHERE account_type = 'customer') AS customer
      FROM users WHERE deleted_at IS NULL`
    );

    const [restaurants] = await query<{ total: string; with_menu: string }>(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE id IN (SELECT DISTINCT activity_id FROM menu_items)) AS with_menu
      FROM activities`
    );

    const [orders] = await query<{ total: string; revenue: string; avg_ticket: string }>(
      `SELECT
        COUNT(*) AS total,
        COALESCE(SUM(total), 0) AS revenue,
        COALESCE(AVG(total), 0) AS avg_ticket
      FROM orders WHERE status != 'cancelled'`
    );

    const [orders30d] = await query<{ total: string; revenue: string }>(
      `SELECT COUNT(*) AS total, COALESCE(SUM(total), 0) AS revenue
      FROM orders WHERE status != 'cancelled' AND created_at >= NOW() - INTERVAL '30 days'`
    );

    const [ordersPrev30d] = await query<{ total: string; revenue: string }>(
      `SELECT COUNT(*) AS total, COALESCE(SUM(total), 0) AS revenue
      FROM orders WHERE status != 'cancelled'
        AND created_at >= NOW() - INTERVAL '60 days'
        AND created_at < NOW() - INTERVAL '30 days'`
    );

    const data = {
      accounts: { total: +accounts.total, business: +accounts.business, customer: +accounts.customer },
      restaurants: { total: +restaurants.total, withMenu: +restaurants.with_menu },
      orders: {
        total: +orders.total,
        revenue: +orders.revenue,
        avgTicket: +orders.avg_ticket,
        last30d: { total: +orders30d.total, revenue: +orders30d.revenue },
        prev30d: { total: +ordersPrev30d.total, revenue: +ordersPrev30d.revenue },
      },
    };

    cache.set(key, data);
    return data;
  });
}
```

**Step 2: Commit**

```bash
git add analytics-api/src/routes/overview.ts
git commit -m "feat: add overview endpoint with KPI summary"
```

---

### Task 5: Growth endpoints

**Files:**
- Create: `analytics-api/src/routes/growth.ts`

**Step 1: Create growth.ts**

Two endpoints: `/growth/accounts` and `/growth/restaurants`. Both accept `?period=day|week|month&from=DATE&to=DATE`.

```typescript
import { FastifyInstance } from 'fastify';
import { query } from '../db';
import * as cache from '../cache';

interface QueryParams {
  period?: string;
  from?: string;
  to?: string;
}

function dateTrunc(period: string): string {
  if (['day', 'week', 'month', 'year'].includes(period)) return period;
  return 'month';
}

export async function growthRoutes(app: FastifyInstance) {
  app.get('/accounts', async (request) => {
    const { period = 'month', from, to } = request.query as QueryParams;
    const key = cache.cacheKey('/growth/accounts', { period, from: from || '', to: to || '' });
    const cached = cache.get(key);
    if (cached) return cached;

    const conditions: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];
    if (from) { params.push(from); conditions.push(`created_at >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`created_at <= $${params.length}`); }

    const rows = await query<{ period: string; total: string; business: string; customer: string; verified: string }>(
      `SELECT
        DATE_TRUNC('${dateTrunc(period)}', created_at) AS period,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE account_type = 'business') AS business,
        COUNT(*) FILTER (WHERE account_type = 'customer') AS customer,
        COUNT(*) FILTER (WHERE email_verified = true) AS verified
      FROM users
      WHERE ${conditions.join(' AND ')}
      GROUP BY 1 ORDER BY 1`,
      params
    );

    const data = rows.map(r => ({
      period: r.period,
      total: +r.total,
      business: +r.business,
      customer: +r.customer,
      verified: +r.verified,
    }));

    cache.set(key, data);
    return data;
  });

  app.get('/restaurants', async (request) => {
    const { period = 'month', from, to } = request.query as QueryParams;
    const key = cache.cacheKey('/growth/restaurants', { period, from: from || '', to: to || '' });
    const cached = cache.get(key);
    if (cached) return cached;

    const conditions: string[] = [];
    const params: unknown[] = [];
    if (from) { params.push(from); conditions.push(`created_at >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`created_at <= $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await query<{ period: string; total: string }>(
      `SELECT DATE_TRUNC('${dateTrunc(period)}', created_at) AS period, COUNT(*) AS total
      FROM activities ${where}
      GROUP BY 1 ORDER BY 1`,
      params
    );

    const [completeness] = await query<{ total: string; has_menu: string; has_hours: string; has_tables: string; has_staff: string }>(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE id IN (SELECT DISTINCT activity_id FROM menu_items)) AS has_menu,
        COUNT(*) FILTER (WHERE id IN (SELECT DISTINCT restaurant_id FROM business_hours)) AS has_hours,
        COUNT(*) FILTER (WHERE id IN (SELECT DISTINCT restaurant_id FROM tables)) AS has_tables,
        COUNT(*) FILTER (WHERE id IN (SELECT DISTINCT restaurant_id FROM staff)) AS has_staff
      FROM activities`
    );

    const data = {
      timeline: rows.map(r => ({ period: r.period, total: +r.total })),
      completeness: {
        total: +completeness.total,
        hasMenu: +completeness.has_menu,
        hasHours: +completeness.has_hours,
        hasTables: +completeness.has_tables,
        hasStaff: +completeness.has_staff,
      },
    };

    cache.set(key, data);
    return data;
  });
}
```

**Step 2: Commit**

```bash
git add analytics-api/src/routes/growth.ts
git commit -m "feat: add growth endpoints for accounts and restaurants"
```

---

### Task 6: Transactions endpoints

**Files:**
- Create: `analytics-api/src/routes/transactions.ts`

**Step 1: Create transactions.ts**

Three endpoints: `/transactions/orders`, `/transactions/revenue`, `/transactions/payments`.

```typescript
import { FastifyInstance } from 'fastify';
import { query } from '../db';
import * as cache from '../cache';

interface QueryParams {
  period?: string;
  from?: string;
  to?: string;
  restaurant_id?: string;
}

function dateTrunc(period: string): string {
  if (['day', 'week', 'month', 'year'].includes(period)) return period;
  return 'month';
}

function buildFilters(q: QueryParams, dateCol = 'created_at'): { conditions: string[]; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (q.from) { params.push(q.from); conditions.push(`${dateCol} >= $${params.length}`); }
  if (q.to) { params.push(q.to); conditions.push(`${dateCol} <= $${params.length}`); }
  if (q.restaurant_id) { params.push(q.restaurant_id); conditions.push(`restaurant_id = $${params.length}`); }
  return { conditions, params };
}

export async function transactionsRoutes(app: FastifyInstance) {
  app.get('/orders', async (request) => {
    const q = request.query as QueryParams;
    const period = q.period || 'month';
    const key = cache.cacheKey('/transactions/orders', { ...q, period });
    const cached = cache.get(key);
    if (cached) return cached;

    const { conditions, params } = buildFilters(q);
    conditions.push("status != 'cancelled'");
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const timeline = await query<{ period: string; count: string; revenue: string; avg_ticket: string }>(
      `SELECT DATE_TRUNC('${dateTrunc(period)}', created_at) AS period,
        COUNT(*) AS count, SUM(total) AS revenue, AVG(total) AS avg_ticket
      FROM orders ${where}
      GROUP BY 1 ORDER BY 1`,
      params
    );

    const topItems = await query<{ name: string; quantity: string; revenue: string }>(
      `SELECT mi.name, SUM(oi.quantity) AS quantity, SUM(oi.subtotal) AS revenue
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      JOIN orders o ON oi.order_id = o.id
      ${where.replace('created_at', 'o.created_at').replace('restaurant_id', 'o.restaurant_id')}
      GROUP BY mi.name ORDER BY quantity DESC LIMIT 10`,
      params
    );

    const data = {
      timeline: timeline.map(r => ({ period: r.period, count: +r.count, revenue: +r.revenue, avgTicket: +r.avg_ticket })),
      topItems: topItems.map(r => ({ name: r.name, quantity: +r.quantity, revenue: +r.revenue })),
    };

    cache.set(key, data);
    return data;
  });

  app.get('/revenue', async (request) => {
    const q = request.query as QueryParams;
    const period = q.period || 'month';
    const key = cache.cacheKey('/transactions/revenue', { ...q, period });
    const cached = cache.get(key);
    if (cached) return cached;

    const { conditions, params } = buildFilters(q);
    conditions.push("status != 'cancelled'");
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const byRestaurant = await query<{ restaurant_id: string; name: string; revenue: string; order_count: string }>(
      `SELECT o.restaurant_id, a.name, SUM(o.total) AS revenue, COUNT(*) AS order_count
      FROM orders o JOIN activities a ON o.restaurant_id = a.id
      ${where} GROUP BY o.restaurant_id, a.name ORDER BY revenue DESC`,
      params
    );

    const byPaymentMethod = await query<{ method: string; count: string; total: string }>(
      `SELECT payment_method AS method, COUNT(*) AS count, SUM(total) AS total
      FROM orders ${where} AND payment_method IS NOT NULL
      GROUP BY payment_method ORDER BY total DESC`,
      params
    );

    const data = {
      byRestaurant: byRestaurant.map(r => ({ id: r.restaurant_id, name: r.name, revenue: +r.revenue, orders: +r.order_count })),
      byPaymentMethod: byPaymentMethod.map(r => ({ method: r.method, count: +r.count, total: +r.total })),
    };

    cache.set(key, data);
    return data;
  });

  app.get('/payments', async (request) => {
    const q = request.query as QueryParams;
    const key = cache.cacheKey('/transactions/payments', q as Record<string, string>);
    const cached = cache.get(key);
    if (cached) return cached;

    const { conditions, params } = buildFilters(q);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const byStatus = await query<{ status: string; count: string; total: string }>(
      `SELECT status, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
      FROM payments ${where} GROUP BY status`,
      params
    );

    const data = {
      byStatus: byStatus.map(r => ({ status: r.status, count: +r.count, total: +r.total })),
    };

    cache.set(key, data);
    return data;
  });
}
```

**Step 2: Commit**

```bash
git add analytics-api/src/routes/transactions.ts
git commit -m "feat: add transactions endpoints for orders, revenue, payments"
```

---

### Task 7: Activity endpoints

**Files:**
- Create: `analytics-api/src/routes/activity.ts`

**Step 1: Create activity.ts**

Three endpoints: `/activity/engagement`, `/activity/loyalty`, `/activity/staff`.

```typescript
import { FastifyInstance } from 'fastify';
import { query } from '../db';
import * as cache from '../cache';

interface QueryParams {
  period?: string;
  from?: string;
  to?: string;
  restaurant_id?: string;
}

function dateTrunc(period: string): string {
  if (['day', 'week', 'month', 'year'].includes(period)) return period;
  return 'month';
}

function buildFilters(q: QueryParams, dateCol = 'created_at'): { conditions: string[]; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (q.from) { params.push(q.from); conditions.push(`${dateCol} >= $${params.length}`); }
  if (q.to) { params.push(q.to); conditions.push(`${dateCol} <= $${params.length}`); }
  if (q.restaurant_id) { params.push(q.restaurant_id); conditions.push(`restaurant_id = $${params.length}`); }
  return { conditions, params };
}

export async function activityRoutes(app: FastifyInstance) {
  app.get('/engagement', async (request) => {
    const q = request.query as QueryParams;
    const period = q.period || 'month';
    const key = cache.cacheKey('/activity/engagement', { ...q, period });
    const cached = cache.get(key);
    if (cached) return cached;

    const { conditions, params } = buildFilters(q);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const waiterCalls = await query<{ period: string; count: string }>(
      `SELECT DATE_TRUNC('${dateTrunc(period)}', created_at) AS period, COUNT(*) AS count
      FROM waiter_calls ${where} GROUP BY 1 ORDER BY 1`, params
    );

    const reservations = await query<{ period: string; count: string }>(
      `SELECT DATE_TRUNC('${dateTrunc(period)}', created_at) AS period, COUNT(*) AS count
      FROM reservations ${where} GROUP BY 1 ORDER BY 1`, params
    );

    const feedback = await query<{ period: string; count: string; avg_rating: string }>(
      `SELECT DATE_TRUNC('${dateTrunc(period)}', created_at) AS period, COUNT(*) AS count, AVG(rating) AS avg_rating
      FROM customer_feedback ${where} GROUP BY 1 ORDER BY 1`, params
    );

    const sessions = await query<{ period: string; count: string; avg_duration: string }>(
      `SELECT DATE_TRUNC('${dateTrunc(period)}', opened_at) AS period, COUNT(*) AS count,
        AVG(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 60) AS avg_duration
      FROM table_sessions ${where.replace('created_at', 'opened_at')} AND closed_at IS NOT NULL
      GROUP BY 1 ORDER BY 1`, params
    );

    const data = {
      waiterCalls: waiterCalls.map(r => ({ period: r.period, count: +r.count })),
      reservations: reservations.map(r => ({ period: r.period, count: +r.count })),
      feedback: feedback.map(r => ({ period: r.period, count: +r.count, avgRating: +(+r.avg_rating).toFixed(1) })),
      tableSessions: sessions.map(r => ({ period: r.period, count: +r.count, avgDurationMin: +(+r.avg_duration).toFixed(0) })),
    };

    cache.set(key, data);
    return data;
  });

  app.get('/loyalty', async (request) => {
    const q = request.query as QueryParams;
    const key = cache.cacheKey('/activity/loyalty', q as Record<string, string>);
    const cached = cache.get(key);
    if (cached) return cached;

    const [programs] = await query<{ total: string; active: string }>(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active FROM loyalty_programs`
    );

    const [points] = await query<{ earned: string; redeemed: string }>(
      `SELECT
        COALESCE(SUM(points) FILTER (WHERE type = 'earn'), 0) AS earned,
        COALESCE(SUM(ABS(points)) FILTER (WHERE type = 'redeem'), 0) AS redeemed
      FROM loyalty_transactions`
    );

    const [balances] = await query<{ total_customers: string; total_points: string }>(
      `SELECT COUNT(*) AS total_customers, COALESCE(SUM(points), 0) AS total_points FROM loyalty_balances`
    );

    const data = {
      programs: { total: +programs.total, active: +programs.active },
      points: { earned: +points.earned, redeemed: +points.redeemed },
      balances: { customers: +balances.total_customers, totalPoints: +balances.total_points },
    };

    cache.set(key, data);
    return data;
  });

  app.get('/staff', async (request) => {
    const q = request.query as QueryParams;
    const key = cache.cacheKey('/activity/staff', q as Record<string, string>);
    const cached = cache.get(key);
    if (cached) return cached;

    const byRestaurant = await query<{ restaurant_id: string; name: string; staff_count: string; active: string }>(
      `SELECT s.restaurant_id, a.name, COUNT(*) AS staff_count, COUNT(*) FILTER (WHERE s.is_active) AS active
      FROM staff s JOIN activities a ON s.restaurant_id = a.id
      GROUP BY s.restaurant_id, a.name ORDER BY staff_count DESC`
    );

    const byRole = await query<{ role: string; count: string }>(
      `SELECT role, COUNT(*) AS count FROM staff WHERE is_active GROUP BY role ORDER BY count DESC`
    );

    const data = {
      byRestaurant: byRestaurant.map(r => ({ id: r.restaurant_id, name: r.name, total: +r.staff_count, active: +r.active })),
      byRole: byRole.map(r => ({ role: r.role, count: +r.count })),
    };

    cache.set(key, data);
    return data;
  });
}
```

**Step 2: Commit**

```bash
git add analytics-api/src/routes/activity.ts
git commit -m "feat: add activity endpoints for engagement, loyalty, staff"
```

---

### Task 8: Refresh endpoint

**Files:**
- Create: `analytics-api/src/routes/refresh.ts`

**Step 1: Create refresh.ts**

```typescript
import { FastifyInstance } from 'fastify';
import * as cache from '../cache';

export async function refreshRoutes(app: FastifyInstance) {
  app.post('/', async () => {
    cache.clear();
    return { status: 'ok', message: 'Cache cleared' };
  });
}
```

**Step 2: Commit**

```bash
git add analytics-api/src/routes/refresh.ts
git commit -m "feat: add manual cache refresh endpoint"
```

---

### Task 9: Dockerfile for analytics-api

**Files:**
- Create: `analytics-api/Dockerfile`

**Step 1: Create Dockerfile**

```dockerfile
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

**Step 2: Build and test locally**

Run: `cd analytics-api && docker build -t analytics-api:test .`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add analytics-api/Dockerfile
git commit -m "feat: add Dockerfile for analytics-api"
```

---

## Phase 2: Infrastructure (K3s + Cloudflare)

### Task 10: Create read-only PostgreSQL user

**Step 1: Create the user**

Run:
```bash
export KUBECONFIG=~/.kube/config
kubectl exec -n aramal postgres-0 -- psql -U postgres -d restaurant_db -c "
CREATE USER analytics_reader WITH PASSWORD '<generate-secure-password>';
GRANT CONNECT ON DATABASE restaurant_db TO analytics_reader;
GRANT USAGE ON SCHEMA public TO analytics_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO analytics_reader;
"
```

Expected: CREATE ROLE, GRANT x4

**Step 2: Test the user**

Run:
```bash
kubectl exec -n aramal postgres-0 -- psql -U analytics_reader -d restaurant_db -c "SELECT COUNT(*) FROM users;"
```

Expected: Returns count (3)

Run:
```bash
kubectl exec -n aramal postgres-0 -- psql -U analytics_reader -d restaurant_db -c "DELETE FROM users WHERE id = '00000000-0000-0000-0000-000000000000';"
```

Expected: ERROR: permission denied

---

### Task 11: K8s manifests for analytics-api

**Files:**
- Create: `k8s/base/analytics-api/deployment.yaml`
- Create: `k8s/base/analytics-api/service.yaml`

**Step 1: Create deployment.yaml**

Note: This goes in the app-001 repo at `/home/ubuntu/app-001/k8s/base/analytics-api/`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analytics-api
  namespace: aramal
spec:
  replicas: 1
  selector:
    matchLabels:
      app: analytics-api
  template:
    metadata:
      labels:
        app: analytics-api
    spec:
      containers:
        - name: analytics-api
          image: ghcr.io/alvafg/analytics-api:latest
          ports:
            - containerPort: 4000
          env:
            - name: PORT
              value: "4000"
            - name: DATABASE_URL
              value: "postgresql://analytics_reader:PASSWORD@postgres:5432/restaurant_db"
            - name: API_KEY
              valueFrom:
                secretKeyRef:
                  name: analytics-api-secrets
                  key: api-key
            - name: ALLOWED_ORIGIN
              value: "https://kanba-app.vercel.app"
          resources:
            requests:
              cpu: 25m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 128Mi
          livenessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 5
            periodSeconds: 10
```

**Step 2: Create service.yaml**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: analytics-api
  namespace: aramal
spec:
  selector:
    app: analytics-api
  ports:
    - port: 4000
      targetPort: 4000
```

**Step 3: Commit to app-001 repo**

```bash
cd /home/ubuntu/app-001
git add k8s/base/analytics-api/
git commit -m "feat: add K8s manifests for analytics-api"
```

---

### Task 12: Add Cloudflare Tunnel route for analytics-api

**Step 1: Add route in Cloudflare dashboard**

Go to Cloudflare Zero Trust → Tunnels → `aramal-k3s` → Public Hostname → Add:
- Subdomain: `analytics-api`
- Domain: `aramal.co`
- Service: `http://analytics-api.aramal.svc.cluster.local:4000`

**Step 2: Add ingress rule (alternative if using config file)**

Add to Traefik ingress in `k8s/base/ingress.yaml`:

```yaml
- host: analytics-api.aramal.co
  http:
    paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: analytics-api
            port:
              number: 4000
```

**Step 3: Verify**

Run: `curl -H "x-api-key: YOUR_KEY" https://analytics-api.aramal.co/health`
Expected: `{"status":"ok"}`

---

### Task 13: Create Sealed Secret for API key

**Step 1: Generate API key**

Run: `openssl rand -base64 32`

**Step 2: Create and seal the secret**

```bash
export KUBECONFIG=~/.kube/config
echo -n "GENERATED_KEY" | kubectl create secret generic analytics-api-secrets \
  --namespace=aramal \
  --from-literal=api-key=GENERATED_KEY \
  --dry-run=client -o yaml | kubeseal --format yaml > k8s/base/analytics-api/sealed-secret.yaml
```

**Step 3: Apply**

Run: `kubectl apply -f k8s/base/analytics-api/sealed-secret.yaml`

**Step 4: Commit**

```bash
cd /home/ubuntu/app-001
git add k8s/base/analytics-api/sealed-secret.yaml
git commit -m "feat: add sealed secret for analytics-api key"
```

---

## Phase 3: GitHub Actions CI/CD

### Task 14: CI workflow for analytics-api

**Files:**
- Create: `analytics-api/.github/workflows/ci.yml` (or in app-001 if monorepo)

**Step 1: Create workflow**

```yaml
name: CI Analytics API
on:
  push:
    paths:
      - 'analytics-api/**'
    branches: [main]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: analytics-api
          push: true
          tags: ghcr.io/alvafg/analytics-api:latest
```

**Step 2: Commit**

```bash
git add .github/workflows/
git commit -m "ci: add build workflow for analytics-api"
```

---

## Phase 4: Frontend (kanba)

### Task 15: Analytics API client hook

**Files:**
- Create: `hooks/use-analytics.ts`

**Step 1: Create the hook**

```typescript
import { useState, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_ANALYTICS_API_URL || '';
const API_KEY = process.env.NEXT_PUBLIC_ANALYTICS_API_KEY || '';

export function useAnalytics() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async <T>(endpoint: string, params?: Record<string, string>): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(endpoint, API_URL);
      if (params) {
        Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });
      }
      const res = await fetch(url.toString(), {
        headers: { 'x-api-key': API_KEY },
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return await res.json() as T;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    await fetch(`${API_URL}/refresh`, {
      method: 'POST',
      headers: { 'x-api-key': API_KEY },
    });
  }, []);

  return { fetchData, refresh, loading, error };
}
```

**Step 2: Add env vars to .env.example**

Append to `.env.example`:
```
# Aramal Analytics API
NEXT_PUBLIC_ANALYTICS_API_URL=https://analytics-api.aramal.co
NEXT_PUBLIC_ANALYTICS_API_KEY=your_analytics_api_key
```

**Step 3: Commit**

```bash
git add hooks/use-analytics.ts .env.example
git commit -m "feat: add useAnalytics hook and env vars"
```

---

### Task 16: Enable Analytics in sidebar

**Files:**
- Modify: `components/app-sidebar.tsx:96`

**Step 1: Remove disabled flag from Analytics menu item**

Change line 96 from:
```typescript
{ title: "Analytics (soon)", url: "/dashboard/analytics", icon: BarChartIcon, disabled: true },
```
to:
```typescript
{ title: "Analytics", url: "/dashboard/analytics", icon: BarChartIcon },
```

**Step 2: Commit**

```bash
git add components/app-sidebar.tsx
git commit -m "feat: enable Analytics link in sidebar"
```

---

### Task 17: Analytics overview page

**Files:**
- Create: `app/dashboard/analytics/page.tsx`

**Step 1: Create the overview page**

This page shows KPI cards at the top (total accounts, restaurants, orders, revenue) with change vs previous 30 days, plus a quick summary.

Uses: `useAnalytics` hook, `Card` from shadcn/ui, Recharts `AreaChart`.

Key elements:
- 4 KPI cards in a grid
- "Refresh" button top-right that calls `POST /refresh` then re-fetches
- Last refresh timestamp display
- Area chart showing orders/revenue over the last 6 months

**Step 2: Commit**

```bash
git add app/dashboard/analytics/
git commit -m "feat: add analytics overview page with KPI cards"
```

---

### Task 18: Growth analytics page

**Files:**
- Create: `app/dashboard/analytics/growth/page.tsx`

**Step 1: Create the growth page**

Two sections:
1. **Account Growth** — Line chart (Recharts `LineChart`) showing accounts created over time, with separate lines for business vs customer. Period selector (day/week/month).
2. **Restaurant Completeness** — Horizontal bar chart showing how many restaurants have menu, hours, tables, staff configured.

**Step 2: Commit**

```bash
git add app/dashboard/analytics/growth/
git commit -m "feat: add growth analytics page"
```

---

### Task 19: Transactions analytics page

**Files:**
- Create: `app/dashboard/analytics/transactions/page.tsx`

**Step 1: Create the transactions page**

Three sections:
1. **Orders Timeline** — Area chart showing order count and revenue over time. Period selector + date range picker.
2. **Top Items** — Bar chart of top 10 most ordered items.
3. **Revenue by Restaurant** — Table with restaurant name, revenue, order count. Plus pie chart of payment methods.

**Step 2: Commit**

```bash
git add app/dashboard/analytics/transactions/
git commit -m "feat: add transactions analytics page"
```

---

### Task 20: Activity analytics page

**Files:**
- Create: `app/dashboard/analytics/activity/page.tsx`

**Step 1: Create the activity page**

Three sections:
1. **Engagement** — Multi-line chart showing waiter calls, reservations, feedback, table sessions over time.
2. **Loyalty** — Cards showing programs active, points earned/redeemed, customer balances.
3. **Staff** — Table showing staff per restaurant with role breakdown.

**Step 2: Commit**

```bash
git add app/dashboard/analytics/activity/
git commit -m "feat: add activity analytics page"
```

---

### Task 21: Analytics sub-navigation

**Files:**
- Create: `app/dashboard/analytics/layout.tsx`

**Step 1: Create analytics layout with tab navigation**

A layout component that wraps all analytics pages with tab navigation: Overview | Growth | Transactions | Activity.

Uses shadcn/ui `Tabs` component. Highlights the active tab based on current pathname.

**Step 2: Commit**

```bash
git add app/dashboard/analytics/layout.tsx
git commit -m "feat: add analytics layout with tab navigation"
```

---

## Phase 5: Deploy and verify

### Task 22: Build and push analytics-api image

**Step 1: Build the image**

```bash
cd /home/ubuntu/kanba/analytics-api
docker build --platform linux/arm64 -t ghcr.io/alvafg/analytics-api:latest .
docker push ghcr.io/alvafg/analytics-api:latest
```

**Step 2: Verify Argo CD picks it up**

Run: `kubectl get pods -n aramal | grep analytics`
Expected: `analytics-api-xxx Running`

**Step 3: Test the API**

Run: `curl -H "x-api-key: KEY" https://analytics-api.aramal.co/health`
Expected: `{"status":"ok"}`

Run: `curl -H "x-api-key: KEY" https://analytics-api.aramal.co/overview`
Expected: JSON with accounts, restaurants, orders data

---

### Task 23: Deploy kanba to Vercel

**Step 1: Add env vars in Vercel dashboard**

- `NEXT_PUBLIC_ANALYTICS_API_URL` = `https://analytics-api.aramal.co`
- `NEXT_PUBLIC_ANALYTICS_API_KEY` = (the generated API key)

**Step 2: Push to trigger deploy**

```bash
cd /home/ubuntu/kanba
git push origin main
```

**Step 3: Verify**

Open kanba in browser → Dashboard → Analytics → should show KPI cards with real data.

---

### Task 24: End-to-end verification

**Step 1: Verify all analytics pages load**

- `/dashboard/analytics/` — KPI cards show real numbers
- `/dashboard/analytics/growth` — Charts render with data
- `/dashboard/analytics/transactions` — Orders and revenue display
- `/dashboard/analytics/activity` — Engagement metrics show

**Step 2: Test refresh button**

Click "Refresh" → data should re-fetch

**Step 3: Verify security**

Run without API key: `curl https://analytics-api.aramal.co/overview`
Expected: `{"error":"Unauthorized"}`

Run with wrong key: `curl -H "x-api-key: wrong" https://analytics-api.aramal.co/overview`
Expected: `{"error":"Unauthorized"}`
