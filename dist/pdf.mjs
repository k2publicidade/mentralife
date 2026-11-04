import {fonts} from './pdf-fonts.mjs';
// Small, dependency-free PDF writer. Files are built locally; no document leaves the browser.
// Embedded Liberation Sans TrueType fonts + WinAnsi preserve Brazilian Portuguese accents.
// Text is emitted as hexadecimal strings, never interpolated into PDF operators.
const A4={width:595.28,height:841.89};
const special=new Map([[0x20ac,0x80],[0x201a,0x82],[0x0192,0x83],[0x201e,0x84],[0x2026,0x85],[0x2020,0x86],[0x2021,0x87],[0x02c6,0x88],[0x2030,0x89],[0x0160,0x8a],[0x2039,0x8b],[0x0152,0x8c],[0x017d,0x8e],[0x2018,0x91],[0x2019,0x92],[0x201c,0x93],[0x201d,0x94],[0x2022,0x95],[0x2013,0x96],[0x2014,0x97],[0x02dc,0x98],[0x2122,0x99],[0x0161,0x9a],[0x203a,0x9b],[0x0153,0x9c],[0x017e,0x9e],[0x0178,0x9f]]);
const copy=value=>globalThis.mentraProduction?String(value).replaceAll('DADOS DE DEMONSTRAÇÃO','DADOS INFORMADOS').replaceAll('demonstração local','registro próprio').replaceAll('na demonstração','no aplicativo').replaceAll('nesta demonstração','neste aplicativo').replaceAll('fora desta demonstração','fora do aplicativo').replaceAll('registros de demonstração','registros informados'):value;
const clean=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/\r\n?/g,'\n');
const hexText=value=>Array.from(clean(value)).map(c=>{const n=c.codePointAt(0);return(n<=255?n:special.get(n)??63).toString(16).padStart(2,'0');}).join('').toUpperCase();
const rgb=c=>c.map(n=>(n/255).toFixed(3)).join(' ');
const colors={green:[23,62,50],ink:[39,54,46],muted:[94,109,98],line:[218,225,211],cream:[241,244,233]};
const money=cents=>(Number(cents||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?s.split('-').reverse().join('/'):String(s||'Não informado');
function widthOf(value,size=11,bold=false){const widths=(bold?fonts.bold:fonts.regular).widths;return Array.from(clean(value)).reduce((total,c)=>{const code=c.codePointAt(0),byte=code<=255?code:special.get(code)??63;return total+(widths[byte-32]||widths[31]||500)*size/1000;},0);}
function wrap(value,width=80,size=11,bold=false){const maxWidth=width*size*.5,words=clean(value).replace(/\s+/g,' ').trim().split(' ');const lines=[];let line='';for(let word of words){while(widthOf(word,size,bold)>maxWidth){if(line){lines.push(line);line='';}let chunk='';while(word&&widthOf(chunk+word[0],size,bold)<=maxWidth){chunk+=word[0];word=word.slice(1);}if(!chunk){chunk=word[0];word=word.slice(1);}lines.push(chunk);}if(widthOf((line+' '+word).trim(),size,bold)>maxWidth){lines.push(line);line=word;}else line=(line+' '+word).trim();}if(line)lines.push(line);return lines.length?lines:[''];}
class PDF{
 constructor(){this.pages=[];this.newPage();}
 newPage(){this.pages.push([]);this.y=48;}
 command(s){this.pages.at(-1).push(s);}
 text(value,x,y,size=11,bold=false,color=colors.ink){this.command(`BT /${bold?'F2':'F1'} ${size} Tf ${rgb(color)} rg 1 0 0 1 ${x.toFixed(2)} ${(A4.height-y).toFixed(2)} Tm <${hexText(value)}> Tj ET`);}
 rect(x,y,w,h,color){this.command(`${rgb(color)} rg ${x.toFixed(2)} ${(A4.height-y-h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);}
 line(x1,y1,x2,y2,color=colors.line){this.command(`${rgb(color)} RG 0.7 w ${x1} ${A4.height-y1} m ${x2} ${A4.height-y2} l S`);}
 paragraph(value,{x=46,size=11,width=85,lineHeight=17,color=colors.ink,bold=false}={}){for(const line of wrap(value,width,size,bold)){this.ensure(lineHeight);this.text(line,x,this.y,size,bold,color);this.y+=lineHeight;}this.y+=6;}
 ensure(height=30){if(this.y+height>765){this.newPage();this.text('mentra life',46,44,12,true,colors.green);this.y=73;}}
 labelValue(label,value){this.ensure(65);this.text(label.toUpperCase(),46,this.y,8,true,colors.muted);this.y+=20;this.paragraph(value,{size:12,width:72,lineHeight:18});this.y+=10;}
 header(title,subtitle){this.rect(0,0,A4.width,123,colors.green);this.text('mentra life',46,38,15,true,[244,246,225]);this.text(title,46,76,23,true,[249,249,235]);wrap(subtitle,98,9).forEach((line,index)=>this.text(line,46,99+index*12,9,false,[216,228,200]));this.y=159;}
 finish(){this.pages.forEach((commands,i)=>{commands.push(`${rgb(colors.line)} RG 0.5 w 46 51 m 549 51 l S`);commands.push(`BT /F1 8 Tf ${rgb(colors.muted)} rg 1 0 0 1 46 34 Tm <${hexText(copy('Mentra Life · demonstração local · não é documento fiscal'))}> Tj ET`);commands.push(`BT /F1 8 Tf ${rgb(colors.muted)} rg 1 0 0 1 509 34 Tm <${hexText(`${i+1} / ${this.pages.length}`)}> Tj ET`);});
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','','','','','','',''];const kids=[];
  for(const [index,font] of [fonts.regular,fonts.bold].entries()){const descriptorId=5+index,streamId=7+index;objects[2+index]=`<< /Type /Font /Subtype /TrueType /BaseFont /${font.name} /FirstChar 32 /LastChar 255 /Widths [${font.widths.join(' ')}] /Encoding /WinAnsiEncoding /FontDescriptor ${descriptorId} 0 R >>`;objects[descriptorId-1]=`<< /Type /FontDescriptor /FontName /${font.name} /Flags 32 /FontBBox [${font.bbox.join(' ')}] /ItalicAngle 0 /Ascent ${font.ascent} /Descent ${font.descent} /CapHeight ${font.ascent} /StemV ${index?120:80} /FontFile2 ${streamId} 0 R >>`;const raw=atob(font.data);objects[streamId-1]=`<< /Length ${raw.length} /Length1 ${raw.length} >>\nstream\n${raw}\nendstream`;}

  for(const commands of this.pages){const pageId=objects.length+1,streamId=pageId+1;kids.push(`${pageId} 0 R`);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`);const stream=commands.join('\n')+'\n';objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);}
  objects[1]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${this.pages.length} >>`;let file='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';const offsets=[0];objects.forEach((obj,i)=>{offsets.push(file.length);file+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const xref=file.length;file+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;for(const offset of offsets.slice(1))file+=`${String(offset).padStart(10,'0')} 00000 n \n`;file+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Uint8Array.from(file,c=>c.charCodeAt(0));
 }
}
export function createRecordPdf(data){const p=new PDF();p.header('Registro de despesa',copy('CONTROLE PESSOAL · DADOS DE DEMONSTRAÇÃO'));p.labelValue('Descrição',data.title);p.labelValue('Valor registrado',money(data.cents));p.labelValue('Data e situação',`${date(data.date)} · ${data.status==='estimated'?'Previsão, não paga':'Registrado como realizado'}`);p.labelValue('Conta e forma de pagamento',`${data.accountName||'Sem conta definida'} · ${data.methodLabel||data.paymentMethod||'Não informado'}`);p.labelValue('Categoria',data.category||'Outros');if(data.note)p.labelValue('Observação',data.note);p.y+=8;p.paragraph(copy('Este registro foi criado a partir dos dados informados na demonstração. Não é nota fiscal, comprovante bancário ou confirmação independente de pagamento.'),{size:10,color:colors.muted,width:90,lineHeight:16});return p.finish();}
export function createReceiptPdf(data){const p=new PDF();p.header('Rascunho de recibo de pagamento','RASCUNHO PARA REVISÃO · NÃO É NOTA FISCAL');p.labelValue('Valor do pagamento informado',money(data.cents));p.labelValue('Quem pagou',data.payer||'A preencher');p.labelValue('Quem recebeu',data.payee||'A preencher');p.labelValue('Referente a',data.title||data.motivo||'A preencher');p.labelValue('Data e forma de pagamento',`${date(data.date)} · ${data.methodLabel||data.paymentMethod||'Não informado'}`);if(data.note)p.labelValue('Observação',data.note);p.ensure(160);p.y+=10;p.line(46,p.y+34,385,p.y+34,colors.muted);p.text('Assinatura de quem recebeu',46,p.y+52,10,false,colors.muted);p.y+=88;p.paragraph(copy('Rascunho sem assinatura capturada. Revise os dados e colha a assinatura fora desta demonstração, se apropriado. O arquivo não confirma automaticamente pagamento ou quitação e não contém assinatura eletrônica validada.'),{size:9,color:colors.muted,width:97,lineHeight:14});return p.finish();}
// Standalone documents use only the supplied declaration, without creating or reading a ledger entry.
export function createPaymentDocumentPdf(data){
 if(data?.documentType==='receipt')return createReceiptPdf(data);
 if(data?.documentType!=='payment_record')throw new TypeError('Tipo de documento inválido: use receipt ou payment_record.');
 const p=new PDF();
 p.header('Registro de pagamento','DECLARAÇÃO PARA CONTROLE · NÃO É COMPROVANTE BANCÁRIO');
 p.labelValue('Pagador informado',data.payer||'A preencher');
 p.labelValue('Recebedor informado',data.payee||'A preencher');
 p.labelValue('Valor informado',money(data.cents));
 p.labelValue('Data informada',date(data.date));
 p.labelValue('Motivo',data.title||data.motivo||'A preencher');
 const method=data.methodLabel||data.paymentMethod;
 if(method)p.labelValue('Forma de pagamento informada',method);
 if(data.note)p.labelValue('Observação',data.note);
 p.ensure(170);p.y+=10;
 p.line(46,p.y+34,385,p.y+34,colors.muted);
 p.text('Assinatura do recebedor',46,p.y+52,10,false,colors.muted);
 p.y+=88;
 p.paragraph(copy('Declaração gerada localmente com os dados informados, sem consulta ou validação bancária. Não é documento fiscal nem comprovante bancário e não valida pagamento ou quitação. A assinatura do recebedor deve ser colhida fora desta demonstração; nenhuma assinatura eletrônica foi capturada ou validada.'),{size:9,color:colors.muted,width:97,lineHeight:14});
 return p.finish();
}
export function createReportPdf(data){const p=new PDF();p.header('Relatório financeiro',`${date(data.from)} a ${date(data.to)} · ${data.accountName||'Todas as contas manuais'}`);p.paragraph(copy('Valores baseados somente nos registros de demonstração. Nenhum saldo foi consultado em banco.'),{size:10,color:colors.muted,width:92});p.y+=8;const summary=data.summary||{};for(const [label,value] of [['Entradas realizadas',summary.income],['Saídas realizadas',summary.expense],['Resultado do período',(summary.income||0)-(summary.expense||0)],['A pagar em aberto',summary.payableCents],['A receber em aberto',summary.receivableCents]]){p.text(label,46,p.y,11);p.text(money(value),400,p.y,12,true);p.y+=25;}p.y+=18;if(summary.categories?.length){p.ensure(50);p.text('SAÍDAS POR CATEGORIA',46,p.y,10,true,colors.green);p.y+=24;for(const c of summary.categories){p.ensure(25);p.text(String(c.category).slice(0,55),46,p.y,10);p.text(money(c.expense),420,p.y,10,true);p.y+=23;}p.y+=17;}p.ensure(45);p.text('LANÇAMENTOS DO PERÍODO',46,p.y,10,true,colors.green);p.y+=23;
 for(const r of data.records||[]){const lines=wrap(r.title||'',87,10);const height=Math.max(61,lines.length*14+40);p.ensure(height);p.rect(46,p.y-12,503,20,colors.cream);p.text(`${date(r.date)} · ${r.type==='income'?'Entrada':r.type==='transfer'?'Transferência interna':'Saída'} · ${r.status==='estimated'?'previsão':'realizado'}`,54,p.y+1,9,true);p.y+=24;for(const line of lines){p.text(line,54,p.y,10);p.y+=14;}const metadata=wrap(`${r.accountName||'Sem conta definida'} · ${r.methodLabel||r.paymentMethod||'Não informado'} · ${r.category||'Outros'}`,78,8);p.text(money(r.cents),435,p.y+3,10,true);for(const line of metadata){p.ensure(13);p.text(line,54,p.y+3,8,false,colors.muted);p.y+=12;}p.y+=18;}
 if(!(data.records||[]).length)p.paragraph('Nenhum lançamento neste filtro.',{size:11});p.ensure(75);p.y+=10;p.paragraph('Transferências entre contas próprias não entram nas receitas e despesas consolidadas. Saldos iniciais são tratados separadamente. Cartões, faturas e parcelas ainda não são suportados nesta versão.',{size:9,color:colors.muted,width:97,lineHeight:14});return p.finish();}
