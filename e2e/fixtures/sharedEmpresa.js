'use strict';

const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, '..', '.seed-cache.json');

function getSharedEmpresa() {
  return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
}

module.exports = { getSharedEmpresa, CACHE_PATH };
