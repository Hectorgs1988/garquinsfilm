import { describe, expect, it } from 'vitest';
import { getAuthConfig } from './config.js';

const validEnvironment = {
  BETTER_AUTH_SECRET: 'a-test-secret-that-is-at-least-32-characters',
  BETTER_AUTH_URL: 'http://127.0.0.1:3001',
  BETTER_AUTH_TRUSTED_ORIGINS: 'http://127.0.0.1:5173, http://localhost:5173',
};

describe('getAuthConfig', () => {
  it('loads explicit origins and keeps local cookies non-secure but HttpOnly by default', () => {
    expect(getAuthConfig(validEnvironment)).toEqual({
      baseURL: 'http://127.0.0.1:3001',
      secret: validEnvironment.BETTER_AUTH_SECRET,
      trustedOrigins: ['http://127.0.0.1:3001', 'http://127.0.0.1:5173', 'http://localhost:5173'],
      secureCookies: false,
    });
  });

  it('requires an explicit strong secret and URL', () => {
    expect(() => getAuthConfig({ ...validEnvironment, BETTER_AUTH_SECRET: 'short' })).toThrow(
      'BETTER_AUTH_SECRET',
    );
    expect(() => getAuthConfig({ ...validEnvironment, BETTER_AUTH_URL: undefined })).toThrow(
      'BETTER_AUTH_URL',
    );
  });

  it('rejects non-origin URLs and requires HTTPS in production', () => {
    expect(() =>
      getAuthConfig({
        ...validEnvironment,
        BETTER_AUTH_TRUSTED_ORIGINS: 'https://trusted.example/path',
      }),
    ).toThrow('BETTER_AUTH_TRUSTED_ORIGINS');
    expect(() => getAuthConfig({ ...validEnvironment, NODE_ENV: 'production' })).toThrow('HTTPS');
  });

  it('uses secure cookies with a production HTTPS origin', () => {
    expect(
      getAuthConfig({
        ...validEnvironment,
        BETTER_AUTH_URL: 'https://api.example.test',
        NODE_ENV: 'production',
      }).secureCookies,
    ).toBe(true);
  });
});
