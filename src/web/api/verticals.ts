import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { verticals } from '../../shared/schema/verticals.js';
import { accounts } from '../../shared/schema/accounts.js';
import { dataSources } from '../../shared/schema/data-sources.js';
import { triggerRules } from '../../shared/schema/trigger-rules.js';
import { contentTemplates } from '../../shared/schema/content-templates.js';
import type { DB } from '../../shared/db.js';

export function registerVerticalsRoutes(app: FastifyInstance, db: DB) {
  // GET /api/verticals — list with related data
  app.get('/api/verticals', async () => {
    const allVerticals = await db.select().from(verticals);
    const allAccounts = await db.select().from(accounts);
    const allSources = await db.select().from(dataSources);
    const allRules = await db.select().from(triggerRules);
    const allTemplates = await db.select().from(contentTemplates);

    return allVerticals.map(v => ({
      ...v,
      accounts: allAccounts.filter(a => a.verticalId === v.id),
      dataSources: allSources.filter(s => s.verticalId === v.id),
      triggerRules: allRules.filter(r => r.verticalId === v.id),
      contentTemplates: allTemplates.filter(t => t.verticalId === v.id),
    }));
  });

  // PATCH /api/verticals/:id/toggle
  app.patch('/api/verticals/:id/toggle', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [v] = await db.select().from(verticals).where(eq(verticals.id, id));
    if (!v) return reply.status(404).send({ error: 'Not found' });

    const newStatus = v.status === 'active' ? 'inactive' : 'active';
    await db.update(verticals).set({ status: newStatus }).where(eq(verticals.id, v.id));
    return { status: newStatus };
  });

  // PATCH /api/verticals/trigger-rules/:id/toggle
  app.patch('/api/verticals/trigger-rules/:id/toggle', async (request, reply) => {
    const { id } = request.params as { id: string };
    const [rule] = await db.select().from(triggerRules).where(eq(triggerRules.id, id));
    if (!rule) return reply.status(404).send({ error: 'Not found' });

    await db
      .update(triggerRules)
      .set({ enabled: !rule.enabled })
      .where(eq(triggerRules.id, rule.id));
    return { enabled: !rule.enabled };
  });
}
