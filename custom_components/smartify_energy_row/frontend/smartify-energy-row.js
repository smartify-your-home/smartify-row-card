/**
 * smartify-energy-row
 * Lovelace Custom Card — alle Energiewerte in einer Zeile.
 * Config zentral via HA Websocket gespeichert (geräteübergreifend, kein Token nötig).
 * Version: 1.0.0 (standalone integration)
 *
 * Speicherung: HA "lovelace" Storage via Websocket (lovelace/resources sind schreibbar,
 * wir nutzen einen eigenen lovelace-config "strategy" Namespace zum Ablegen von Daten)
 *
 * Installation: /config/www/smartify-energy-row.js
 * Resource:     /local/smartify-energy-row.js  (type: module)
 *
 * YAML (in jedem Dashboard identisch):
 *   type: custom:smartify-energy-row
 */

// Shared settings are stored by our integration, not by undocumented Lovelace namespaces.
async function wsGet(conn) {
  try { return await conn.sendMessagePromise({type:"smartify_energy_row/get"}); }
  catch (e) { console.warn("Smartify Row settings could not be loaded",e); return null; }
}
async function wsSet(conn,data) {
  try { await conn.sendMessagePromise({type:"smartify_energy_row/save",slots:data.slots}); return true; }
  catch (e) { console.error("Smartify Row settings could not be saved",e); return false; }
}
async function loadFlowConfig(hass,dashboard,index) {
  const path=String(dashboard||"lovelace").replace(/^\/+|\/+$/g,"");
  const payload={type:"lovelace/config"};
  if(path&&path!=="lovelace")payload.url_path=path;
  const cfg=await hass.connection.sendMessagePromise(payload);
  const cards=[];
  const visit=(node)=>{
    if(!node||typeof node!=="object")return;
    if(node.type==="custom:smartify-flow-card")cards.push(node);
    for(const key of ["views","cards","elements"])if(Array.isArray(node[key]))node[key].forEach(visit);
    if(node.card)visit(node.card);
  };
  visit(cfg);
  const at=Math.max(0,(Number(index)||1)-1);
  if(!cards.length)throw Error("Keine Smartify Flow Card im ausgewählten Dashboard gefunden");
  if(!cards[at])throw Error("Flow Card Nummer "+(at+1)+" nicht vorhanden ("+cards.length+" gefunden)");
  return cards[at];
}
const finitePower=(hass,id)=>{
  const st=hass?.states?.[id];if(!st)return null;
  const n=Number(st.state);if(!Number.isFinite(n)||!String(st.state).trim())return null;
  const u=String(st.attributes?.unit_of_measurement||"W").toLowerCase();
  return n*(u==="kw"?1000:u==="mw"?1000000:1);
};
function resolveFlowSlots(hass,c) {
  const pv=(Array.isArray(c.solar?.plants)?c.solar.plants: [{power:c.solar?.power,name:c.solar?.name}])
    .map(p=>p?.power).filter(Boolean);
  const grid=c.grid||{},b=c.battery||{};
  const slots=[
    {id:"pv",label:c.solar?.name||"PV",icon:c.solar?.icon||"mdi:solar-power",entities:[...new Set(pv)],mode:"pv",show_name:true,hide_below:0},
    {id:"home",label:"Hausverbrauch",icon:"mdi:home",mode:"home",show_name:true,hide_below:0},
    {id:"grid",label:grid.name||"Netz",icon:"mdi:transmission-tower",mode:"flow_grid",
     entity:grid.saldo_power||grid.import_power||"",entity_secondary:grid.export_power||"",
     grid_mode:grid.mode||(grid.saldo_power?"saldo":"separate"),positive_import:grid.positive_import!==false,
     show_name:true,hide_below:0},
  ];
  if(b.power)slots.push({id:"battery",label:b.name||"Akku",icon:b.icon||"mdi:battery",mode:"battery",entity:b.power,invert:!!b.invert,show_name:true,hide_below:0});
  const explicit=Object.keys(c.consumers||{}).filter(id=>id.startsWith("sensor."));
  const labels=hass?.labels||{};const wanted=String(c.label||"verbraucher").toLowerCase();
  const valid=new Set([wanted]);
  for(const l of Array.isArray(labels)?labels:Object.values(labels))if(String(l.name||"").toLowerCase()===wanted||String(l.label_id||l.id||"").toLowerCase()===wanted){
    valid.add(String(l.label_id||l.id||"").toLowerCase());valid.add(String(l.name||"").toLowerCase());
  }
  const detected=Object.values(hass?.entities||{}).filter(e=>e&&e.entity_id?.startsWith("sensor.")&&!e.hidden&&Array.isArray(e.labels)&&
    e.labels.some(l=>valid.has(String(l).toLowerCase()))).map(e=>e.entity_id).filter(id=>{
      const st=hass.states[id];const unit=String(st?.attributes?.unit_of_measurement||"").toLowerCase();
      return st&&(st.attributes.device_class==="power"||["w","kw","mw"].includes(unit));
    });
  const excluded=new Set(c.excluded_consumers||[]);
  for(const id of new Set([...explicit,...detected])){
    if(excluded.has(id))continue;
    const ov=c.consumers?.[id]||{};
    const friendly=hass?.states?.[id]?.attributes?.friendly_name||id;
    const label=ov.name||friendly.replace(/\s+(Leistung|Power Total|current power|power)$/i,"");
    slots.push({id,entity:id,label,icon:ov.icon||hass?.entities?.[id]?.icon||hass?.states?.[id]?.attributes?.icon||"mdi:power-plug",
      show_name:true,hide_below:0,color_text:ov.color||undefined});
  }
  return slots;
}
function flowMeasurements(hass,slots){
  const pvSlot=slots.find(s=>s.mode==="pv"),g=slots.find(s=>s.mode==="flow_grid"),b=slots.find(s=>s.mode==="battery");
  const vals=(pvSlot?.entities||[]).map(id=>finitePower(hass,id));
  const pv=vals.length&&vals.every(Number.isFinite)?vals.reduce((a,b)=>a+b,0):null;
  let imp=null,exp=null;
  if(g){if(g.grid_mode==="saldo"){const raw=finitePower(hass,g.entity);if(raw!=null){
     const v=raw*(g.positive_import===false?-1:1);imp=Math.max(0,v);exp=Math.max(0,-v);
   }}else{imp=finitePower(hass,g.entity);exp=finitePower(hass,g.entity_secondary);}}
  const battery=b?finitePower(hass,b.entity):0;
  const batterySigned=battery==null?null:b?.invert?-battery:battery;
  // Flow Card: positive battery = discharge, negative = charge, then optional invert.
  const home=[pv,imp,exp,batterySigned].every(Number.isFinite)?Math.max(0,pv+imp-exp+batterySigned):null;
  return {pv,imp,exp,battery:batterySigned,home};
}
function slotPower(hass,slot,measure){
  if(slot.mode==="pv")return measure?.pv??null;
  if(slot.mode==="home")return measure?.home??null;
  if(slot.mode==="flow_grid")return measure?.imp!=null&&measure?.exp!=null?measure.imp-measure.exp:null;
  if(slot.mode==="battery")return measure?.battery??null;
  if(slot.mode==="grid"){
    const a=finitePower(hass,slot.entity),b=finitePower(hass,slot.entity_secondary);
    return a==null&&b==null?null:(a||0)-(b||0);
  }
  return finitePower(hass,slot.entity);
}
const displayPower=(w)=>w==null?"–":(Math.abs(w)>=1000?(Math.abs(w)/1000).toFixed(2)+" kW":Math.round(Math.abs(w))+" W");
const esc=(v)=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
// ── Default Slots ────────────────────────────────────────────────────────────

