export interface AuthEnvironment {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  NODE_ENV?: string;
}

export interface AuthConfig {
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  secureCookies: boolean;
}

export function getAuthConfig(environment: AuthEnvironment = process.env): AuthConfig {
  const secret = environment.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32 || secret.toLowerCase().startsWith('replace-')) {
    throw new Error('BETTER_AUTH_SECRET must be a configured secret of at least 32 characters.');
  }

  const baseURL = environment.BETTER_AUTH_URL?.trim();
  if (!baseURL) {
    throw new Error('BETTER_AUTH_URL must be configured explicitly.');
  }

  const parsedBaseURL = parseOrigin(baseURL, 'BETTER_AUTH_URL');
  const secureCookies = environment.NODE_ENV === 'production';
  if (secureCookies && parsedBaseURL.protocol !== 'https:') {
    throw new Error('BETTER_AUTH_URL must use HTTPS in production.');
  }

  const trustedOrigins = new Set([parsedBaseURL.origin]);
  for (const entry of (environment.BETTER_AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)) {
    trustedOrigins.add(parseOrigin(entry, 'BETTER_AUTH_TRUSTED_ORIGINS').origin);
  }

  return {
    baseURL: parsedBaseURL.origin,
    secret,
    trustedOrigins: [...trustedOrigins],
    secureCookies,
  };
}

function parseOrigin(value: string, variable: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variable} must contain a valid HTTP(S) origin.`);
  }

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${variable} must contain an HTTP(S) origin without a path.`);
  }

  return parsed;
}
