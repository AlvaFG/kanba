import { FastifyInstance } from 'fastify';
import { query } from '../db';
import * as cache from '../cache';

interface QueryParams {
  search?: string;
  page?: string;
  limit?: string;
}

export async function restaurantsRoutes(app: FastifyInstance) {
  // List
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

  // Detail
  app.get('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const key = cache.cacheKey(`/restaurants/${id}`, {});
    const cached = cache.get(key);
    if (cached) return cached;

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

    const topItems = await query<{ name: string; quantity: string; revenue: string }>(
      `SELECT mi.name, SUM(oi.quantity) AS quantity, SUM(oi.subtotal) AS revenue
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.restaurant_id = $1 AND o.status != 'cancelled'
      GROUP BY mi.name ORDER BY quantity DESC LIMIT 5`, [id]
    );

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
}
