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
