import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { auth, type AuthRuntime } from './auth.js';
import { getAuthConfig } from './config.js';

interface AuthRoutesOptions {
  auth?: AuthRuntime;
}

const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, options) => {
  const { baseURL, webAppURL, trustedOrigins } = getAuthConfig();
  const authInstance = options.auth ?? auth;
  const trustedOriginSet = new Set(trustedOrigins);

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/auth/') && !request.url.startsWith('/api/me')) {
      return;
    }

    const origin = request.headers.origin;
    if (origin && !trustedOriginSet.has(origin)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  });

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      try {
        let body =
          request.body === undefined
            ? undefined
            : typeof request.body === 'string'
              ? request.body
              : JSON.stringify(request.body);
        const requestURL = new URL(request.url, baseURL);
        if (
          request.method === 'POST' &&
          requestURL.pathname === '/api/auth/request-password-reset' &&
          isRecord(request.body)
        ) {
          const redirectTo = new URL('/reset-password', webAppURL).toString();
          if (request.body.redirectTo !== undefined && request.body.redirectTo !== redirectTo) {
            return reply.code(400).send({ error: 'Invalid password-reset redirect.' });
          }
          body = JSON.stringify({ ...request.body, redirectTo });
        }
        const headers = fromNodeHeaders(request.headers);
        headers.set('x-garquinsfilm-client-ip', request.ip);
        const authRequest = new Request(new URL(request.url, baseURL), {
          method: request.method,
          headers,
          ...(body === undefined ? {} : { body }),
        });
        const response = await authInstance.handler(authRequest);
        return sendAuthResponse(response, reply);
      } catch (error) {
        request.log.error(
          { errorType: error instanceof Error ? error.name : 'UnknownError' },
          'Authentication request failed.',
        );
        return reply.code(500).send({ error: 'Authentication request failed.' });
      }
    },
  });

  app.get('/api/me', async (request, reply) => {
    try {
      const session = await authInstance.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
      if (!session) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      return {
        user: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          role: session.user.role,
        },
      };
    } catch (error) {
      request.log.error(
        { errorType: error instanceof Error ? error.name : 'UnknownError' },
        'Session lookup failed.',
      );
      return reply.code(500).send({ error: 'Unable to retrieve session.' });
    }
  });
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function sendAuthResponse(
  response: Response,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (response.status >= 500) {
    return reply.code(500).send({ error: 'Authentication request failed.' });
  }

  response.headers.forEach((value, key) => {
    if (
      !['set-cookie', 'content-length', 'connection', 'transfer-encoding'].includes(
        key.toLowerCase(),
      )
    ) {
      reply.header(key, value);
    }
  });

  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) {
    reply.header('set-cookie', cookies);
  }

  reply.code(response.status);
  if (!response.body) {
    return reply.send();
  }
  return reply.send(Buffer.from(await response.arrayBuffer()));
}

export default authRoutes;
