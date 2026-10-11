'use strict';

// Roda UMA VEZ pra toda a execução da suíte — cria a empresa+usuários de
// teste por API e guarda num JSON local pros arquivos de spec reutilizarem
// via fixtures/sharedEmpresa.js. Existe só pra isso: /registro passa pelo
// loginRateLimiter real do backend (10 tentativas/15min por IP), então
// cada spec file chamando /registro no seu próprio beforeAll estourava o
// limite rapidinho — comportamento correto do rate limiter, não um bug.

const fs = require('fs');
const { request } = require('@playwright/test');
const { seedEmpresaCompleta } = require('./fixtures/seed');
const { CACHE_PATH } = require('./fixtures/sharedEmpresa');

module.exports = async function globalSetup() {
  const ctx = await request.newContext();
  try {
    const empresa = await seedEmpresaCompleta(ctx);
    fs.writeFileSync(CACHE_PATH, JSON.stringify(empresa, null, 2));
  } finally {
    await ctx.dispose();
  }
};
