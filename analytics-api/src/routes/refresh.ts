import { FastifyInstance } from 'fastify';
import * as cache from '../cache';

export async function refreshRoutes(app: FastifyInstance) {
  app.post('/', async () => {
    cache.clear();
    return { status: 'ok', message: 'Cache cleared' };
  });
}