const DEFAULT_SLOTS = [
  {
    id: "pv", label: "PV", icon: "mdi:solar-power",
    entity: "", hide_below: 0, show_name: true,
    gradient: ["#ff9900", "#ffc34d"], color_text: "#333",
  },
  {
    id: "home", label: "Home", icon: "mdi:home",
    entity: "", hide_below: 0, show_name: true,
    gradient: ["#555", "#111"], color_text: "#fff",
  },
  {
    id: "grid", label: "Netz", icon: "mdi:transmission-tower-export",
    entity: "", entity_secondary: "", hide_below: 0, show_name: true,
    gradient_import: ["#FFB74D", "#E65100"],
    gradient_export: ["#81C784", "#00ACC1"],
    color_text: "#fff", mode: "grid",
  },
  {
    id: "ohmpilot", label: "Ohmpilot", icon: "mdi:water-boiler",
    entity: "", hide_below: 10, show_name: true,
    gradient: ["#4FC3F7", "#0288D1"], color_text: "#fff",
  },
  {
    id: "charger", label: "Lader", icon: "mdi:car-electric",
    entity: "", hide_below: 10, show_name: true,
    gradient: ["#80DEEA", "#00ACC1"], color_text: "#333",
  },
  {
    id: "heatpump", label: "Wärmepumpe", icon: "mdi:heat-pump",
    entity: "", entity_activity: "", hide_below: 30, show_name: true,
    gradient_low:  ["#8ED6FF", "#4FC3F7"],
    gradient_mid:  ["#FFF59D", "#FF9800"],
    gradient_high: ["#FFB74D", "#D32F2F"],
    color_text: "#fff", mode: "heatpump",
  },
];

function mergeSlots(saved) {
  return DEFAULT_SLOTS.map(def => {
    const found = (saved || []).find(s => s.id === def.id);
    return found ? { ...def, ...found } : { ...def };
  });
}

