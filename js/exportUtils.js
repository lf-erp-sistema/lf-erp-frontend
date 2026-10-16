/**
 * exportUtils — LF ERP
 * Exportação CSV com UTF-8 BOM para compatibilidade com Excel em português.
 *
 * Uso básico (retrocompatível):
 *   exportCSV(linhas, 'relatorio_vendas')
 *
 * Com metadados (cabeçalho formatado):
 *   exportCSV(linhas, 'relatorio_vendas', { titulo: 'Relatório de Vendas', periodo: '01/01/2026 – 30/06/2026', empresa: 'Lucileide Variedades' })
 *
 * @param {Object[]} linhas    — array de objetos planos; keys viram cabeçalhos
 * @param {string}   arquivo   — nome sem extensão (padrão: 'exportacao')
 * @param {Object}   [opcoes]  — { titulo?, empresa?, periodo? }
 */
export function csvCell(value) {
  const numeric = (typeof value === 'number' && Number.isFinite(value))
    || (typeof value === 'string' && /^-?\d+(?:[.,]\d+)?$/.test(value));
  let text = String(value ?? '');
  if (!numeric && /^[\s\uFEFF]*[=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function exportCSV(linhas, arquivo = 'exportacao', opcoes = {}) {
  if (!Array.isArray(linhas) || linhas.length === 0) return;

  const cabecalhos = Object.keys(linhas[0]);

  const linhasCSV = linhas.map((row) =>
    cabecalhos
      .map((k) => {
        return csvCell(row[k]);
      })
      .join(';')
  );

  const metaLinhas = [];
  if (opcoes.titulo)   metaLinhas.push(csvCell(opcoes.titulo));
  if (opcoes.empresa)  metaLinhas.push(csvCell(`Empresa: ${opcoes.empresa}`));
  if (opcoes.periodo)  metaLinhas.push(csvCell(`Período: ${opcoes.periodo}`));
  metaLinhas.push(csvCell(`Gerado em: ${new Date().toLocaleString('pt-BR')}`));
  metaLinhas.push('');

  // UTF-8 BOM (﻿) garante que Excel abra o arquivo em português corretamente
  const csv = '﻿' + [...metaLinhas, cabecalhos.map(csvCell).join(';'), ...linhasCSV].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${arquivo}_${hojeFormatado()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Formata número para o padrão BR sem símbolo (útil em células numéricas do Excel) */
export function numCSV(v) {
  return Number(v || 0).toFixed(2).replace('.', ',');
}

function hojeFormatado() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
