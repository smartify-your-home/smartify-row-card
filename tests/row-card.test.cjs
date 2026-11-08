const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const file=path.join(__dirname,'../custom_components/smartify_energy_row/frontend/smartify-energy-row.js');
const src=fs.readFileSync(file,'utf8');
const registry=new Map();
class Element {
  constructor(){this.shadowRoot={innerHTML:'',querySelectorAll:()=>[],getElementById:()=>null};this.style={};}
  attachShadow(){return this.shadowRoot;}
}
const context=vm.createContext({
  HTMLElement:Element,
  customElements:{get:k=>registry.get(k),define:(k,v)=>registry.set(k,v)},
  window:{customCards:[],addEventListener(){},removeEventListener(){}},
  console,Event:class {},requestAnimationFrame(){},
});
vm.runInContext(src+`
  globalThis.testApi={finitePower,resolveFlowSlots,flowMeasurements,slotPower,displayPower,loadFlowConfig};`,context);
const api=context.testApi;
function hass(states={},entities={}){return {states:Object.fromEntries(Object.entries(states).map(([id,tuple])=>[id,{state:String(tuple[0]),attributes:{unit_of_measurement:tuple[1]||'W'}}])),entities,labels:{}};}

test('no embedded secret or legacy Lovelace storage namespace',()=>{
 assert.doesNotMatch(src,/eyJhbGciOiJIUzI1Ni/);
 assert.match(src,/smartify_energy_row\/get/);
 assert.doesNotMatch(src,/lovelace\/config\/save/);
});
test('multiple solar plants sum and kW converts to W',()=>{
 const h=hass({'sensor.pv1':[2000,'W'],'sensor.pv2':[1.25,'kW'],'sensor.grid':[-500,'W'],'sensor.battery':[200,'W']});
 const slots=api.resolveFlowSlots(h,{solar:{plants:[{power:'sensor.pv1'},{power:'sensor.pv2'}]},grid:{mode:'saldo',saldo_power:'sensor.grid',positive_import:true},battery:{power:'sensor.battery'}});
 const m=api.flowMeasurements(h,slots);assert.equal(m.pv,3250);assert.equal(m.imp,0);assert.equal(m.exp,500);
});
test('net saldo import/export sign can be inverted',()=>{
 const h=hass({'sensor.grid':[900,'W']});
 const first=api.resolveFlowSlots(h,{solar:{power:''},grid:{mode:'saldo',saldo_power:'sensor.grid',positive_import:true}});
 const second=api.resolveFlowSlots(h,{solar:{power:''},grid:{mode:'saldo',saldo_power:'sensor.grid',positive_import:false}});
 assert.equal(api.flowMeasurements(h,first).imp,900);assert.equal(api.flowMeasurements(h,second).exp,900);
});
test('invalid sensor does not become zero',()=>{
 const h=hass({'sensor.good':[0,'W']});
 assert.equal(api.finitePower(h,'sensor.missing'),null);
 assert.equal(api.finitePower(h,'sensor.good'),0);
 assert.equal(api.displayPower(null),'–');
});
test('flow source reads stored Lovelace config, not mounted UI',async()=>{
 const h={connection:{sendMessagePromise:async q=>{assert.equal(q.type,'lovelace/config');return {views:[{cards:[{type:'custom:smartify-flow-card',solar:{},grid:{}},{type:'custom:smartify-flow-card',solar:{},grid:{}}]}]};}}};
 const card=await api.loadFlowConfig(h,'lovelace',2);assert.equal(card.type,'custom:smartify-flow-card');
});
test('registers standalone custom card and editor',()=>{
 assert.ok(registry.has('smartify-energy-row'));assert.ok(registry.has('smartify-energy-row-editor'));
});
