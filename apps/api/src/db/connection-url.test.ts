import { describe, expect, it } from 'vitest';
import { getDatabaseUrl } from './connection-url.js';

describe('getDatabaseUrl', () => {
  it('prefers DATABASE_URL when provided', () => {
    expect(
      getDatabaseUrl({
        DATABASE_URL: 'postgresql://user:password@db.example:5432/catalog?schema=public',
      }),
    ).toBe('postgresql://user:password@db.example:5432/catalog?schema=public');
  });

  it('builds a loopback URL and encodes local credentials', () => {
    expect(
      getDatabaseUrl({
        POSTGRES_DB: 'film db',
        POSTGRES_PASSWORD: 'p@ss:word',
        POSTGRES_USER: 'local user',
        POSTGRES_PORT: '5433',
      }),
    ).toBe('postgresql://local%20user:p%40ss%3Aword@127.0.0.1:5433/film%20db?schema=public');
  });

  it('requires complete credentials and a valid port', () => {
    expect(() => getDatabaseUrl({})).toThrow('Set DATABASE_URL or POSTGRES_DB');
    expect(() =>
      getDatabaseUrl({
        POSTGRES_DB: 'db',
        POSTGRES_PASSWORD: 'password',
        POSTGRES_USER: 'user',
        POSTGRES_PORT: '70000',
      }),
    ).toThrow('POSTGRES_PORT must be an integer');
  });
});
