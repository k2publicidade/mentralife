import test from 'node:test';
import assert from 'node:assert/strict';
import {CFB, read} from 'xlsx';
import {writeSpreadsheet} from '../scripts/finance-sheet-xlsx.mjs';
import {googleBudgetTemplate} from '../dist/finance-sheet-template.mjs';

test('exported XLSX asks spreadsheet apps to recalculate every formula on open', () => {
  const bytes = writeSpreadsheet(googleBudgetTemplate({today: '2026-11-12'}));
  const zip = CFB.read(new Uint8Array(bytes), {type: 'array'});
  const workbook = new TextDecoder().decode(CFB.find(zip, '/xl/workbook.xml').content);
  assert.match(workbook, /<calcPr [^>]*fullCalcOnLoad="1"/);
  assert.equal((workbook.match(/<calcPr\b/g) || []).length, 1);
  const book = read(bytes);
  assert.deepEqual(book.SheetNames, ['Resumo', 'Transações']);
  assert.equal(book.Sheets.Resumo.D9.f, 'H6+I18-D18');
  assert.equal(book.Sheets.Resumo.B6.v, 'Orçamento mensal');
  assert.equal(book.Sheets['Transações'].D6.v, 'Aluguel');
});

test('blank Google-style template carries no sample transactions', () => {
  const book = read(writeSpreadsheet(googleBudgetTemplate({sample: false, today: '2026-11-12'})));
  assert.equal(book.Sheets['Transações'].D6?.v, undefined);
  assert.equal(book.Sheets.Resumo.H6.v, 0);
});
