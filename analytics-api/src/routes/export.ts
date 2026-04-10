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
