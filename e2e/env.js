'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '.env.test') });

const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT) || 4173;
const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT) || 3099;

module.exports = {
  FRONTEND_PORT,
  BACKEND_PORT,
  FRONTEND_URL: `http://localhost:${FRONTEND_PORT}`,
  BACKEND_URL: `http://localhost:${BACKEND_PORT}`,
  DATABASE_URL: process.env.E2E_DATABASE_URL,
  JWT_SECRET: process.env.E2E_JWT_SECRET,
  CRON_SECRET: process.env.E2E_CRON_SECRET || 'e2e-cron-secret-de-teste',
};
