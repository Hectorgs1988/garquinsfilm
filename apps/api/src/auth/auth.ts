import { prismaAdapter } from '@better-auth/prisma-adapter';
import { betterAuth } from 'better-auth';
import { getAuthConfig } from './config.js';
import { getPrismaClient } from '../db/client.js';

export function createAuthOptions() {
  const config = getAuthConfig();
  return {
    appName: 'GarquinsFilm',
    baseURL: config.baseURL,
    basePath: '/api/auth',
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    database: prismaAdapter(getPrismaClient(), { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: false,
    },
    user: {
      additionalFields: {
        role: {
          type: 'string' as const,
          required: true as const,
          defaultValue: 'user' as const,
          input: false as const,
        },
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 5 },
      },
    },
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['x-garquinsfilm-client-ip'],
      },
      useSecureCookies: config.secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: config.secureCookies,
      },
    },
  };
}

export const auth = betterAuth(createAuthOptions());
