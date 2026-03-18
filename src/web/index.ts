import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../shared/config.js';
import { createDb } from '../shared/db.js';
import { createChildLogger } from '../shared/logger.js';
import { PostgresJobQueue } from '../plugins/job-queue/postgres-queue.js';
import { createApiRouter } from './api/router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logger = createChildLogger({ process: 'web' });
const db = createDb(config.DATABASE_URL);
const jobQueue = new PostgresJobQueue(db);

const app = express();

app.use(cors());
app.use(express.json());

// Serve generated assets (PNGs)
app.use('/assets', express.static(path.resolve(config.ASSET_DIR)));

// API routes
app.use('/api', createApiRouter(db, jobQueue));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, 'Web server started');
});
