import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/shared/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.VIRAL_DATABASE_URL!,
  },
});
