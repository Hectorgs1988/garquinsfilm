export interface AuthEnvironment {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  NODE_ENV?: string;
  WEB_APP_URL?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_SECURE?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  EMAIL_FROM?: string;
}

export interface AuthConfig {
  baseURL: string;
  webAppURL: string;
  secret: string;
  trustedOrigins: string[];
  secureCookies: boolean;
  smtp: {
    host?: string;
    port: number;
    secure: boolean;
    user?: string;
    password?: string;
    from?: string;
  };
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

  const webAppURL = environment.WEB_APP_URL?.trim()
    ? parseOrigin(environment.WEB_APP_URL.trim(), 'WEB_APP_URL').origin
    : [...trustedOrigins].find((origin) => origin !== parsedBaseURL.origin);
  if (!webAppURL || !trustedOrigins.has(webAppURL)) {
    throw new Error('WEB_APP_URL must be configured as a trusted origin.');
  }
  if (environment.NODE_ENV === 'production' && !webAppURL.startsWith('https://')) {
    throw new Error('WEB_APP_URL must use HTTPS in production.');
  }

  if (secureCookies) {
    const insecureOrigin = [...trustedOrigins].find((origin) => !origin.startsWith('https://'));
    if (insecureOrigin) {
      throw new Error('BETTER_AUTH_TRUSTED_ORIGINS must only contain HTTPS origins in production.');
    }
  }

  const smtpPort = parsePort(environment.SMTP_PORT);
  const smtpSecure = parseBoolean(environment.SMTP_SECURE, 'SMTP_SECURE');
  const smtpHost =
    environment.SMTP_HOST?.trim() ||
    (environment.NODE_ENV === 'development' ? '127.0.0.1' : undefined);
  const smtpUser = environment.SMTP_USER?.trim() || undefined;
  const smtpPassword = environment.SMTP_PASSWORD || undefined;
  const emailFrom =
    environment.EMAIL_FROM?.trim() ||
    (environment.NODE_ENV === 'development'
      ? 'GarquinsFilm <no-reply@garquinsfilm.local>'
      : undefined);
  if ((smtpUser && !smtpPassword) || (!smtpUser && smtpPassword)) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must be configured together.');
  }
  if ([smtpHost, smtpUser, emailFrom].some((value) => value?.includes('\n'))) {
    throw new Error('SMTP settings must not contain newline characters.');
  }
  if (
    environment.NODE_ENV === 'production' &&
    (!smtpHost ||
      !emailFrom ||
      smtpHost.toLowerCase() === 'mailpit' ||
      ['localhost', '127.0.0.1', '::1'].includes(smtpHost.toLowerCase()))
  ) {
    throw new Error('Production email must use an explicitly configured non-Mailpit SMTP server.');
  }

  return {
    baseURL: parsedBaseURL.origin,
    webAppURL,
    secret,
    trustedOrigins: [...trustedOrigins],
    secureCookies,
    smtp: {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      user: smtpUser,
      password: smtpPassword,
      from: emailFrom,
    },
  };
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return 1025;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function parseBoolean(value: string | undefined, variable: string): boolean {
  if (value === undefined || value.trim() === '') {
    return false;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new Error(`${variable} must be true or false.`);
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
