import pino from 'pino';

export const logger = pino({
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
