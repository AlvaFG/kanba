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
