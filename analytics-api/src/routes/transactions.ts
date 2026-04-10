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
    const key = cache.cacheKey('/transactions/orders', { ...q, period } as Record<string, string>);
    const cached = cache.get(key);
    if (cached) return cached;

    const { conditions, params } = buildFilters(q);
    conditions.push("status != 'cancelled'");
    const where = `WHERE ${conditions.join(' AND ')}`;

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
      WHERE o.status != 'cancelled'
      GROUP BY mi.name ORDER BY quantity DESC LIMIT 10`
    );

    const data = {
      timeline: timeline.map(r => ({ period: r.period, count: +r.count, revenue: +(+r.revenue).toFixed(2), avgTicket: +(+r.avg_ticket).toFixed(2) })),
      topItems: topItems.map(r => ({ name: r.name, quantity: +r.quantity, revenue: +(+r.revenue).toFixed(2) })),
    };

    cache.set(key, data);
    return data;
  });

  app.get('/revenue', async (request) => {
    const q = request.query as QueryParams;
    const key = cache.cacheKey('/transactions/revenue', q as Record<string, string>);
    const cached = cache.get(key);
    if (cached) return cached;

    const { conditions, params } = buildFilters(q);
    conditions.push("status != 'cancelled'");
    const where = `WHERE ${conditions.join(' AND ')}`;

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
      byRestaurant: byRestaurant.map(r => ({ id: r.restaurant_id, name: r.name, revenue: +(+r.revenue).toFixed(2), orders: +r.order_count })),
      byPaymentMethod: byPaymentMethod.map(r => ({ method: r.method, count: +r.count, total: +(+r.total).toFixed(2) })),
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
      byStatus: byStatus.map(r => ({ status: r.status, count: +r.count, total: +(+r.total).toFixed(2) })),
    };

    cache.set(key, data);
    return data;
  });
}
