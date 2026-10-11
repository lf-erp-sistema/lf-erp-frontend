'use strict';

const path = require('path');
const { defineConfig, devices } = require('@playwright/test');
const ENV = require('./env');

if (!ENV.DATABASE_URL) {
  throw new Error(
    'E2E_DATABASE_URL não definida. Copie e2e/.env.test.example para e2e/.env.test ' +
    'e preencha com a connection string de um branch Neon de TESTE (nunca produção).'
  );
}
if (!ENV.JWT_SECRET || ENV.JWT_SECRET.length < 32) {
  throw new Error('E2E_JWT_SECRET ausente ou com menos de 32 caracteres em e2e/.env.test.');
}

module.exports = defineConfig({
  testDir: './tests',
  globalSetup: require.resolve('./global-setup'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL: ENV.FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: [
    {
      command: 'node static-server.js',
      cwd: __dirname,
      port: ENV.FRONTEND_PORT,
      env: { E2E_FRONTEND_PORT: String(ENV.FRONTEND_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 15000,
    },
    {
      command: 'node server.js',
      cwd: path.join(__dirname, '..', 'backend'),
      port: ENV.BACKEND_PORT,
      env: {
        ...process.env,
        PORT: String(ENV.BACKEND_PORT),
        NODE_ENV: 'test',
        DATABASE_URL: ENV.DATABASE_URL,
        JWT_SECRET: ENV.JWT_SECRET,
        CRON_SECRET: ENV.CRON_SECRET,
        ALLOWED_ORIGINS: ENV.FRONTEND_URL,
        SMTP_REJECT_UNAUTHORIZED: 'false',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
