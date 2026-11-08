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
  globalThis.testApi={finitePower,resolveFlowSlots,flowMeasurements,slotPower,displayPower,loadFlowConfig,mergeSlots,isVisible,esc};`,context);
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

test('imported slots survive saved reload instead of being truncated to six defaults',()=>{
  const data=[{id:'pv',entities:['sensor.pv1'],mode:'pv'},{id:'sensor.washer',entity:'sensor.washer',label:'Waschmaschine'},{id:'sensor.dryer',entity:'sensor.dryer',label:'Trockner'}];
  const loaded=api.mergeSlots(data);
  assert.equal(loaded.length,3);
  assert.ok(loaded.some(x=>x.entity==='sensor.washer'));
  assert.ok(loaded.some(x=>x.entity==='sensor.dryer'));
});
test('unknown and unavailable power sensors never show as zero or visible',()=>{
  const h=hass({'sensor.bad':['unavailable','W'],'sensor.good':[0,'W']});
  const no={id:'x',entity:'sensor.bad',hide_below:0};
  assert.equal(api.finitePower(h,'sensor.bad'),null);
  assert.equal(api.isVisible(h,no),false);
  assert.equal(api.isVisible(h,{id:'y',entity:'sensor.good',hide_below:0}),true);
});
test('missing one PV plant does not fabricate a partial total',()=>{
  const h=hass({'sensor.pv1':[1500,'W']});
  const slots=api.resolveFlowSlots(h,{solar:{plants:[{power:'sensor.pv1'},{power:'sensor.pv2'}]},grid:{mode:'saldo',saldo_power:'sensor.no_grid',positive_import:true}});
  assert.equal(api.flowMeasurements(h,slots).pv,null);
});
test('explicit consumer config and label discovery deduplicate and honour exclusions',()=>{
  const h=hass({'sensor.wm':[1700,'W'],'sensor.gs':[1800,'W']},{
    'sensor.wm':{entity_id:'sensor.wm',labels:['verbraucher']},
    'sensor.gs':{entity_id:'sensor.gs',labels:['verbraucher']}
  });
  const slots=api.resolveFlowSlots(h,{solar:{power:''},grid:{},label:'verbraucher',consumers:{'sensor.wm':{name:'WM'}},excluded_consumers:['sensor.gs']});
  assert.equal(slots.filter(x=>x.id==='sensor.wm').length,1);
  assert.equal(slots.find(x=>x.id==='sensor.wm').label,'WM');
  assert.ok(!slots.some(x=>x.id==='sensor.gs'));
});
test('escaped values cannot inject markup via edited card labels',()=>{
  assert.equal(api.esc('<img src=x onerror="alert(1)">'),'&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('flow dashboard selection and absent flow card are validated',async()=>{
  let query;
  const h={connection:{sendMessagePromise:async q=>(query=q,{views:[{cards:[]}]})}};
  await assert.rejects(()=>api.loadFlowConfig(h,'energy',1),/Keine Smartify Flow Card/);
  assert.equal(query.url_path,'energy');
});