// ── Value / Display Helpers ──────────────────────────────────────────────────

function getValue(hass, slot) {
  return finitePower(hass,slot.entity);
}

function getDisplayValue(hass, slot, measure) {
  if (["pv","home","flow_grid","battery"].includes(slot.mode)) {
    const raw=slotPower(hass,slot,measure);
    const dir=slot.mode==="flow_grid"&&raw!=null?(raw>0?"Bezug":raw<0?"Einspeisung":"Netz 0"):"";
    return displayPower(raw)+(dir?" · "+dir:"");
  }
  if (slot.mode === "grid") {
    const b = parseFloat(hass?.states[slot.entity]?.state) || 0;
    const e = parseFloat(hass?.states[slot.entity_secondary]?.state) || 0;
    return `${Math.round(b || e)} W`;
  }
  const v = getValue(hass, slot);
  const u = hass?.states[slot.entity]?.attributes?.unit_of_measurement || "W";
  return `${Math.round(v * 10) / 10} ${u}`;
}

function getBackground(hass, slot, measure) {
  if(slot.mode==="flow_grid"){
    const w=slotPower(hass,slot,measure);
    const grad=w!=null&&w>0?slot.gradient_import:w!=null&&w<0?slot.gradient_export:null;
    return grad?.length===2?`linear-gradient(135deg,${grad.join(",")})`:"var(--ha-card-background,var(--card-background-color))";
  }
  if (slot.mode === "grid") {
    const b = parseFloat(hass?.states[slot.entity]?.state) || 0;
    const e = parseFloat(hass?.states[slot.entity_secondary]?.state) || 0;
    if (b > 0) return `linear-gradient(135deg,${(slot.gradient_import || ["#FFB74D","#E65100"]).join(",")})`;
    if (e > 0) return `linear-gradient(135deg,${(slot.gradient_export || ["#81C784","#00ACC1"]).join(",")})`;
    return "var(--card-background-color)";
  }
  if (slot.mode === "heatpump") {
    const v = getValue(hass, slot);
    const g = v > 2000 ? slot.gradient_high : v > 1000 ? slot.gradient_mid : slot.gradient_low;
    return `linear-gradient(135deg,${(g || ["#8ED6FF","#4FC3F7"]).join(",")})`;
  }
  if (slot.gradient?.length >= 2) return `linear-gradient(135deg,${slot.gradient.join(",")})`;
  return "var(--card-background-color)";
}

function isVisible(hass, slot, measure) {
  if(["pv","home","flow_grid","battery"].includes(slot.mode)) {
    const w=slotPower(hass,slot,measure);
    return w!=null&&Math.abs(w)>=(slot.hide_below||0);
  }
  if (slot.mode === "grid") {
    if (!slot.entity && !slot.entity_secondary) return false;
    const b = parseFloat(hass?.states[slot.entity]?.state) || 0;
    const e = parseFloat(hass?.states[slot.entity_secondary]?.state) || 0;
    return (b + e) >= (slot.hide_below || 0);
  }
  if (!slot.entity) return false;
  return getValue(hass, slot) >= (slot.hide_below || 0);
}

