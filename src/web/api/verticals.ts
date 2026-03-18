import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { verticals } from '../../shared/schema/verticals.js';
import { accounts } from '../../shared/schema/accounts.js';
import { dataSources } from '../../shared/schema/data-sources.js';
import { triggerRules } from '../../shared/schema/trigger-rules.js';
import { contentTemplates } from '../../shared/schema/content-templates.js';
import type { DB } from '../../shared/db.js';

export function createVerticalsRouter(db: DB): Router {
  const router = Router();

  // GET /api/verticals — list with related data
  router.get('/', async (_req, res) => {
    try {
      const allVerticals = await db.select().from(verticals);
      const allAccounts = await db.select().from(accounts);
      const allSources = await db.select().from(dataSources);
      const allRules = await db.select().from(triggerRules);
      const allTemplates = await db.select().from(contentTemplates);

      const result = allVerticals.map(v => ({
        ...v,
        accounts: allAccounts.filter(a => a.verticalId === v.id),
        dataSources: allSources.filter(s => s.verticalId === v.id),
        triggerRules: allRules.filter(r => r.verticalId === v.id),
        contentTemplates: allTemplates.filter(t => t.verticalId === v.id),
      }));

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch verticals' });
    }
  });

  // PATCH /api/verticals/:id/toggle
  router.patch('/:id/toggle', async (req, res) => {
    try {
      const [v] = await db.select().from(verticals).where(eq(verticals.id, req.params.id));
      if (!v) { res.status(404).json({ error: 'Not found' }); return; }
      const newStatus = v.status === 'active' ? 'inactive' : 'active';
      await db.update(verticals).set({ status: newStatus }).where(eq(verticals.id, v.id));
      res.json({ status: newStatus });
    } catch (err) {
      res.status(500).json({ error: 'Failed to toggle' });
    }
  });

  // PATCH /api/trigger-rules/:id/toggle
  router.patch('/trigger-rules/:id/toggle', async (req, res) => {
    try {
      const [rule] = await db.select().from(triggerRules).where(eq(triggerRules.id, req.params.id));
      if (!rule) { res.status(404).json({ error: 'Not found' }); return; }
      await db.update(triggerRules).set({ enabled: !rule.enabled }).where(eq(triggerRules.id, rule.id));
      res.json({ enabled: !rule.enabled });
    } catch (err) {
      res.status(500).json({ error: 'Failed to toggle rule' });
    }
  });

  return router;
}
