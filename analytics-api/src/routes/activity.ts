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
    const key = cache.cacheKey('/activity/engagement', { ...q, period } as Record<string, string>);
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

    const sessionsWhere = where ? where.replace('created_at', 'opened_at') : '';
    const sessionsConditions = sessionsWhere ? `${sessionsWhere} AND closed_at IS NOT NULL` : 'WHERE closed_at IS NOT NULL';

    const sessions = await query<{ period: string; count: string; avg_duration: string }>(
      `SELECT DATE_TRUNC('${dateTrunc(period)}', opened_at) AS period, COUNT(*) AS count,
        AVG(EXTRACT(EPOCH FROM (closed_at - opened_at)) / 60) AS avg_duration
      FROM table_sessions ${sessionsConditions}
      GROUP BY 1 ORDER BY 1`, params
    );

    const data = {
      waiterCalls: waiterCalls.map(r => ({ period: r.period, count: +r.count })),
      reservations: reservations.map(r => ({ period: r.period, count: +r.count })),
      feedback: feedback.map(r => ({ period: r.period, count: +r.count, avgRating: r.avg_rating ? +(+r.avg_rating).toFixed(1) : null })),
      tableSessions: sessions.map(r => ({ period: r.period, count: +r.count, avgDurationMin: r.avg_duration ? +(+r.avg_duration).toFixed(0) : null })),
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
