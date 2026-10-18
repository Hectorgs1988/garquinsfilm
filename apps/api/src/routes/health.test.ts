import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  app = buildApp();
});

afterEach(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('devuelve el estado de salud como JSON', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
