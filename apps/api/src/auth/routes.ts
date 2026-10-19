import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { auth } from './auth.js';
import { getAuthConfig } from './config.js';

const authRoutes: FastifyPluginAsync = async (app) => {
  const { baseURL, trustedOrigins } = getAuthConfig();
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
        const body =
          request.body === undefined
            ? undefined
            : typeof request.body === 'string'
              ? request.body
              : JSON.stringify(request.body);
        const headers = fromNodeHeaders(request.headers);
        headers.set('x-garquinsfilm-client-ip', request.ip);
        const authRequest = new Request(new URL(request.url, baseURL), {
          method: request.method,
          headers,
          ...(body === undefined ? {} : { body }),
        });
        const response = await auth.handler(authRequest);
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
      const session = await auth.api.getSession({
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
