import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const BASE_ENV = {
  PATH: process.env.PATH ?? '',
  NODE_ENV: 'production',
  CAFE_AUTH_SECRET: 'test-secret-with-more-than-thirty-two-characters',
  CAFE_SUPER_ADMIN_PIN: '9876',
  CAFE_OWNER_PIN: '8765',
  CAFE_MANAGER_PIN: '7654',
  CAFE_CASHIER_PIN: '6543',
  CAFE_BARISTA_PIN: '5432',
  CAFE_SERVER_PIN: '4321',
};

function runAuthConfiguration(env: NodeJS.ProcessEnv) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      "import { assertAuthSecretConfigured } from './src/server/auth.ts'; assertAuthSecretConfigured();",
    ],
    { cwd: process.cwd(), env, encoding: 'utf8' }
  );
}

test('production auth requires every role PIN', () => {
  const { CAFE_MANAGER_PIN: _managerPin, ...env } = BASE_ENV;
  const result = runAuthConfiguration(env);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CAFE_MANAGER_PIN/);
});

test('production role PINs must be unique', () => {
  const result = runAuthConfiguration({
    ...BASE_ENV,
    CAFE_MANAGER_PIN: BASE_ENV.CAFE_OWNER_PIN,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be unique/);
});

test('production accepts unique 4-digit role PINs and a long signing secret', () => {
  const result = runAuthConfiguration(BASE_ENV);
  assert.equal(result.status, 0, result.stderr);
});
