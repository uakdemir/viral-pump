import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { config } from '../shared/config.js';
import { createDb } from '../shared/db.js';
import { PostgresJobQueue } from '../plugins/job-queue/postgres-queue.js';
import { createChildLogger } from '../shared/logger.js';
import { registerContentItemsRoutes } from './api/content-items.js';
import { registerPostsRoutes } from './api/posts.js';
import { registerVerticalsRoutes } from './api/verticals.js';
import { registerMetricsRoutes } from './api/metrics.js';

const logger = createChildLogger({ process: 'web' });
const db = createDb(config.VIRAL_DATABASE_URL);
const jobQueue = new PostgresJobQueue(db);

const app = Fastify({ logger: false });

await app.register(cors);
await app.register(fastifyStatic, {
  root: path.resolve(config.ASSET_DIR),
  prefix: '/assets/',
});

// API routes
registerContentItemsRoutes(app, db, jobQueue);
registerPostsRoutes(app, db, jobQueue);
registerVerticalsRoutes(app, db);
registerMetricsRoutes(app, db);

// Health check
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

app.listen({ port: config.PORT, host: '0.0.0.0' }, err => {
  if (err) {
    logger.error({ err }, 'Failed to start');
    process.exit(1);
  }
  logger.info({ port: config.PORT }, 'Web server started');
});
