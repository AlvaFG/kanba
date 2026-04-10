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
