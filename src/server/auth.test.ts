import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const BASE_ENV = {
  PATH: process.env.PATH ?? '',
  NODE_ENV: 'production',
  CAFE_AUTH_SECRET: 'test-secret-with-more-than-thirty-two-characters',
  CAFE_ADMIN_PIN: '8765',
  CAFE_KITCHEN_PIN: '5432',
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

test('production auth requires admin and kitchen PINs', () => {
  const { CAFE_KITCHEN_PIN: _kitchenPin, ...env } = BASE_ENV;
  const result = runAuthConfiguration(env);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CAFE_KITCHEN_PIN/);
});

test('production role PINs must be unique', () => {
  const result = runAuthConfiguration({
    ...BASE_ENV,
    CAFE_KITCHEN_PIN: BASE_ENV.CAFE_ADMIN_PIN,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must be unique/);
});

test('production accepts unique 4-digit role PINs and a long signing secret', () => {
  const result = runAuthConfiguration(BASE_ENV);
  assert.equal(result.status, 0, result.stderr);
});
