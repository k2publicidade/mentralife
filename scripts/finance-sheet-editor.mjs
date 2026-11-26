import {CommandType, LocaleType, createUniver, mergeLocales} from '@univerjs/presets';
import {UniverSheetsCorePreset} from '@univerjs/preset-sheets-core';
import {UniverSheetsFilterPreset} from '@univerjs/preset-sheets-filter';
import {UniverSheetsSortPreset} from '@univerjs/preset-sheets-sort';
import {UniverSheetsDataValidationPreset} from '@univerjs/preset-sheets-data-validation';
import {UniverSheetsConditionalFormattingPreset} from '@univerjs/preset-sheets-conditional-formatting';
import core from '@univerjs/preset-sheets-core/locales/pt-BR';
import filter from '@univerjs/preset-sheets-filter/locales/pt-BR';
import sort from '@univerjs/preset-sheets-sort/locales/pt-BR';
import validation from '@univerjs/preset-sheets-data-validation/locales/pt-BR';
import formatting from '@univerjs/preset-sheets-conditional-formatting/locales/pt-BR';
import '@univerjs/preset-sheets-core/lib/index.css';
import '@univerjs/preset-sheets-filter/lib/index.css';
import '@univerjs/preset-sheets-sort/lib/index.css';
import '@univerjs/preset-sheets-data-validation/lib/index.css';
import '@univerjs/preset-sheets-conditional-formatting/lib/index.css';

export function openSpreadsheet(container, snapshot, onChange) {
 const {univer, univerAPI}=createUniver({
  locale:LocaleType.PT_BR,
  locales:{[LocaleType.PT_BR]:mergeLocales(core, filter, sort, validation, formatting)},
  presets:[
   UniverSheetsCorePreset({container}),
   UniverSheetsFilterPreset(),
   UniverSheetsSortPreset(),
   UniverSheetsDataValidationPreset(),
   UniverSheetsConditionalFormattingPreset()
  ]
 });
 try {
  const workbook=univerAPI.createWorkbook(snapshot || {name:'Planejamento financeiro'});
  if(!snapshot)workbook.getActiveSheet().setName('Planejamento');
  workbook.onCommandExecuted(command=>{
   if(command.type===CommandType.MUTATION)onChange();
  });
  return {workbook, dispose:()=>univer.dispose()};
 } catch(error) {
  univer.dispose();
  throw error;
 }
}
