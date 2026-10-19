const testDatabaseUrl = process.env.AUTH_TEST_DATABASE_URL;
const integrationTestsEnabled = process.env.RUN_AUTH_INTEGRATION_TESTS === '1';

if (integrationTestsEnabled) {
  if (!testDatabaseUrl) {
    throw new Error('AUTH_TEST_DATABASE_URL is required when RUN_AUTH_INTEGRATION_TESTS=1.');
  }

  const databaseUrl = new URL(testDatabaseUrl);
  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (
    databaseUrl.protocol !== 'postgresql:' ||
    !['127.0.0.1', 'localhost'].includes(databaseUrl.hostname) ||
    !databaseName.endsWith('_test')
  ) {
    throw new Error(
      'Auth integration tests require a loopback PostgreSQL database whose name ends in _test.',
    );
  }

  process.env.DATABASE_URL = testDatabaseUrl;
} else {
  process.env.DATABASE_URL ??=
    'postgresql://auth_test:auth_test@127.0.0.1:65432/garquinsfilm_auth_test?schema=public';
}

process.env.BETTER_AUTH_SECRET ??= 'test-only-better-auth-secret-not-for-any-deployment';
process.env.BETTER_AUTH_URL ??= 'http://127.0.0.1:3001';
process.env.BETTER_AUTH_TRUSTED_ORIGINS ??= 'http://127.0.0.1:5173';
