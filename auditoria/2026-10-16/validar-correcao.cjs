'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const root = path.resolve(__dirname, '../..');
const manifest = path.join(__dirname, 'ambiente-validacao.json');
function copy(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const from = path.join(source, entry.name), to = path.join(target, entry.name);
    if (entry.isDirectory()) copy(from, to);
    else if (/\.(js|cjs|json|sql)$/.test(entry.name)) fs.copyFileSync(from, to);
  }
}
if (process.argv[2] === 'prepare') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-correcao-'));
  copy(path.join(root, 'backend'), path.join(tmp, 'backend-isolado'));
  copy(path.join(root, 'frontend'), path.join(tmp, 'frontend-isolado'));
  fs.writeFileSync(manifest, JSON.stringify({ tmp }, null, 2));
  console.log(JSON.stringify({ backend: path.join(tmp, 'backend-isolado'), frontend: path.join(tmp, 'frontend-isolado') }));
} else if (process.argv[2] === 'sync') {
  const { tmp } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  copy(path.join(root, 'backend'), path.join(tmp, 'backend-isolado'));
  copy(path.join(root, 'frontend'), path.join(tmp, 'frontend-isolado'));
  console.log('Fontes sincronizadas; dependências isoladas preservadas.');
} else {
  const { tmp } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const backend = path.join(tmp, 'backend-isolado'), frontend = path.join(tmp, 'frontend-isolado');
  const result = cp.spawnSync(process.execPath, [path.join(backend, 'node_modules/jest/bin/jest.js'), '--runInBand', '--silent', '--json', '--outputFile', path.join(tmp, 'jest.json')], { cwd: backend, encoding: 'utf8' });
  if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
  const jest = JSON.parse(fs.readFileSync(path.join(tmp, 'jest.json'), 'utf8'));
  const front = cp.spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.join(frontend, 'test/carregamento.test.cjs')], { cwd: frontend, encoding: 'utf8' });
  if (front.status !== 0) { console.error(front.stdout, front.stderr); process.exit(1); }
  const syntax = {};
  function check(dir, isFront, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const filename = path.join(dir, entry.name);
      if (entry.isDirectory()) check(filename, isFront, out);
      else if (/\.(js|cjs)$/.test(entry.name)) {
        const run = cp.spawnSync(process.execPath, isFront && entry.name.endsWith('.js')
          ? ['--input-type=module', '--check'] : ['--check', filename],
          { encoding: 'utf8', ...(isFront && entry.name.endsWith('.js') ? { input: fs.readFileSync(filename) } : {}) });
        if (run.status) throw new Error(filename + '\n' + run.stderr);
        out.push(filename);
      }
    }
    return out;
  }
  syntax.backend = check(backend, false).length;
  syntax.frontend = check(frontend, true).length;
  const output = { backend: { suites: jest.numPassedTestSuites, testes: jest.numPassedTests, falhas: jest.numFailedTests },
    frontend: { testes: Number(front.stdout.match(/# tests (\d+)/)?.[1]), falhas: Number(front.stdout.match(/# fail (\d+)/)?.[1]) }, sintaxe: syntax };
  fs.writeFileSync(path.join(__dirname, 'validacao-correcao.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify(output, null, 2));
}
