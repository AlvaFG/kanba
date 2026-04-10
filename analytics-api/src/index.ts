import Fastify from 'fastify';
import cors from '@fastify/cors';
import pool from './db';
import { overviewRoutes } from './routes/overview';
import { growthRoutes } from './routes/growth';
import { transactionsRoutes } from './routes/transactions';
import { activityRoutes } from './routes/activity';
import { refreshRoutes } from './routes/refresh';
import { usersRoutes } from './routes/users';
import { restaurantsRoutes } from './routes/restaurants';
import { exportRoutes } from './routes/export';

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
    return reply.code(401).send({ error: 'Unauthorized' });
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
app.register(usersRoutes, { prefix: '/users' });
app.register(restaurantsRoutes, { prefix: '/restaurants' });
app.register(exportRoutes, { prefix: '/export' });

const start = async () => {
  const port = parseInt(process.env.PORT || '4000');
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Analytics API listening on port ${port}`);

  const shutdown = async () => {
    console.log('Shutting down...');
    await app.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

start();
