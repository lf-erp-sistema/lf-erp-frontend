'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const root = path.resolve(__dirname, '../..');
const yaml = require(path.join(root, 'backend/node_modules/js-yaml'));
const bash = 'C:/Program Files/Git/bin/bash.exe';
for (const repo of ['frontend', 'backend']) {
  const cwd = path.join(root, repo);
  const config = yaml.load(fs.readFileSync(path.join(cwd, '.github/workflows/ci.yml'), 'utf8'));
  for (const step of config.jobs.check.steps) {
    if (!step.run || (repo === 'backend' && !step.name.startsWith('Syntax'))) continue;
    const result = cp.spawnSync(bash, ['-e', '-c', step.run], { cwd, encoding: 'utf8', timeout: 60000 });
    console.log(`${repo}: ${step.name}: ${result.status === 0 ? 'OK' : 'FALHOU'}`);
    if (result.status !== 0) { console.error(result.stdout, result.stderr, result.error || ''); process.exitCode = 1; }
  }
}
