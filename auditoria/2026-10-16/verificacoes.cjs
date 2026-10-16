'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const root = path.resolve(__dirname, '../..');
const output = { repositorios: {}, sintaxe: {}, ciIsolado: {} };
for (const repo of ['backend', 'frontend']) {
  const cwd = path.join(root, repo);
  const files = cp.execFileSync('git', ['ls-files'], { cwd, encoding: 'utf8' }).trim().split(/\r?\n/);
  const sourceFiles = files.filter(f => f.endsWith('.js'));
  const failures = [];
  for (const file of sourceFiles) {
    const result = repo === 'frontend'
      ? cp.spawnSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(path.join(cwd, file)), encoding: 'utf8' })
      : cp.spawnSync(process.execPath, ['--check', path.join(cwd, file)], { encoding: 'utf8' });
    if (result.status !== 0) failures.push({ file, error: result.stderr });
  }
  output.sintaxe[repo] = { arquivos: sourceFiles.length, falhas: failures };
  output.repositorios[repo] = {
    commit: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim(),
    arquivosVersionados: files.length,
    inventarioCodigo: files.filter(f => /\.(js|html|css|json|sql|yml|yaml)$/.test(f)),
  };
}
// Reproduz o checkout isolado do backend usado pelo workflow: não há frontend irmão.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-audit-ci-'));
fs.mkdirSync(path.join(tmp, 'test'));
for (const file of ['contasPagar.carregamento.test.js', 'paginas.carregamento.test.js']) {
  fs.copyFileSync(path.join(root, 'backend/test', file), path.join(tmp, 'test', file));
}
const jest = path.join(root, 'backend/node_modules/jest/bin/jest.js');
const run = cp.spawnSync(process.execPath, [jest, '--runInBand', '--json', '--outputFile', path.join(tmp, 'resultado.json'),
  '--config', JSON.stringify({ rootDir: tmp, testEnvironment: 'node', testMatch: ['**/test/*.test.js'] })], { encoding: 'utf8' });
const result = JSON.parse(fs.readFileSync(path.join(tmp, 'resultado.json'), 'utf8'));
output.ciIsolado = {
  exitCode: run.status, total: result.numTotalTests, falhas: result.numFailedTests,
  erro: result.testResults.flatMap(t => t.assertionResults).flatMap(t => t.failureMessages).find(m => m.includes('ENOENT'))?.split('\n')[0],
};
output.nodeLocal = process.version;
fs.writeFileSync(path.join(__dirname, 'verificacoes.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ sintaxe: output.sintaxe, ciIsolado: output.ciIsolado, nodeLocal: output.nodeLocal }, null, 2));
// O diretório temporário contém apenas duas cópias de testes e seu resultado, preservado para inspeção.
