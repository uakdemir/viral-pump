import { Router } from 'express';
import { createContentItemsRouter } from './content-items.js';
import { createPostsRouter } from './posts.js';
import { createVerticalsRouter } from './verticals.js';
import type { DB } from '../../shared/db.js';
import type { JobQueue } from '../../plugins/job-queue/types.js';

export function createApiRouter(db: DB, jobQueue: JobQueue): Router {
  const router = Router();
  router.use('/content-items', createContentItemsRouter(db, jobQueue));
  router.use('/posts', createPostsRouter(db, jobQueue));
  router.use('/verticals', createVerticalsRouter(db));
  return router;
}
