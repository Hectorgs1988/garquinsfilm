import { prismaAdapter } from '@better-auth/prisma-adapter';
import { betterAuth } from 'better-auth';
import { getAuthConfig } from './config.js';
import { getPrismaClient } from '../db/client.js';
import {
  createPasswordResetEmail,
  createSmtpEmailSender,
  type EmailSender,
} from '../email/email.service.js';

export function createAuthOptions(options: { emailSender?: EmailSender } = {}) {
  const config = getAuthConfig();
  const emailSender = options.emailSender ?? createSmtpEmailSender(config.smtp);
  const sendPasswordResetEmail = createPasswordResetEmail(emailSender, config.webAppURL);
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
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, token }: { user: { email: string }; token: string }) {
        try {
          await sendPasswordResetEmail({ email: user.email, token });
        } catch (error) {
          try {
            await getPrismaClient().verification.deleteMany({
              where: { identifier: `reset-password:${token}` },
            });
          } catch (cleanupError) {
            logEmailFailure('password-reset-cleanup', cleanupError);
          }
          logEmailFailure('password-reset-delivery', error);
        }
      },
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
        '/request-password-reset': { window: 60, max: 5 },
        '/reset-password': { window: 60, max: 10 },
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

function logEmailFailure(operation: string, error: unknown): void {
  console.error(
    JSON.stringify({
      event: 'email.delivery_failed',
      operation,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
}

export const auth = betterAuth(createAuthOptions());

export type AuthRuntime = Pick<typeof auth, 'handler'> & {
  api: Pick<typeof auth.api, 'getSession'>;
};
