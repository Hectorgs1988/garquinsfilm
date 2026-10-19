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
      webAppURL: 'http://127.0.0.1:5173',
      secret: validEnvironment.BETTER_AUTH_SECRET,
      trustedOrigins: ['http://127.0.0.1:3001', 'http://127.0.0.1:5173', 'http://localhost:5173'],
      secureCookies: false,
      smtp: {
        host: undefined,
        port: 1025,
        secure: false,
        user: undefined,
        password: undefined,
        from: undefined,
      },
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
        BETTER_AUTH_TRUSTED_ORIGINS: 'https://web.example.test',
        WEB_APP_URL: 'https://web.example.test',
        SMTP_HOST: 'smtp.example.test',
        EMAIL_FROM: 'GarquinsFilm <no-reply@example.test>',
        NODE_ENV: 'production',
      }).secureCookies,
    ).toBe(true);
  });

  it('requires trusted application and valid SMTP settings', () => {
    expect(() =>
      getAuthConfig({
        ...validEnvironment,
        WEB_APP_URL: 'https://untrusted.example.test',
      }),
    ).toThrow('trusted origin');
    expect(() => getAuthConfig({ ...validEnvironment, SMTP_PORT: '70000' })).toThrow('SMTP_PORT');
    expect(() => getAuthConfig({ ...validEnvironment, SMTP_SECURE: 'yes' })).toThrow('SMTP_SECURE');
    expect(() => getAuthConfig({ ...validEnvironment, SMTP_USER: 'test-user' })).toThrow(
      'SMTP_USER and SMTP_PASSWORD',
    );
  });

  it('rejects Mailpit as a production mail server', () => {
    expect(() =>
      getAuthConfig({
        ...validEnvironment,
        BETTER_AUTH_URL: 'https://api.example.test',
        BETTER_AUTH_TRUSTED_ORIGINS: 'https://web.example.test',
        WEB_APP_URL: 'https://web.example.test',
        SMTP_HOST: 'mailpit',
        EMAIL_FROM: 'no-reply@example.test',
        NODE_ENV: 'production',
      }),
    ).toThrow('non-Mailpit');
  });

  it('requires HTTPS for the web application in production', () => {
    expect(() =>
      getAuthConfig({
        ...validEnvironment,
        BETTER_AUTH_URL: 'https://api.example.test',
        BETTER_AUTH_TRUSTED_ORIGINS: 'http://web.example.test',
        WEB_APP_URL: 'http://web.example.test',
        SMTP_HOST: 'smtp.example.test',
        EMAIL_FROM: 'no-reply@example.test',
        NODE_ENV: 'production',
      }),
    ).toThrow('WEB_APP_URL must use HTTPS');
  });
});