function getBoilerOverlay(hass, slot) {
  if (slot.mode !== "heatpump" || !slot.entity_activity) return "";
  const act = hass?.states[slot.entity_activity]?.state;
  if (act === "defrost") return `
    <div class="overlay">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 24" width="13" height="26">
        <path fill="#60b4ff" d="M8 17.85C8 19.04 7.11 20 6 20S4 19.04 4 17.85C4 16.42 6 14 6 14S8 16.42 8 17.85M16.46 12V10.56L18.46 9.43L20.79 10.05L21.31 8.12L19.54 7.65L20 5.88L18.07 5.36L17.45 7.69L15.45 8.82L13 7.38V5.12L14.71 3.41L13.29 2L12 3.29L10.71 2L9.29 3.41L11 5.12V7.38L8.5 8.82L6.5 7.69L5.92 5.36L4 5.88L4.47 7.65L2.7 8.12L3.22 10.05L5.55 9.43L7.55 10.56V12H2V13H22V12H16.46M9.5 12V10.56L12 9.11L14.5 10.56V12H9.5M20 17.85C20 19.04 19.11 20 18 20S16 19.04 16 17.85C16 16.42 18 14 18 14S20 16.42 20 17.85M14 20.85C14 22.04 13.11 23 12 23S10 22.04 10 20.85C10 19.42 12 17 12 17S14 19.42 14 20.85Z"/>
      </svg>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="12 0 12 24" width="13" height="26">
        <path fill="white" d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3M19 19H5V5H19V19M12 18C15.31 18 18 15.31 18 12S15.31 6 12 6 6 8.69 6 12 8.69 18 12 18M11.25 15.92C10.7 15.82 10.2 15.6 9.75 15.3L11.25 13.8V15.92M12.75 15.92V13.81L14.25 15.31C13.8 15.61 13.3 15.82 12.75 15.92M15.31 14.25L13.81 12.75H15.92C15.82 13.3 15.61 13.8 15.31 14.25M15.92 11.25H13.81L15.31 9.75C15.61 10.2 15.82 10.7 15.92 11.25M12.75 8.08C13.3 8.18 13.8 8.4 14.25 8.7L12.75 10.2V8.08M12 11C12.55 11 13 11.45 13 12S12.55 13 12 13 11 12.55 11 12 11.45 11 12 11M11.25 8.08V10.19L9.75 8.69C10.2 8.39 10.7 8.18 11.25 8.08M8.69 9.75L10.19 11.25H8.08C8.18 10.7 8.39 10.2 8.69 9.75M10.19 12.75L8.69 14.25C8.39 13.81 8.18 13.3 8.07 12.75H10.19Z"/>
      </svg>
    </div>`;
  if (act === "hot_water") return `
    <div class="overlay">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 24" width="13" height="26">
        <path fill="#ef4444" d="M12,20A6,6 0 0,1 6,14C6,10 12,3.25 12,3.25C12,3.25 18,10 18,14A6,6 0 0,1 12,20Z"/>
      </svg>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="12 0 12 24" width="13" height="26">
        <path fill="white" d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3M19 19H5V5H19V19M12 18C15.31 18 18 15.31 18 12S15.31 6 12 6 6 8.69 6 12 8.69 18 12 18M11.25 15.92C10.7 15.82 10.2 15.6 9.75 15.3L11.25 13.8V15.92M12.75 15.92V13.81L14.25 15.31C13.8 15.61 13.3 15.82 12.75 15.92M15.31 14.25L13.81 12.75H15.92C15.82 13.3 15.61 13.8 15.31 14.25M15.92 11.25H13.81L15.31 9.75C15.61 10.2 15.82 10.7 15.92 11.25M12.75 8.08C13.3 8.18 13.8 8.4 14.25 8.7L12.75 10.2V8.08M12 11C12.55 11 13 11.45 13 12S12.55 13 12 13 11 12.55 11 12 11.45 11 12 11M11.25 8.08V10.19L9.75 8.69C10.2 8.39 10.7 8.18 11.25 8.08M8.69 9.75L10.19 11.25H8.08C8.18 10.7 8.39 10.2 8.69 9.75M10.19 12.75L8.69 14.25C8.39 13.81 8.18 13.3 8.07 12.75H10.19Z"/>
      </svg>
    </div>`;
  return "";
}

// ── Shared CSS ───────────────────────────────────────────────────────────────

const EDITOR_CSS = `
  :host { display:block; font-family:var(--primary-font-family,sans-serif); color:var(--primary-text-color); }
  .section { font-size:11px; font-weight:600; letter-spacing:.08em; text-transform:uppercase;
    color:var(--secondary-text-color); border-bottom:1px solid var(--divider-color);
    padding-bottom:4px; margin:14px 0 8px; }
  label { font-size:12px; color:var(--secondary-text-color); display:block; margin:6px 0 2px; }
  input[type=text], input[type=number] {
    width:100%; box-sizing:border-box;
    background:var(--card-background-color); color:var(--primary-text-color);
    border:1px solid var(--divider-color); border-radius:4px; padding:6px 8px; font-size:13px;
  }
  .row { display:flex; gap:8px; align-items:center; margin:6px 0; }
  input[type=checkbox] { width:16px; height:16px; cursor:pointer; flex-shrink:0; }
  .slot-list { display:flex; flex-direction:column; gap:6px; }
  .slot-row { display:flex; align-items:center; gap:8px; padding:8px;
    background:var(--secondary-background-color); border-radius:6px; }
  .slot-label { flex:1; font-size:13px; font-weight:500; }
  .slot-entity { flex:2; font-size:11px; color:var(--secondary-text-color);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .btn { padding:4px 10px; border-radius:4px; border:1px solid var(--divider-color);
    background:var(--card-background-color); color:var(--primary-text-color); cursor:pointer; font-size:12px; }
  .btn:hover { background:var(--primary-color); color:white; }
  .slot-editor { background:var(--secondary-background-color); border-radius:8px; padding:12px; margin-top:8px; }
  .slot-editor-title { font-weight:600; margin-bottom:10px; font-size:14px; }
  .btn-row { display:flex; gap:8px; margin-top:12px; }
  .btn-save { padding:6px 14px; border-radius:4px; border:none;
    background:var(--primary-color); color:white; cursor:pointer; font-size:13px; }
  .btn-cancel { padding:6px 14px; border-radius:4px; border:1px solid var(--divider-color);
    background:transparent; color:var(--primary-text-color); cursor:pointer; font-size:13px; }
  .save-all { width:100%; padding:9px; margin-top:12px; border-radius:6px; border:none;
    background:var(--primary-color); color:white; cursor:pointer; font-size:13px; font-weight:600; }
  .save-all:disabled { opacity:.5; cursor:default; }
  .status { font-size:12px; margin-top:6px; text-align:center; min-height:18px; }
  .hint { font-size:11px; color:var(--secondary-text-color); margin-top:3px; margin-bottom:6px; }
  .color-row { display:flex; gap:6px; align-items:center; }
  .color-row input[type=color] { width:42px; height:32px; padding:2px; border-radius:4px;
    border:1px solid var(--divider-color); flex-shrink:0; }
  .color-row input[type=text] { flex:1; }
`;

