export function getDatabaseUrl(environment: NodeJS.ProcessEnv = process.env): string {
  if (environment.DATABASE_URL) {
    return environment.DATABASE_URL;
  }

  const { POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER } = environment;
  if (!POSTGRES_DB || !POSTGRES_PASSWORD || !POSTGRES_USER) {
    throw new Error(
      'Set DATABASE_URL or POSTGRES_DB, POSTGRES_USER, and POSTGRES_PASSWORD before accessing PostgreSQL.',
    );
  }

  const port = Number(environment.POSTGRES_PORT ?? 5433);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('POSTGRES_PORT must be an integer between 1 and 65535.');
  }

  return `postgresql://${encodeURIComponent(POSTGRES_USER)}:${encodeURIComponent(POSTGRES_PASSWORD)}@127.0.0.1:${port}/${encodeURIComponent(POSTGRES_DB)}?schema=public`;
}
