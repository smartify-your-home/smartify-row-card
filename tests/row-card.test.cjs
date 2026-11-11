const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const file=path.join(__dirname,'../custom_components/smartify_energy_row_card/frontend/smartify-energy-row-card.js');
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
  console,URL,Event:class {},requestAnimationFrame(){},
});
vm.runInContext(src+`
  globalThis.testApi={slotEntityIds,finitePower,resolveFlowSlots,flowMeasurements,slotPower,displayPower,loadFlowConfig,mergeSlots,isVisible,esc,slotAccent,safeAccent,getBackground,isConsumerSlot,isVisibleWithThreshold,formatPower,parseShowUnit,normalizeStore,resolveCardConfig,applySlotOverrides,slotDiff,slotGradient,getBar,slotStyleVars,DEFAULT_SLOTS,DEFAULT_SETTINGS,SETTING_FIELDS};`,context);
const api=context.testApi;
function hass(states={},entities={}){return {states:Object.fromEntries(Object.entries(states).map(([id,tuple])=>[id,{state:String(tuple[0]),attributes:{unit_of_measurement:tuple[1]||'W'}}])),entities,labels:{}};}

test('no embedded secret or legacy Lovelace storage namespace',()=>{
 assert.doesNotMatch(src,/eyJhbGciOiJIUzI1Ni/);
 assert.match(src,/smartify_energy_row_card\/get/);
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
 assert.ok(registry.has('smartify-energy-row-card'));assert.ok(registry.has('smartify-energy-row-card-editor'));
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

test('separate import/export meters retain distinct directions',()=>{
  const h=hass({'sensor.pv':[2200,'W'],'sensor.import':[150,'W'],'sensor.export':[350,'W']});
  const slots=api.resolveFlowSlots(h,{solar:{power:'sensor.pv'},grid:{mode:'separate',import_power:'sensor.import',export_power:'sensor.export'}});
  const m=api.flowMeasurements(h,slots);
  assert.equal(m.imp,150);
  assert.equal(m.exp,350);
  assert.equal(api.slotPower(h,slots.find(x=>x.mode==='flow_grid'),m),-200);
  assert.equal(m.home,2000);
});
test('battery discharge (+) and charge (-) with invert override',()=>{
  const h=hass({'sensor.pv':[2000,'W'],'sensor.grid':[0,'W'],'sensor.battery':[-1000,'W']});
  const normal=api.resolveFlowSlots(h,{solar:{power:'sensor.pv'},grid:{mode:'saldo',saldo_power:'sensor.grid'},battery:{power:'sensor.battery'}});
  const inverted=api.resolveFlowSlots(h,{solar:{power:'sensor.pv'},grid:{mode:'saldo',saldo_power:'sensor.grid'},battery:{power:'sensor.battery',invert:true}});
  const a=api.flowMeasurements(h,normal), b=api.flowMeasurements(h,inverted);
  assert.equal(a.battery,-1000);
  assert.equal(a.home,1000);
  assert.equal(b.battery,1000);
  assert.equal(b.home,3000);
});
test('missing grid meter prevents invented house consumption',()=>{
  const h=hass({'sensor.pv':[2500,'W']});
  const slots=api.resolveFlowSlots(h,{solar:{power:'sensor.pv'},grid:{mode:'saldo',saldo_power:'sensor.grid'}});
  assert.equal(api.flowMeasurements(h,slots).home,null);
});
test('kW and MW inputs convert to watt and invalid non-finite values are missing',()=>{
  const h=hass({'sensor.kw':[1.5,'kW'],'sensor.mw':[0.002,'MW'],'sensor.inf':['Infinity','W']});
  assert.equal(api.finitePower(h,'sensor.kw'),1500);
  assert.equal(api.finitePower(h,'sensor.mw'),2000);
  assert.equal(api.finitePower(h,'sensor.inf'),null);
});
test('UI offers all data sources, transparency, font sizes and theme handling',()=>{
  for(const term of ['Mit Flow Card verknüpfen','Einmalig aus Flow Card importieren','Eigenständig konfigurieren','background_transparency','font_size_value','font_size_name','--primary-text-color','--secondary-text-color']){
    assert.ok(src.includes(term),term);
  }
  assert.match(src,/slot:before/);
  assert.doesNotMatch(src,/haCard\.style\.setProperty\("background"/);
});

test('Flow Card on second dashboard view inside Sections is found',async()=>{
  let sent;
  const h={connection:{sendMessagePromise:async q=>{
    sent=q;
    return {views:[
      {title:'Übersicht',path:'home',sections:[{cards:[{type:'entities'}]}]},
      {title:'SFC',path:'s-f-c',sections:[{type:'grid',cards:[
        {type:'heading',heading:'Energie'},
        {type:'custom:smartify-flow-card',solar:{power:'sensor.pv'},grid:{mode:'saldo',saldo_power:'sensor.saldo'}}
      ]}]}
    ]};
  }}};
  const flow=await api.loadFlowConfig(h,'dashboard-energiemanager',1);
  assert.equal(sent.url_path,'dashboard-energiemanager');
  assert.equal(flow.solar.power,'sensor.pv');
});

test('Nested horizontal/vertical stack and wrapped cards are found in order',async()=>{
  const h={connection:{sendMessagePromise:async()=>({
    views:[{sections:[{cards:[{type:'vertical-stack',cards:[
      {type:'horizontal-stack',cards:[{type:'custom:smartify-flow-card',title:'First',solar:{},grid:{}}]},
      {type:'custom:mod-card',card:{type:'custom:smartify-flow-card',title:'Second',solar:{},grid:{}}}
    ]}]}]}]
  })}};
  assert.equal((await api.loadFlowConfig(h,'dashboard-energiemanager',2)).title,'Second');
});

test('No match in Sections yields a contextual dashboard-path error',async()=>{
  const h={connection:{sendMessagePromise:async()=>({views:[{sections:[{cards:[{type:'entities'}]}]}]})}};
  await assert.rejects(()=>api.loadFlowConfig(h,'dashboard-energiemanager',1),/dashboard-energiemanager/);
});

test('Full dashboard URL scopes search to second view, rather than all views',async()=>{
 let payload;
 const h={connection:{sendMessagePromise:async p=>{
  payload=p;
  return {views:[
   {path:'overview',cards:[{type:'custom:smartify-flow-card',title:'Overview',solar:{},grid:{}}]},
   {path:'s-f-c',sections:[{cards:[{type:'custom:smartify-flow-card',title:'SFC',solar:{power:'sensor.pv'},grid:{}}]}]}
  ]};
 }}};
 const cfg=await api.loadFlowConfig(h,'https://example.test/dashboard-energiemanager/s-f-c',1);
 assert.equal(payload.url_path,'dashboard-energiemanager');
 assert.equal(cfg.title,'SFC');
});
test('Exact view path /dashboard-energiemanager/s-f-c selects one card',async()=>{
 const h={connection:{sendMessagePromise:async()=>({views:[
  {path:'overview',cards:[{type:'custom:smartify-flow-card',title:'Other',solar:{},grid:{}}]},
  {path:'s-f-c',sections:[{cards:[{type:'custom:smartify-flow-card',title:'Target',solar:{},grid:{}}]}]}
 ]})}};
 assert.equal((await api.loadFlowConfig(h,'/dashboard-energiemanager/s-f-c',1)).title,'Target');
});
test('Websocket errors are surfaced with path and original error code',async()=>{
 const h={connection:{sendMessagePromise:async()=>{throw {code:'not_found',message:'Dashboard missing'};}}};
 await assert.rejects(()=>api.loadFlowConfig(h,'dashboard-energiemanager',1),/not_found.*Dashboard missing/);
});
test('setConfig with existing hass initiates linked dashboard refresh',async()=>{
 const Card=registry.get('smartify-energy-row-card');
 const card=new Card();
 const messages=[];
 card._hass={connection:{sendMessagePromise:async msg=>{
   messages.push(msg);
   if(msg.type==='lovelace/config')return {views:[{cards:[{type:'custom:smartify-flow-card',solar:{power:'sensor.pv'},grid:{}}]}]};
   return {slots:[]};
 }},states:{},entities:{},labels:{}};
 card.setConfig({source_mode:'linked',flow_dashboard:'dashboard-energiemanager',flow_index:1});
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(messages.some(m=>m.type==='lovelace/config'&&m.url_path==='dashboard-energiemanager'));
 assert.ok(card._flowConfig);
});

test('Flow-linked PV/net/battery/consumers retain visible accent markers',()=>{
  const h=hass({'sensor.pv':[3000,'W'],'sensor.grid':[500,'W'],'sensor.batt':[-200,'W'],'sensor.wm':[1500,'W']});
  const slots=api.resolveFlowSlots(h,{solar:{power:'sensor.pv'},grid:{mode:'saldo',saldo_power:'sensor.grid'},battery:{power:'sensor.batt'},
    consumers:{'sensor.wm':{color:'#aabbcc'}}});
  const m=api.flowMeasurements(h,slots);
  assert.equal(api.slotAccent(h,slots.find(s=>s.mode==='pv'),m),'#f5b301');
  assert.equal(api.slotAccent(h,slots.find(s=>s.mode==='flow_grid'),m),'#f97316');
  assert.equal(api.slotAccent(h,slots.find(s=>s.mode==='battery'),m),'#38bdf8');
  assert.equal(api.slotAccent(h,slots.find(s=>s.entity==='sensor.wm'),m),'#aabbcc');
});
test('grid import vs export colors follow direction',()=>{
 const h=hass({'sensor.grid':[-500,'W']});
 const slots=api.resolveFlowSlots(h,{solar:{},grid:{mode:'saldo',saldo_power:'sensor.grid'}});
 const m=api.flowMeasurements(h,slots);
 assert.equal(api.slotAccent(h,slots.find(s=>s.mode==='flow_grid'),m),'#00a896');
});
test('untrusted CSS accent input falls back safely',()=>{
 assert.equal(api.safeAccent('#12abff','#888'),'#12abff');
 assert.equal(api.safeAccent('red; background:url(http://x)','#888'),'#888');
 assert.match(src,/background:var\(--row-bar\)/);
});
test('linked tiles have gradient definitions for optional legacy visual mode',()=>{
 const slots=api.resolveFlowSlots(hass(),{solar:{power:'sensor.pv'},grid:{mode:'saldo',saldo_power:'sensor.saldo'}});
 assert.equal(slots[0].gradient[0],'#ff9900');
 assert.equal(slots.find(s=>s.mode==='flow_grid').gradient_import.length,2);
});

test('global device threshold filters linked consumers, but never PV, home, grid or battery',()=>{
 const h=hass({'sensor.pv':[400,'W'],'sensor.grid':[0,'W'],'sensor.battery':[50,'W'],
  'sensor.washer':[49,'W'],'sensor.dryer':[50,'W'],'sensor.ev':[1300,'W']});
 const slots=api.resolveFlowSlots(h,{solar:{power:'sensor.pv'},grid:{mode:'saldo',saldo_power:'sensor.grid'},
  battery:{power:'sensor.battery'},consumers:{'sensor.washer':{},'sensor.dryer':{},'sensor.ev':{}}});
 const m=api.flowMeasurements(h,slots),cfg={hide_low_power_devices:true,device_display_threshold_w:50};
 for(const id of ['pv','home','grid','battery']) assert.equal(api.isVisibleWithThreshold(h,slots.find(x=>x.id===id),m,cfg),true,id);
 assert.equal(api.isVisibleWithThreshold(h,slots.find(x=>x.entity==='sensor.washer'),m,cfg),false);
 assert.equal(api.isVisibleWithThreshold(h,slots.find(x=>x.entity==='sensor.dryer'),m,cfg),true);
 assert.equal(api.isVisibleWithThreshold(h,slots.find(x=>x.entity==='sensor.ev'),m,cfg),true);
});
test('filter defaults off, allowing low-power devices, and 0 W can be hidden',()=>{
 const h=hass({'sensor.washer':[0,'W'],'sensor.dryer':[12,'W']});
 const washer={id:'sensor.washer',entity:'sensor.washer',hide_below:0};
 assert.equal(api.isVisibleWithThreshold(h,washer,null,{}),true);
 assert.equal(api.isVisibleWithThreshold(h,washer,null,{hide_low_power_devices:false,device_display_threshold_w:100}),true);
 assert.equal(api.isVisibleWithThreshold(h,washer,null,{hide_low_power_devices:true,device_display_threshold_w:1}),false);
 assert.equal(api.isVisibleWithThreshold(h,{id:'sensor.dryer',entity:'sensor.dryer',hide_below:0},null,
 {hide_low_power_devices:true,device_display_threshold_w:10}),true);
});
test('absolute signed power in W/kW and existing slot hide_below still apply',()=>{
 const h=hass({'sensor.charger':[-0.12,'kW'],'sensor.washer':[80,'W']});
 const charger={id:'charger',entity:'sensor.charger',hide_below:0};
 assert.equal(api.isVisibleWithThreshold(h,charger,null,{hide_low_power_devices:true,device_display_threshold_w:100}),true);
 assert.equal(api.isVisibleWithThreshold(h,charger,null,{hide_low_power_devices:true,device_display_threshold_w:130}),false);
 assert.equal(api.isVisibleWithThreshold(h,{id:'sensor.washer',entity:'sensor.washer',hide_below:100},null,
 {hide_low_power_devices:false,device_display_threshold_w:0}),false);
});
test('unavailable device power stays hidden with and without global filter',()=>{
 const h=hass({'sensor.washer':['unavailable','W']});
 const slot={id:'sensor.washer',entity:'sensor.washer'};
 assert.equal(api.isVisibleWithThreshold(h,slot,null,{hide_low_power_devices:true,device_display_threshold_w:50}),false);
 assert.equal(api.isVisibleWithThreshold(h,slot,null,{hide_low_power_devices:false}),false);
});
test('editor exposes configurable display threshold and on-card filtering',()=>{
 const keys=api.SETTING_FIELDS.map(f=>f.key);
 assert.ok(keys.includes('hide_low_power_devices'));
 assert.ok(keys.includes('device_display_threshold_w'));
 assert.ok(src.includes('isVisibleWithThreshold(h,s,measurements,c)'));
});

// ── 2.1.0: Profile, Overrides, Poolpumpe, Darstellung ──────────────────────
const plain=v=>JSON.parse(JSON.stringify(v));
test('default slots include pool pump with level thresholds',()=>{
 const pool=api.DEFAULT_SLOTS.find(s=>s.id==='poolpump');
 assert.equal(pool.mode,'poolpump');assert.equal(pool.threshold_mid,600);assert.equal(pool.threshold_high,1200);
 assert.equal(api.mergeSlots([]).length,7);
});
test('pool pump and heat pump gradients follow thresholds',()=>{
 const pool={...api.DEFAULT_SLOTS.find(s=>s.id==='poolpump'),entity:'sensor.pool'};
 assert.deepEqual(plain(api.slotGradient(hass({'sensor.pool':[500]}),pool)),['#8ED6FF','#4FC3F7']);
 assert.deepEqual(plain(api.slotGradient(hass({'sensor.pool':[885]}),pool)),['#FFF59D','#FF9800']);
 assert.deepEqual(plain(api.slotGradient(hass({'sensor.pool':[1500]}),pool)),['#FFB74D','#D32F2F']);
 assert.equal(api.slotAccent(hass({'sensor.pool':[885]}),pool),'#f59e0b');
 const hp={...api.DEFAULT_SLOTS.find(s=>s.id==='heatpump'),entity:'sensor.hp'};
 assert.deepEqual(plain(api.slotGradient(hass({'sensor.hp':[2144]}),hp)),['#FFB74D','#D32F2F']);
 assert.equal(api.slotAccent(hass({'sensor.hp':[2144]}),hp),'#ef4444');
 assert.deepEqual(plain(api.slotGradient(hass({'sensor.pool':[900]}),{...pool,threshold_mid:1000})),['#8ED6FF','#4FC3F7']);
});
test('value format: auto switches to kW, w keeps integer watt, kw always kW',()=>{
 assert.deepEqual(plain(api.formatPower(980,'auto')),{num:'980',unit:'W'});
 assert.deepEqual(plain(api.formatPower(6240,'auto')),{num:'6.24',unit:'kW'});
 assert.deepEqual(plain(api.formatPower(6240.4,'w')),{num:'6240',unit:'W'});
 assert.deepEqual(plain(api.formatPower(-885,'kw')),{num:'0.89',unit:'kW'});
 assert.deepEqual(plain(api.formatPower(null,'w')),{num:'–',unit:''});
 assert.equal(api.displayPower(1500),'1.50 kW');
});
test('show_unit accepts auto, true and false including legacy booleans',()=>{
 assert.equal(api.parseShowUnit(undefined),'auto');assert.equal(api.parseShowUnit('auto'),'auto');
 assert.equal(api.parseShowUnit(true),true);assert.equal(api.parseShowUnit('false'),false);
});
test('2.0.x shared slots migrate read-only to profile standard',()=>{
 const st=api.normalizeStore({slots:[{id:'pv',entity:'sensor.pv'}]});
 assert.equal(st.profiles.standard.slots[0].entity,'sensor.pv');
 const kept=api.normalizeStore({slots:[{id:'pv',entity:'old'}],profiles:{standard:{settings:{},slots:[{id:'pv',entity:'new'}]}}});
 assert.equal(kept.profiles.standard.slots[0].entity,'new');
 assert.deepEqual(Object.keys(api.normalizeStore({profiles:{'Bad Name':{slots:[]}}}).profiles),[]);
});
test('settings resolve defaults < profile < card, card-only keys stay out',()=>{
 const store={profiles:{standard:{settings:{height:65,icon_size:34,bar_position:'bottom'},slots:[]}}};
 const r=api.resolveCardConfig({type:'custom:smartify-energy-row-card',height:95,grid_options:{rows:'auto'}},store);
 assert.equal(r.name,'standard');assert.equal(r.settings.height,95);assert.equal(r.settings.icon_size,34);
 assert.equal(r.settings.bar_position,'bottom');assert.equal(r.settings.gap,4);
 assert.equal(r.settings.type,undefined);assert.equal(r.settings.grid_options,undefined);
 assert.equal(api.resolveCardConfig({profile:'kompakt'},store).profile,null);
});
test('profile slots apply and card slot overrides only change listed fields',()=>{
 const store={profiles:{standard:{settings:{},slots:[{id:'pv',entity:'sensor.pv'},{id:'poolpump',entity:'sensor.pool'}]}}};
 const r=api.resolveCardConfig({profile:'standard',slots:[{id:'poolpump',hidden:true},{id:'pv',label:'Sonne'}]},store);
 const pool=r.slots.find(s=>s.id==='poolpump'),pv=r.slots.find(s=>s.id==='pv');
 assert.equal(pool.hidden,true);assert.equal(pool.entity,'sensor.pool');assert.equal(pool.mode,'poolpump');
 assert.equal(pv.label,'Sonne');assert.equal(pv.entity,'sensor.pv');
 const h=hass({'sensor.pool':[900]});
 assert.equal(api.isVisible(h,pool),false);assert.equal(api.isVisibleWithThreshold(h,pool,null,{}),false);
});
test('legacy v4 card YAML with full slot list still renders without a profile',()=>{
 const legacy=[{id:'pv',label:'PV',icon:'mdi:solar-power',entity:'sensor.pv',hide_below:0,show_name:false,gradient:['#ff9900','#ffc34d'],color_text:'#fff'}];
 const r=api.resolveCardConfig({height:65,icon_size:34,slots:legacy},{profiles:{}});
 assert.equal(r.slots.find(s=>s.id==='pv').entity,'sensor.pv');assert.equal(r.settings.icon_size,34);
});
test('slot diff stores only changed fields for card overrides',()=>{
 assert.deepEqual(plain(api.slotDiff({id:'pv',label:'PV',hide_below:0},{id:'pv',label:'PV',hide_below:50})),{id:'pv',hide_below:50});
});
test('bar position, radius and border map to theme-overridable CSS (E-Paper)',()=>{
 const v=api.slotStyleVars({bar_position:'bottom',bar_height:4,border_radius:6,slot_border:false});
 assert.equal(v.barHeight,4);
 assert.equal(v.radius,'var(--smartify-energy-row-slot-border-radius,6px)');
 assert.equal(v.shadow,'var(--smartify-energy-row-slot-shadow,none)');
 assert.equal(api.slotStyleVars({bar_position:'none'}).barHeight,0);
 assert.match(api.slotStyleVars({border_radius:null}).radius,/--ha-card-border-radius/);
 for(const v of ['--smartify-energy-row-text-color','--smartify-energy-row-slot-background','--smartify-energy-row-slot-shadow','--smartify-energy-row-slot-border-radius','--smartify-energy-row-overlay-background'])
   assert.ok(src.includes(v),v);
});
test('bar style gradient uses slot colours, accent style uses accent colour',()=>{
 const h=hass({'sensor.pv':[3000]});const pv={id:'pv',entity:'sensor.pv',gradient:['#ff9900','#ffc34d']};
 assert.equal(api.getBar(h,pv,null,'gradient'),'linear-gradient(to right,#ff9900,#ffc34d)');
 assert.equal(api.getBar(h,pv,null,'accent'),'#f5b301');
 assert.equal(api.getBar(h,{id:'x',entity:'sensor.pv',gradient:['red;x','#fff']},null,'gradient'),'#64748b');
});
test('editor offers profile, icon size, unit, radius and bar options',()=>{
 const keys=api.SETTING_FIELDS.map(f=>f.key);
 for(const k of ['icon_size','show_unit','value_format','border_radius','bar_position','bar_style','bar_height','slot_border','text_color'])assert.ok(keys.includes(k),k);
 for(const term of ['smartify_energy_row_card/save_profile','Nur diese Karte','Neues Profil'])assert.ok(src.includes(term),term);
});
test('card renders hidden-slot overrides and selected profile settings',async()=>{
 const Card=registry.get('smartify-energy-row-card');
 const card=new Card();
 const store={profiles:{standard:{settings:{icon_size:34,bar_position:'bottom',value_format:'w'},slots:[{id:'pv',entity:'sensor.pv'},{id:'poolpump',entity:'sensor.pool'}]}}};
 card.setConfig({profile:'standard',slots:[{id:'poolpump',hidden:true}]});
 card.hass={connection:{sendMessagePromise:async()=>store},states:hass({'sensor.pv':[6240],'sensor.pool':[900]}).states,entities:{},labels:{}};
 await new Promise(r=>setImmediate(r));
 const html=card.shadowRoot.innerHTML;
 assert.match(html,/6240/);assert.match(html,/--mdc-icon-size:34px/);assert.match(html,/bar bottom/);
 assert.doesNotMatch(html,/data-id="poolpump"/);
});

// ── 2.1.1: Render nur bei Änderung angezeigter Entitäten, Profil-Retry, Grid-Optionen ──
function countRenders(card){let n=0;const orig=card._render.bind(card);card._render=()=>{n++;return orig();};return ()=>n;}
const tick=()=>new Promise(r=>setTimeout(r,0));
test('slotEntityIds collects every entity a slot depends on without duplicates',()=>{
 assert.deepEqual([...api.slotEntityIds([{id:'a',entity:'sensor.a',entity_secondary:'sensor.b',entity_activity:'switch.c'},{id:'pv',entities:['sensor.a','sensor.d']},null,{id:'x',entity:''}])],
  ['sensor.a','sensor.b','switch.c','sensor.d']);
});
test('hass updates re-render only when a displayed entity changed',async()=>{
 const Card=registry.get('smartify-energy-row-card');const card=new Card();
 const store={slots:[],profiles:{standard:{settings:{},slots:[{id:'pv',entity:'sensor.pv'}]}}};
 const conn={sendMessagePromise:async()=>store};
 const pv={state:'1200',attributes:{unit_of_measurement:'W'}};const other={state:'1',attributes:{}};
 card.setConfig({profile:'standard'});
 card.hass={connection:conn,states:{'sensor.pv':pv,'sensor.other':other},entities:{},labels:{}};
 await tick();
 const renders=countRenders(card);
 card.hass={connection:conn,states:{'sensor.pv':pv,'sensor.other':{state:'2',attributes:{}}},entities:{},labels:{}};
 assert.equal(renders(),0,'unrelated entity must not trigger a render');
 card.hass={connection:conn,states:{'sensor.pv':{state:'850',attributes:{unit_of_measurement:'W'}},'sensor.other':other},entities:{},labels:{}};
 assert.equal(renders(),1);
 assert.match(card.shadowRoot.innerHTML,/850/);
 card.hass={connection:conn,states:{'sensor.other':other},entities:{},labels:{}};
 assert.equal(renders(),2,'removed entity must trigger a render');
 card.setConfig({profile:'standard',height:120});
 assert.equal(renders(),3,'config change always renders');
});
test('linked mode re-renders when the entity or label registry changes',async()=>{
 const Card=registry.get('smartify-energy-row-card');const card=new Card();
 const flow={views:[{cards:[{type:'custom:smartify-flow-card',solar:{power:'sensor.pv'},grid:{mode:'saldo',saldo_power:'sensor.grid'}}]}]};
 const conn={sendMessagePromise:async m=>m.type==='lovelace/config'?flow:{slots:[],profiles:{}}};
 const states=hass({'sensor.pv':[1000],'sensor.grid':[-200]}).states;const entities={},labels={};
 card.setConfig({source_mode:'linked',flow_dashboard:'dashboard-x',flow_index:1});
 card.hass={connection:conn,states,entities,labels};
 await tick();await tick();
 const renders=countRenders(card);
 card.hass={connection:conn,states,entities,labels};
 assert.equal(renders(),0);
 card.hass={connection:conn,states,entities:{},labels};
 assert.equal(renders(),1);
});
test('failed profile load is retried instead of staying on defaults',async()=>{
 const Card=registry.get('smartify-energy-row-card');const card=new Card();
 let fail=true,calls=0;
 const conn={sendMessagePromise:async()=>{calls++;if(fail)throw Error('unknown_command');return {slots:[],profiles:{standard:{settings:{},slots:[{id:'pv',entity:'sensor.pv'}]}}};}};
 const h={connection:conn,states:hass({'sensor.pv':[777]}).states,entities:{},labels:{}};
 const warn=console.warn;console.warn=()=>{};
 try{
  card.setConfig({profile:'standard'});card.hass=h;await tick();
  assert.equal(calls,1);assert.equal(card._store.loaded,false);
  card.hass=h;await tick();
  assert.equal(calls,1,'no retry before the retry delay');
  fail=false;card._loadRetryAt=0;
  card.hass=h;await tick();
  assert.equal(calls,2);assert.equal(card._store.loaded,true);
  assert.match(card.shadowRoot.innerHTML,/777/);
 }finally{console.warn=warn;}
});
test('card exposes grid options for sections dashboards and registers once',()=>{
 const Card=registry.get('smartify-energy-row-card');const card=new Card();
 assert.deepEqual({...card.getGridOptions()},{columns:12,rows:'auto'});
 assert.deepEqual({...card.getLayoutOptions()},{grid_columns:12,grid_rows:'auto'});
 assert.match(src,/window\.customCards\.some\(c => c\.type === "smartify-energy-row-card"\)/);
});