// ── Editor ───────────────────────────────────────────────────────────────────

class SmartifyEnergyRowEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._cardConfig  = {};
    this._hass        = null;
    this._slots       = mergeSlots([]);
    this._editingSlot = null;
    this._status      = "";
    this._loading     = false;
  }

  set hass(h) {
    this._hass = h;
    if (!this._loaded && h?.connection) {
      this._loaded = true;
      this._loadFromHA();
    }
  }

  setConfig(config) {
    this._cardConfig = { ...config };
    this._flowCache = null;
    this._render();
  }

  async _loadFromHA() {
    this._loading = true;
    this._render();
    const data = await wsGet(this._hass.connection);
    if (data?.slots) this._slots = mergeSlots(data.slots);
    this._loading = false;
    this._render();
  }

  async _saveToHA() {
    if (!this._hass?.connection) {
      this._status = "❌ Keine HA-Verbindung";
      this._render();
      return;
    }
    this._status = "⏳ Speichern...";
    this._render();
    const ok = await wsSet(this._hass.connection, { slots: this._slots });
    this._status = ok ? "✅ Gespeichert" : "❌ Fehler beim Speichern";
    if (ok) {
      window.dispatchEvent(new CustomEvent("smartify-energy-row-reload", {
        detail: { slots: this._slots }
      }));
    }
    this._render();
  }

  _dispatchCard(cfg) {
    this._cardConfig = cfg;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: cfg }, bubbles: true, composed: true,
    }));
  }

  _entityList() {
    if (!this._hass) return [];
    return Object.keys(this._hass.states).sort();
  }

  _datalist(id) {
    return `<datalist id="${id}">${this._entityList().map(e => `<option value="${e}">`).join("")}</datalist>`;
  }

  _renderSlotEditor(slot) {
    const isGrid = slot.mode === "grid";
    const isHP   = slot.mode === "heatpump";
    return `
      <div class="slot-editor">
        <div class="slot-editor-title">✏️ ${slot.label}</div>

        <label>Label</label>
        <input type="text" data-field="label" value="${slot.label || ""}">

        <label>Icon (MDI, z.B. mdi:solar-power)</label>
        <input type="text" data-field="icon" value="${slot.icon || ""}">

        ${isGrid ? `
          <label>Entity Netzbezug</label>
          ${this._datalist("sl-e1")}
          <input list="sl-e1" type="text" data-field="entity" value="${slot.entity || ""}">
          <label>Entity Netzeinspeisung</label>
          ${this._datalist("sl-e2")}
          <input list="sl-e2" type="text" data-field="entity_secondary" value="${slot.entity_secondary || ""}">
        ` : `
          <label>Entity${isHP ? " Leistung" : ""}</label>
          ${this._datalist("sl-e1")}
          <input list="sl-e1" type="text" data-field="entity" value="${slot.entity || ""}">
        `}

        ${isHP ? `
          <label>Entity Aktivität (defrost / hot_water)</label>
          ${this._datalist("sl-act")}
          <input list="sl-act" type="text" data-field="entity_activity" value="${slot.entity_activity || ""}">
        ` : ""}

        <label>Ausblenden unterhalb (W)</label>
        <input type="number" data-field="hide_below" value="${slot.hide_below ?? 0}">

        <div class="row">
          <input type="checkbox" data-field="show_name" id="sn_${slot.id}" ${slot.show_name ? "checked" : ""}>
          <label for="sn_${slot.id}" style="margin:0;font-size:13px">Name anzeigen</label>
        </div>

        <label>Textfarbe</label>
        <div class="color-row">
          <input type="color" id="color_pick" value="${slot.color_text || "#ffffff"}">
          <input type="text"  data-field="color_text" value="${slot.color_text || ""}">
        </div>

        <div class="btn-row">
          <button class="btn-save">💾 Übernehmen</button>
          <button class="btn-cancel">Abbrechen</button>
        </div>
      </div>`;
  }

  _render() {
    const c    = this._cardConfig;
    const slot = this._editingSlot ? this._slots.find(s => s.id === this._editingSlot) : null;

    this.shadowRoot.innerHTML = `
      <style>${EDITOR_CSS}</style>

      <div class="section">Datenquelle</div>
      <label>Entitäten</label>
      <select id="source_mode" style="width:100%;padding:8px;background:var(--card-background-color);color:var(--primary-text-color)">
       <option value="manual" ${(c.source_mode||"manual")==="manual"?"selected":""}>Eigenständig konfigurieren</option>
       <option value="linked" ${c.source_mode==="linked"?"selected":""}>Mit Flow Card verknüpfen</option>
       <option value="import" ${c.source_mode==="import"?"selected":""}>Einmalig aus Flow Card importieren</option>
      </select>
      ${c.source_mode==="linked"||c.source_mode==="import"?`
      <label>Dashboard-Pfad (Standard: lovelace)</label><input type="text" id="flow_dashboard" value="${esc(c.flow_dashboard||"lovelace")}">
      <label>Flow Card Nummer im Dashboard (beginnend bei 1)</label><input type="number" id="flow_index" min="1" value="${c.flow_index||1}">
      ${c.source_mode==="import"?'<button class="btn" id="flow_import">Jetzt aus Flow Card übernehmen</button>':""}
      <div class="hint">Flow Card muss in einem gespeicherten Lovelace-Dashboard liegen. Die Verknüpfung übernimmt Entitäten, Namen und Icons; Reihenfolge/Design dieser Karte bleiben separat.</div>
      `:''}
      <div class="section">Anzeige (diese Card)</div>
      <label>Höhe (px)</label>
      <input type="number" id="height" value="${c.height ?? 90}">
      <label>Abstand zwischen Slots (px)</label>
      <input type="number" id="gap" value="${c.gap ?? 4}">
      <label>Schriftgröße Wert</label>
      <input type="number" id="font_size_value" value="${c.font_size_value ?? 20}">
      <label>Schriftgröße Name</label>
      <input type="number" id="font_size_name" min="8" max="38" value="${c.font_size_name ?? 11}">
      <label>Hintergrundtransparenz (0–100 %)</label>
      <input type="range" min="0" max="100" step="5" id="transparency" value="${c.background_transparency ?? 0}">
      <label>Theme-Stil</label><select id="theme_style"><option value="theme" ${c.theme_style!=="gradient"?"selected":""}>Home Assistant Theme</option><option value="gradient" ${c.theme_style==="gradient"?"selected":""}>Original-Farbverläufe</option></select>
      <label>Zeilenumbruch auf schmalen Bildschirmen</label><input type="checkbox" id="allow_wrap" ${c.allow_wrap!==false?"checked":""}>

      <div class="section">Energie-Slots (manuell/Import, zentral in HA gespeichert)</div>
      <div class="hint">Einmalig konfigurieren — gilt für alle Dashboards und Geräte.</div>

      ${this._loading
        ? `<div class="status">⏳ Lade gespeicherte Config...</div>`
        : slot
          ? this._renderSlotEditor(slot)
          : `
            <div class="slot-list">
              ${this._slots.map(s => `
                <div class="slot-row">
                  <div class="slot-label">${s.label}</div>
                  <div class="slot-entity">${s.entity || s.entity_secondary || "— keine Entity —"}</div>
                  <button class="btn" data-edit="${s.id}">✏️</button>
                </div>`).join("")}
            </div>
            <button class="save-all" id="save-all">💾 In HA speichern</button>
            <div class="status">${this._status}</div>
          `}
    `;

    // Card-level
    const onCard = (id, key, parse) => {
      const el = this.shadowRoot.getElementById(id);
      if (el) el.addEventListener("change", e =>
        this._dispatchCard({ ...this._cardConfig, [key]: parse(e.target.value) })
      );
    };
    onCard("source_mode", "source_mode", v => v);
    onCard("flow_dashboard", "flow_dashboard", v => v.trim()||"lovelace");
    onCard("flow_index", "flow_index", v => Math.max(1,parseInt(v)||1));
    onCard("transparency", "background_transparency", v => Math.max(0,Math.min(100,parseInt(v)||0)));
    onCard("theme_style", "theme_style", v => v);
    this.shadowRoot.getElementById("allow_wrap")?.addEventListener("change", e=>this._dispatchCard({...this._cardConfig,allow_wrap:e.target.checked}));
    this.shadowRoot.getElementById("flow_import")?.addEventListener("click", async()=>{
      try{ const flow=await loadFlowConfig(this._hass,this._cardConfig.flow_dashboard,this._cardConfig.flow_index);
        this._slots=resolveFlowSlots(this._hass,flow);
        const ok=await wsSet(this._hass.connection,{slots:this._slots});
        if(!ok)throw Error("Speichern fehlgeschlagen (Administratorrechte erforderlich)");
        window.dispatchEvent(new CustomEvent("smartify-energy-row-reload",{detail:{slots:this._slots}}));
        this._status="✅ Import abgeschlossen";this._dispatchCard({...this._cardConfig,source_mode:"manual"});this._render();
      }catch(e){this._status="❌ "+String(e.message||e);this._render();}
    });
    onCard("height",          "height",          v => parseInt(v) || 90);
    onCard("gap",             "gap",             v => parseInt(v) || 4);
    onCard("font_size_value", "font_size_value", v => parseInt(v) || 20);
    onCard("font_size_name",  "font_size_name",  v => parseInt(v) || 11);

    // Save all
    this.shadowRoot.getElementById("save-all")?.addEventListener("click", () => this._saveToHA());

    // Edit buttons
    this.shadowRoot.querySelectorAll("[data-edit]").forEach(btn =>
      btn.addEventListener("click", () => { this._editingSlot = btn.dataset.edit; this._render(); })
    );

    // Slot editor
    if (slot) {
      // Color picker sync
      const pick = this.shadowRoot.getElementById("color_pick");
      const txt  = this.shadowRoot.querySelector("[data-field=color_text]");
      if (pick && txt) {
        pick.addEventListener("input", e => { txt.value = e.target.value; });
        txt.addEventListener("input",  e => { try { pick.value = e.target.value; } catch {} });
      }

      this.shadowRoot.querySelector(".btn-save")?.addEventListener("click", () => {
        const updated = { ...slot };
        this.shadowRoot.querySelectorAll("[data-field]").forEach(el => {
          const f = el.dataset.field;
          if (el.type === "checkbox")    updated[f] = el.checked;
          else if (el.type === "number") updated[f] = parseFloat(el.value) || 0;
          else                           updated[f] = el.value;
        });
        // Wenn Textfeld leer, Wert vom Color-Picker nehmen
        if (!updated.color_text && pick) updated.color_text = pick.value;
        this._slots = this._slots.map(s => s.id === slot.id ? updated : s);
        this._editingSlot = null;
        this._render();
      });

      this.shadowRoot.querySelector(".btn-cancel")?.addEventListener("click", () => {
        this._editingSlot = null;
        this._render();
      });
    }
  }
}

