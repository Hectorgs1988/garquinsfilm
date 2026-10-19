import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import type { DatabaseHealth } from '../db/database.js';

let app: ReturnType<typeof buildApp>;
let database: DatabaseHealth;

beforeEach(() => {
  database = {
    check: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
  app = buildApp({ database });
});

afterEach(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('devuelve el estado de salud como JSON', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(database.check).not.toHaveBeenCalled();
  });
});

describe('GET /ready', () => {
  it('devuelve listo cuando la base de datos responde', async () => {
    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(database.check).toHaveBeenCalledOnce();
  });

  it('devuelve 503 sin exponer detalles cuando falla la base de datos', async () => {
    vi.mocked(database.check).mockRejectedValueOnce(
      new Error('database password must not appear in the response'),
    );

    const response = await app.inject({ method: 'GET', url: '/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    expect(response.body).not.toContain('password');
  });

  it('desconecta la base de datos al cerrar Fastify', async () => {
    await app.close();

    expect(database.disconnect).toHaveBeenCalledOnce();
  });
});
