'use strict';

// Helpers de seed via API pública do próprio backend — evita qualquer SQL
// direto (e portanto qualquer acoplamento com o schema): usa /registro e
// /usuarios exatamente como um usuário real usaria, contra o branch de
// teste configurado em e2e/.env.test.
//
// IMPORTANTE: /registro e /login passam pelo loginRateLimiter real do
// backend (10 tentativas / 15min por IP) — é uma proteção de segurança
// genuína que não deve ser enfraquecida nem mesmo pros testes. Por isso:
// - /registro só é chamado UMA VEZ por execução inteira da suíte (ver
//   global-setup.js), não por arquivo de teste.
// - Tokens de usuários criados via POST /usuarios (que NÃO é rate-limited
//   por login) são gerados localmente aqui, com a mesma JWT_SECRET do
//   backend de teste, em vez de fazer uma chamada real a /login. Só os
//   testes que testam o LOGIN em si (auth.spec.js) chamam /login de verdade.

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const ENV = require('../env');

const SENHA_PADRAO = 'Teste1234!';

function sufixoUnico() {
  return `${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

// Mesmo formato de payload que backend/routes/auth.routes.js usa no /login —
// suficiente pro middleware auth() aceitar (precisa de id, tipo e empresa_id).
function mintToken({ id, usuario, tipo, empresaId, empresaNome }) {
  return jwt.sign(
    {
      id,
      usuario,
      tipo,
      is_saas_owner: false,
      empresa: empresaNome,
      empresa_id: empresaId,
      empresa_nome: empresaNome,
      nome_completo: usuario,
    },
    ENV.JWT_SECRET,
    { expiresIn: '12h' }
  );
}

// Dois ajustes que não existem via API pública, feitos direto no banco de
// teste:
// - Plano: o padrão de registro (starter) limita a 2 usuários, insuficiente
//   pros cenários que precisam de admin + gerente + funcionario distintos.
// - Feature flag: assistencia_tecnica é opt-in por empresa (empresa_features),
//   desabilitado por padrão pra empresas novas (só é ligado manualmente por
//   nome em produção, via migration 047) — sem isso o item de menu "Ordens
//   de Serviço" (Assistência Técnica) fica com display:none.
async function prepararEmpresaParaTestes(empresaId) {
  const pool = new Pool({ connectionString: ENV.DATABASE_URL });
  try {
    await pool.query(
      `UPDATE empresas SET plano_id = (SELECT id FROM planos WHERE codigo = 'premium') WHERE id = $1`,
      [empresaId]
    );
    await pool.query(
      `INSERT INTO empresa_features (empresa_id, feature, habilitado)
       VALUES ($1, 'assistencia_tecnica', TRUE)
       ON CONFLICT (empresa_id, feature) DO UPDATE SET habilitado = TRUE`,
      [empresaId]
    );
  } finally {
    await pool.end();
  }
}

// Seed em lote exclusivo do banco E2E. Criar mais de 30 OS pela API acionaria
// corretamente o writeRateLimiter de produção e impediria testar paginação.
// Este helper não testa criação de OS; ele apenas prepara o volume necessário
// para que a interface seja exercitada sem enfraquecer o rate limiter.
async function criarOrdensServicoParaTeste({ empresaId, empresaNome, total }) {
  const pool = new Pool({ connectionString: ENV.DATABASE_URL });
  const prefixo = `E2E-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  try {
    await pool.query(
      `INSERT INTO ordens_servico
         (numero, empresa, empresa_id, status, equipamento_tipo, problema_relatado)
       SELECT $3 || '-' || n, $2, $1, 'aberta', 'Celular', 'Defeito E2E'
       FROM generate_series(1, $4) AS n`,
      [empresaId, empresaNome, prefixo, total]
    );
  } finally {
    await pool.end();
  }
}

async function registrarEmpresa(request, { nomeEmpresa, usuarioAdmin } = {}) {
  const sufixo = sufixoUnico();
  const nome = nomeEmpresa || `E2E Empresa ${sufixo}`;
  const usuario = usuarioAdmin || `e2e_admin_${sufixo}`;

  const resp = await request.post(`${ENV.BACKEND_URL}/registro`, {
    data: {
      nome_empresa: nome,
      nome_responsavel: 'E2E Admin',
      usuario,
      senha: SENHA_PADRAO,
    },
  });

  if (!resp.ok()) {
    throw new Error(`Falha ao registrar empresa de teste: ${resp.status()} ${await resp.text()}`);
  }

  const body = await resp.json();
  return {
    empresaId: body.empresa.id,
    empresaNome: body.empresa.nome,
    admin: {
      id: body.user.id,
      usuario,
      senha: SENHA_PADRAO,
      tipo: 'admin',
      token: body.token,
      user: body.user,
    },
  };
}

async function criarUsuario(request, { adminToken, empresaId, empresaNome, tipo, usuarioBase }) {
  const sufixo = sufixoUnico();
  const usuario = `${usuarioBase}_${sufixo}`;

  const resp = await request.post(`${ENV.BACKEND_URL}/usuarios`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: {
      empresa: empresaNome,
      nome: `E2E ${tipo}`,
      usuario,
      senha: SENHA_PADRAO,
      tipo,
    },
  });

  if (!resp.ok()) {
    throw new Error(`Falha ao criar usuário ${tipo} de teste: ${resp.status()} ${await resp.text()}`);
  }

  const { id } = await resp.json();
  const token = mintToken({ id, usuario, tipo, empresaId, empresaNome });

  return { id, usuario, senha: SENHA_PADRAO, tipo, token };
}

/**
 * Cria uma empresa de teste isolada com 3 usuários:
 * - admin: acesso total (criado pelo /registro)
 * - gerente: tem financeiro.editar = true (permissoes_padrao)
 * - funcionario: NÃO tem financeiro.editar (permissoes_padrao) — usado para
 *   validar que o endpoint de alertas preventivos nega acesso corretamente.
 *
 * Chama /registro uma única vez (ver nota de rate limit no topo do arquivo).
 */
async function seedEmpresaCompleta(request) {
  const { empresaId, empresaNome, admin } = await registrarEmpresa(request);
  await prepararEmpresaParaTestes(empresaId);

  const gerente = await criarUsuario(request, {
    adminToken: admin.token,
    empresaId,
    empresaNome,
    tipo: 'gerente',
    usuarioBase: 'e2e_gerente',
  });

  const funcionario = await criarUsuario(request, {
    adminToken: admin.token,
    empresaId,
    empresaNome,
    tipo: 'funcionario',
    usuarioBase: 'e2e_funcionario',
  });

  return { empresaId, empresaNome, admin, gerente, funcionario };
}

// Chamada real a /login — só usar em testes que testam o login em si
// (auth.spec.js). Conta contra o rate limiter de verdade.
async function login(request, { usuario, senha }) {
  const resp = await request.post(`${ENV.BACKEND_URL}/login`, { data: { usuario, senha } });
  if (!resp.ok()) {
    throw new Error(`Falha no login de ${usuario}: ${resp.status()} ${await resp.text()}`);
  }
  return resp.json();
}

module.exports = {
  registrarEmpresa, criarUsuario, seedEmpresaCompleta, criarOrdensServicoParaTeste,
  login, mintToken, SENHA_PADRAO
};