if (!customElements.get("smartify-energy-row-editor")) customElements.define("smartify-energy-row-editor", SmartifyEnergyRowEditor);

// ── Card ─────────────────────────────────────────────────────────────────────

class SmartifyEnergyRow extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass   = null;
    this._config = {};
    this._slots  = mergeSlots([]);
    this._loaded = false;
    this._flowConfig = null;
    this._flowError = "";
    this._flowFetched = 0;
    this._flowRequest = false;
    this._onReload = e => {
      if (e.detail?.slots) this._slots = mergeSlots(e.detail.slots);
      this._render();
    };
  }

  static getConfigElement() {
    return document.createElement("smartify-energy-row-editor");
  }

  static getStubConfig() {
    return { height: 90, gap: 4 };
  }

  setConfig(config) {
    this._config = { height: 90, gap: 4, font_size_value: 20, font_size_name: 11,
      background_transparency:0,theme_style:"theme",allow_wrap:true,source_mode:"manual",...config };
    this._flowFetched = 0;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._refreshFlowConfig();
    if (!this._loaded && hass?.connection) {
      this._loaded = true;
      wsGet(hass.connection).then(data => {
        if (data?.slots) this._slots = mergeSlots(data.slots);
        this._render();
      });
    } else {
      this._render();
    }
  }

  async _refreshFlowConfig(){
    if(this._config.source_mode!=="linked"||!this._hass?.connection||this._flowRequest)return;
    if(Date.now()-this._flowFetched<15000)return;
    this._flowFetched=Date.now();this._flowRequest=true;
    try{this._flowConfig=await loadFlowConfig(this._hass,this._config.flow_dashboard,this._config.flow_index);
      this._flowError="";
    }catch(e){this._flowConfig=null;this._flowError=String(e.message||e);}
    finally{this._flowRequest=false;this._render();}
  }

  connectedCallback() {
    window.addEventListener("smartify-energy-row-reload", this._onReload);
    this.style.display = "block";
    this.style.margin  = "0";
    this.style.padding = "0";
    // Never mutate parent ha-card or dashboard styles (other cards may share them).
  }

  disconnectedCallback() {
    window.removeEventListener("smartify-energy-row-reload", this._onReload);
  }

  _handleTap(slot) {
    const entityId = slot.entity || slot.entity_secondary;
    if (!entityId) return;
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  _render() {
    const h       = this._hass;
    const c       = this._config;
    const height  = c.height          ?? 90;
    const gap     = c.gap             ?? 4;
    const fsValue = c.font_size_value ?? 20;
    const fsName  = c.font_size_name  ?? 11;

    const linked=c.source_mode==="linked";
    const dataSlots=linked?(this._flowConfig?resolveFlowSlots(h,this._flowConfig):[]):this._slots;
    const measurements=linked?flowMeasurements(h,dataSlots):null;
    const visible=dataSlots.filter(s=>isVisible(h,s,measurements));

    const slotsHTML = visible.map(slot => {
      const bg      = getBackground(h, slot,measurements);
      const display = getDisplayValue(h, slot,measurements);
      const overlay = getBoilerOverlay(h, slot);
      const iconOff = overlay !== "";
      const flip    = (slot.mode === "grid" || slot.mode==="flow_grid") && slotPower(h,slot,measurements)>0
                      ? "scaleX(-1)" : "scaleX(1)";
      return `
        <div class="slot" data-id="${slot.id}"
             style="background:${c.theme_style==="gradient"?bg:"var(--ha-card-background,var(--card-background-color,#fff))"};height:${height}px;">
          <div class="icon-wrap">
            <ha-icon icon="${slot.icon}"
              style="color:${iconOff?"transparent":"currentColor"};transform:${flip}"></ha-icon>
            ${overlay}
          </div>
          <div class="value" style="font-size:${fsValue}px">${esc(display)}</div>
          ${slot.show_name ? `<div class="name" style="font-size:${fsName}px">${esc(slot.label)}</div>` : ""}
        </div>`;
    }).join("");

    this.shadowRoot.innerHTML = `
      <style>
        :host {display:block;font-family:var(--primary-font-family,inherit);color:var(--primary-text-color);}
        ha-card{padding:0;border-radius:var(--ha-card-border-radius,12px);background:transparent;box-shadow:none;border:none;}
        .slot{color:var(--primary-text-color);border:1px solid var(--ha-card-border-color,var(--divider-color));}
        .slot:before{content:"";position:absolute;inset:0;background:var(--ha-card-background,var(--card-background-color,#fff));opacity:0;pointer-events:none;}
        .value,.name,.icon-wrap{position:relative;z-index:1;}
        .name{color:var(--secondary-text-color);}
        .slot{background-color:var(--card-background-color);background-blend-mode:normal;}
        .slot{--bg-alpha:${Math.max(0,Math.min(100,100-(Number(c.background_transparency)||0)))}%;}
        .slot{background-image:none!important;background:color-mix(in srgb,var(--ha-card-background,var(--card-background-color,#fff)) var(--bg-alpha),transparent)!important;}
        ${c.theme_style==="gradient"?`.slot{background-image:var(--row-gradient)!important;background:color-mix(in srgb,var(--row-gradient,var(--ha-card-background,var(--card-background-color))) var(--bg-alpha),transparent)!important;}`:""}
        .row { display:flex; flex-wrap:${c.allow_wrap===false?"nowrap":"wrap"}; gap:${gap}px; width:100%;
               box-sizing:border-box; line-height:normal; overflow:hidden; }
        .slot { flex:1 1 90px; min-width:65px; border-radius:var(--ha-card-border-radius,8px); display:flex;
                flex-direction:column; align-items:center; justify-content:center;
                cursor:pointer; box-sizing:border-box; position:relative;
                transition:transform .15s ease; overflow:hidden; }
        .slot:active { transform:scale(0.96); }
        ha-icon { width:24px; height:24px; display:block; }
        .icon-wrap { position:relative; display:flex; align-items:center; justify-content:center; }
        .overlay { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
                   pointer-events:none; display:flex; overflow:hidden; background:#444; border-radius:3px; }
        .value { font-weight:bold; line-height:1.1; margin-top:2px; }
        .name  { margin-top:1px;text-align:center;overflow-wrap:anywhere; }
        .empty { font-size:12px; color:var(--secondary-text-color);
                 padding:14px; text-align:center; line-height:normal; }
      </style>
      <div class="row">
        ${visible.length
          ? slotsHTML
          : `<div class="empty">${esc(linked?(this._flowError||"Lade Flow Card …"):"Bitte Entitäten im Editor konfigurieren.")}</div>`}
      </div>`;

    this.shadowRoot.querySelectorAll(".slot").forEach(el => {
      const s = dataSlots.find(s => s.id === el.dataset.id);
      if (s) el.addEventListener("click", () => this._handleTap(s));
    });
  }

  getCardSize()      { return 1; }
  getLayoutOptions() { return { grid_columns: 12, grid_rows: "auto" }; }
}

if (!customElements.get("smartify-energy-row")) customElements.define("smartify-energy-row", SmartifyEnergyRow);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "smartify-energy-row",
  name: "Smartify Energy Row",
  description: "Alle Energiewerte in einer Card — zentral via HA Websocket gespeichert.",
  preview: false,
});
