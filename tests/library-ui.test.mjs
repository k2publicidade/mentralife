import test from 'node:test';
import assert from 'node:assert/strict';
import {createLibraryUI} from '../dist/library-ui.mjs';
function fixture(persist=true){
 let state={documents:[{id:'a',title:'<script>contrato</script>',context:'personal',category:'Casa',fileData:'QQ==',sha256:'original',trashed:true},{id:'b',title:'Documento Empresa',context:'business',category:'Trabalho',note:'Localizável',trashed:false}],records:[{id:'finance',cents:1000}]},dialog='',saves=0;
 const error={textContent:'',focus(){}},elements=new Map();globalThis.document={querySelector:selector=>elements.get(selector)||error};globalThis.FormData=class{constructor(form){this.form=form;}[Symbol.iterator](){return Object.entries(this.form.values)[Symbol.iterator]();}};
 let ui;ui=createLibraryUI({getState:()=>state,setState:value=>{state=value;},save:()=>{saves++;return persist;},toast:message=>{error.textContent=message;},render(){},modal:(title,body)=>{dialog=title+body;},closeModal:()=>{ui.cancelPending();dialog='';},openDocument:()=>false});
 return {ui,error,elements,state:()=>state,setState:value=>{state=value;},dialog:()=>dialog,saves:()=>saves,click:(action,id)=>ui.handleClick('library-'+action,{id}),submit:(id,values,documentId)=>ui.handleSubmit({id,values,dataset:{id:documentId},checkValidity:()=>true})};
}
test('exclusão definitiva é vinculada ao documento e cancelamento invalida confirmação antiga',()=>{
 const f=fixture();f.click('confirm-purge','a');assert.equal(f.state().documents.length,2);f.click('request-purge','a');assert.match(f.dialog(),/&lt;script&gt;/);assert.doesNotMatch(f.dialog(),/<script>contrato/);
 f.ui.cancelPending();f.click('confirm-purge','a');assert.equal(f.saves(),0);f.click('request-purge','a');f.click('confirm-purge','b');assert.equal(f.saves(),0);f.click('confirm-purge','a');assert.equal(f.state().documents.length,1);assert.equal(f.state().documents[0].id,'b');assert.equal(f.saves(),1);assert.equal(f.state().records[0].cents,1000);
});
test('falha de persistência preserva documento e texto em vez de afirmar exclusão',()=>{
 const f=fixture(false);f.click('request-purge','a');f.click('confirm-purge','a');assert.equal(f.state().documents.length,2);assert.equal(f.state().documents[0].fileData,'QQ==');assert.match(f.error.textContent,/anteriores foram mantidos/);
});
test('revisão cancelada não altera texto e mudança no original invalida revisão pendente',()=>{
 const f=fixture();f.click('text','b');f.ui.cancelPending();f.submit('library-text-form',{text:'Não salvar'},'b');assert.equal(f.state().documents[1].extractedText,undefined);
 f.click('text','b');f.setState({...f.state(),documents:f.state().documents.map(d=>d.id==='b'?{...d,fileData:'Tk9WTw=='}:d)});f.submit('library-text-form',{text:'Não corresponde'},'b');assert.equal(f.state().documents[1].extractedText,undefined);assert.match(f.error.textContent,/arquivo mudou/);
});
test('biblioteca e formulário escapam dados e texto só entra na busca após confirmação',()=>{
 const f=fixture();f.click('restore','a');let html=f.ui.renderPage();assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>contrato/);f.click('text','b');f.submit('library-text-form',{text:'Contrato número 9999'},'b');assert.equal(f.state().documents[1].extractedText,'Contrato número 9999');assert.match(f.ui.renderPage(),/Texto pesquisável revisado/);
});
