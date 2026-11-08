/**
 * smartify-energy-row-card
 * Lovelace Custom Card — alle Energiewerte in einer Zeile.
 * Profile zentral via HA Websocket gespeichert (geräteübergreifend, kein Token nötig),
 * Abweichungen pro Karte in der Lovelace-Kartenkonfiguration.
 * Version: 2.1.0 (standalone integration)
 *
 * Speicherung: eigener Home-Assistant-Store via authentifizierte WebSocket-Endpunkte
 *
 * Installation: custom_components/smartify_energy_row_card/frontend/smartify-energy-row-card.js
 * Resource:     /smartify_energy_row_card/smartify-energy-row-card.js  (type: module)
 *
 * YAML:
 *   type: custom:smartify-energy-row-card
 *   profile: standard          # zentrales Profil (Slots + Darstellung)
 *   height: 95                 # optional: Abweichung nur für diese Karte
 *   slots:
 *     - id: poolpump
 *       hidden: true           # optional: Slot nur auf dieser Karte ausblenden
 */

// Shared settings are stored by our integration, not by undocumented Lovelace namespaces.
async function wsGet(conn) {
  try { return await conn.sendMessagePromise({type:"smartify_energy_row_card/get"}); }
  catch (e) { console.warn("Smartify Row settings could not be loaded",e); return null; }
}
async function wsSet(conn,data) {
  try { await conn.sendMessagePromise({type:"smartify_energy_row_card/save",slots:data.slots}); return true; }
  catch (e) { console.error("Smartify Row settings could not be saved",e); return false; }
}
async function wsSaveProfile(conn,name,profile) {
  try { await conn.sendMessagePromise({type:"smartify_energy_row_card/save_profile",name,profile}); return true; }
  catch (e) { console.error("Smartify Row profile could not be saved",e); return false; }
}
function normalizeFlowLocation(dashboard) {
  // Accept dashboard keys, HA dashboard/view routes and pasted absolute URLs.
  let value=String(dashboard||"lovelace").trim();
  if(/^https?:\/\//i.test(value)){try{value=new URL(value).pathname;}catch{throw Error("Ungültige Dashboard-URL");}}
  const parts=value.split("/").filter(Boolean);
  return {dashboard:parts[0]||"lovelace",view:parts[1]||""};
}
function findFlowCards(cfg,viewPath=""){
  const cards=[];
  const visited=new WeakSet();
  const visit=(node)=>{
    if(!node||typeof node!=="object"||visited.has(node))return;
    visited.add(node);
    if(Array.isArray(node)){node.forEach(visit);return;}
    if(node.type==="custom:smartify-flow-card"){cards.push(node);return;}
    for(const key of ["views","sections","cards","elements","columns","rows","card","config"]){
      if(node[key]&&typeof node[key]==="object")visit(node[key]);
    }
  };
  if(viewPath&&Array.isArray(cfg?.views)){
    const selected=cfg.views.find((view,i)=>String(view.path||i)===viewPath);
    if(!selected)throw Error("Die Dashboard-Ansicht „"+viewPath+"“ existiert nicht. Verfügbare Ansichten: "+cfg.views.map((v,i)=>v.path||i).join(", "));
    visit(selected);
  }else visit(cfg);
  return cards;
}
async function loadFlowConfig(hass,dashboard,index){
  if(!hass?.connection?.sendMessagePromise)throw Error("Keine Home-Assistant-WebSocket-Verbindung");
  const location=normalizeFlowLocation(dashboard);
  const payload={type:"lovelace/config",url_path:location.dashboard};
  let cfg;
  try{cfg=await hass.connection.sendMessagePromise(payload);}
  catch(err){
    const code=err?.code||"websocket_error";
    throw Error("Dashboard „"+location.dashboard+"“ konnte nicht geladen werden ["+code+"]: "+(err?.message||String(err)));
  }
  const cards=findFlowCards(cfg,location.view);
  const at=Math.max(0,(Number(index)||1)-1);
  if(!cards.length)throw Error("Keine Smartify Flow Card unter „"+location.dashboard+(location.view?"/"+location.view:"")+"“ gefunden. Prüfe, ob sie in einem gespeicherten Dashboard liegt.");
  if(!cards[at])throw Error("Flow Card Nr. "+(at+1)+" nicht gefunden: "+cards.length+" gefunden.");
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
    {id:"pv",label:c.solar?.name||"PV",icon:c.solar?.icon||"mdi:solar-power",entities:[...new Set(pv)],mode:"pv",show_name:true,hide_below:0,gradient:["#ff9900","#ffc34d"]},
    {id:"home",label:"Hausverbrauch",icon:"mdi:home",mode:"home",show_name:true,hide_below:0,gradient:["#555","#111"]},
    {id:"grid",label:grid.name||"Netz",icon:"mdi:transmission-tower",mode:"flow_grid",
     entity:grid.saldo_power||grid.import_power||"",entity_secondary:grid.export_power||"",
     grid_mode:grid.mode||(grid.saldo_power?"saldo":"separate"),positive_import:grid.positive_import!==false,
     show_name:true,hide_below:0,gradient_import:["#FFB74D","#E65100"],gradient_export:["#81C784","#00ACC1"]},
  ];
  if(b.power)slots.push({id:"battery",label:b.name||"Akku",icon:b.icon||"mdi:battery",mode:"battery",entity:b.power,invert:!!b.invert,show_name:true,hide_below:0,gradient:["#22a06b","#38bdf8"]});
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
      show_name:true,hide_below:0,accent_color:ov.color||undefined});
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
const esc=(v)=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));

// ── Werteformat ──────────────────────────────────────────────────────────────
// value_format: "auto" (ab 1000 W in kW), "w" (immer ganzzahlig W, wie v4.x), "kw" (immer kW)
function formatPower(w, fmt="auto") {
  if (w == null) return { num: "–", unit: "" };
  const a = Math.abs(w);
  if (fmt === "w" || (fmt !== "kw" && a < 1000)) return { num: String(Math.round(a)), unit: "W" };
  return { num: (a / 1000).toFixed(2), unit: "kW" };
}
const displayPower=(w,fmt="auto")=>{const p=formatPower(w,fmt);return p.unit?p.num+" "+p.unit:p.num;};
function parseShowUnit(v) {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return "auto";
}

// ── Default Slots ────────────────────────────────────────────────────────────

const DEFAULT_SLOTS = [
  {
    id: "pv", label: "PV", icon: "mdi:solar-power",
    entity: "", hide_below: 0, show_name: true,
    gradient: ["#ff9900", "#ffc34d"], color_text: "#fff",
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
    gradient: ["#80DEEA", "#00ACC1"], color_text: "#fff",
  },
  {
    id: "heatpump", label: "Wärmepumpe", icon: "mdi:heat-pump",
    entity: "", entity_activity: "", hide_below: 30, show_name: true,
    threshold_mid: 1000, threshold_high: 2000,
    gradient_low:  ["#8ED6FF", "#4FC3F7"],
    gradient_mid:  ["#FFF59D", "#FF9800"],
    gradient_high: ["#FFB74D", "#D32F2F"],
    color_text: "#fff", mode: "heatpump",
  },
  {
    id: "poolpump", label: "Poolpumpe", icon: "mdi:pool",
    entity: "", entity_activity: "", hide_below: 600, show_name: true,
    threshold_mid: 600, threshold_high: 1200,
    gradient_low:  ["#8ED6FF", "#4FC3F7"],
    gradient_mid:  ["#FFF59D", "#FF9800"],
    gradient_high: ["#FFB74D", "#D32F2F"],
    color_text: "#fff", mode: "poolpump",
  },
];
const DEFAULT_SLOT_MAP = new Map(DEFAULT_SLOTS.map(def => [def.id, def]));

function mergeSlots(saved) {
  if (!Array.isArray(saved) || !saved.length) return DEFAULT_SLOTS.map(def=>({...def}));
  // Keep all imported Flow Card consumers; they are not limited to the legacy standard slots.
  return saved.filter(item=>item&&typeof item.id==="string").map(item=>({
    ...(DEFAULT_SLOT_MAP.get(item.id)||{show_name:true,hide_below:0}),...item
  }));
}

// ── Profile: zentrale Einstellungen + Abweichungen pro Karte ─────────────────
// Reihenfolge: Standardwerte < Profil (HA-Storage) < Kartenkonfiguration (Lovelace).
// Slots: Profil-Slots, darüber card.slots als Teil-Overrides je id (z. B. {id: poolpump, hidden: true}).

const DEFAULT_SETTINGS = {
  height: 90, gap: 4, font_size_value: 20, font_size_name: 11, icon_size: 24,
  show_unit: "auto", value_format: "auto",
  theme_style: "theme", bar_position: "top", bar_style: "accent", bar_height: 4,
  border_radius: null, slot_border: true, text_color: "theme",
  background_transparency: 0, allow_wrap: true,
  source_mode: "manual", flow_dashboard: "lovelace", flow_index: 1,
  hide_low_power_devices: false, device_display_threshold_w: 0,
};
const SETTING_KEYS = new Set(Object.keys(DEFAULT_SETTINGS));
const PROFILE_NAME_RE = /^[a-z0-9_-]{1,40}$/;
// Nur Lovelace-Schlüssel, die nie ins Profil gehören.
const CARD_ONLY_KEYS = new Set(["type","profile","slots","grid_options","view_layout","visibility","layout_options","card_mod"]);

function normalizeStore(data) {
  const profiles = {};
  const raw = data && typeof data.profiles === "object" && !Array.isArray(data.profiles) ? data.profiles : {};
  for (const [name, p] of Object.entries(raw)) {
    if (!PROFILE_NAME_RE.test(name) || !p || typeof p !== "object") continue;
    profiles[name] = {
      settings: p.settings && typeof p.settings === "object" && !Array.isArray(p.settings) ? { ...p.settings } : {},
      slots: Array.isArray(p.slots) ? p.slots.filter(s => s && typeof s.id === "string") : [],
    };
  }
  // Migration: gespeicherte Slots aus 2.0.x werden zum Profil „standard“ (nur lesend, nichts wird überschrieben).
  if (!profiles.standard && Array.isArray(data?.slots) && data.slots.length) {
    profiles.standard = { settings: {}, slots: data.slots.filter(s => s && typeof s.id === "string") };
  }
  return { profiles, loaded: !!data };
}

function applySlotOverrides(base, overrides) {
  const out = base.map(s => ({ ...s }));
  if (!Array.isArray(overrides)) return out;
  for (const ov of overrides) {
    if (!ov || typeof ov.id !== "string") continue;
    const i = out.findIndex(s => s.id === ov.id);
    if (i >= 0) out[i] = { ...out[i], ...ov };
    else out.push({ ...(DEFAULT_SLOT_MAP.get(ov.id) || { show_name: true, hide_below: 0 }), ...ov });
  }
  return out;
}

function resolveCardConfig(card = {}, store = { profiles: {} }) {
  const name = PROFILE_NAME_RE.test(String(card.profile || "")) ? String(card.profile) : "standard";
  const profile = store?.profiles?.[name] || null;
  const settings = { ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(profile?.settings || {})) if (SETTING_KEYS.has(k)) settings[k] = v;
  for (const [k, v] of Object.entries(card || {})) if (!CARD_ONLY_KEYS.has(k)) settings[k] = v;
  const slots = applySlotOverrides(mergeSlots(profile?.slots), card?.slots);
  return { name, profile, settings, slots, explicitProfile: typeof card?.profile === "string" };
}

// Felder eines Slots, die von der Profil-Basis abweichen (für Overrides „nur diese Karte“).
function slotDiff(base, updated) {
  const diff = { id: updated.id };
  for (const [k, v] of Object.entries(updated)) {
    if (k === "id") continue;
    if (JSON.stringify(v) !== JSON.stringify(base?.[k])) diff[k] = v;
  }
  return diff;
}

// ── Value / Display Helpers ──────────────────────────────────────────────────

function getValue(hass, slot) {
  return finitePower(hass,slot.entity);
}

function getDisplayParts(hass, slot, measure, fmt) {
  const raw = slotPower(hass, slot, measure);
  const p = formatPower(raw, fmt);
  const dir = slot.mode==="flow_grid"&&raw!=null?(raw>0?"Bezug":raw<0?"Einspeisung":""):"";
  return { ...p, dir };
}
function getDisplayValue(hass, slot, measure, fmt="auto") {
  const p = getDisplayParts(hass, slot, measure, fmt);
  return (p.unit ? p.num + " " + p.unit : p.num) + (p.dir ? " · " + p.dir : "");
}

function safeAccent(color, fallback) {
  return typeof color==="string" && /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(color.trim()) ? color.trim() : fallback;
}
function safeGradient(list, fallback) {
  if (!Array.isArray(list) || list.length < 2) return fallback;
  const ok = list.slice(0, 2).map(c => safeAccent(c, null));
  return ok.every(Boolean) ? ok : fallback;
}
function levelThresholds(slot) {
  const pool = slot.mode === "poolpump";
  const mid = Number.isFinite(Number(slot.threshold_mid)) ? Number(slot.threshold_mid) : pool ? 600 : 1000;
  const high = Number.isFinite(Number(slot.threshold_high)) ? Number(slot.threshold_high) : pool ? 1200 : 2000;
  return { mid, high };
}
function powerLevel(hass, slot) {
  const v = getValue(hass, slot);
  if (v == null) return null;
  const { mid, high } = levelThresholds(slot);
  return v > high ? "high" : v > mid ? "mid" : "low";
}

// Liefert das Farbpaar eines Slots (für Hintergrund oder Farbbalken) oder null.
function slotGradient(hass, slot, measure) {
  if (slot.mode === "battery") {
    const w = slotPower(hass, slot, measure);
    return w != null && w < 0 ? ["#38bdf8", "#0288d1"] : ["#22a06b", "#86efac"];
  }
  if (slot.mode === "flow_grid" || slot.mode === "grid") {
    const w = slotPower(hass, slot, measure);
    if (w != null && w > 0) return safeGradient(slot.gradient_import, ["#FFB74D", "#E65100"]);
    if (w != null && w < 0) return safeGradient(slot.gradient_export, ["#81C784", "#00ACC1"]);
    return null;
  }
  if (slot.mode === "heatpump" || slot.mode === "poolpump") {
    const lvl = powerLevel(hass, slot) || "low";
    const def = { low: ["#8ED6FF", "#4FC3F7"], mid: ["#FFF59D", "#FF9800"], high: ["#FFB74D", "#D32F2F"] }[lvl];
    return safeGradient(slot["gradient_" + lvl], def);
  }
  return safeGradient(slot.gradient, null);
}

function slotAccent(hass, slot, measurements) {
  if(slot.accent_color) return safeAccent(slot.accent_color, "#64748b");
  const w=slotPower(hass,slot,measurements);
  switch(slot.mode||slot.id){
    case "pv": return "#f5b301";
    case "home": return "#64748b";
    case "flow_grid": case "grid":
      return w===null ? "#94a3b8" : w>0 ? "#f97316" : w<0 ? "#00a896" : "#94a3b8";
    case "battery":
      return w===null ? "#94a3b8" : w>0 ? "#22a06b" : w<0 ? "#38bdf8" : "#94a3b8";
    case "heatpump": case "poolpump": {
      const lvl=powerLevel(hass,slot);
      return lvl===null ? "#94a3b8" : lvl==="high" ? "#ef4444" : lvl==="mid" ? "#f59e0b" : "#38bdf8";
    }
    case "ohmpilot": return "#0288d1";
    case "charger": return "#00acc1";
    default: {
      const g=safeGradient(slot.gradient,null);
      return g ? g[1] : safeAccent(slot.color, "#64748b");
    }
  }
}

function getBackground(hass, slot, measure) {
  const g = slotGradient(hass, slot, measure);
  return g ? `linear-gradient(135deg,${g.join(",")})` : "var(--ha-card-background,var(--card-background-color))";
}
function getBar(hass, slot, measure, style) {
  if (style === "gradient") {
    const g = slotGradient(hass, slot, measure);
    if (g) return `linear-gradient(to right,${g.join(",")})`;
  }
  return slotAccent(hass, slot, measure);
}

// Global display filter applies only to consumers, never PV/house/grid/battery sources.
const SOURCE_SLOT_IDS=new Set(["pv","home","grid","battery"]);
function isConsumerSlot(slot) {
  return !SOURCE_SLOT_IDS.has(slot.id) && !["pv","home","grid","flow_grid","battery"].includes(slot.mode);
}
function isVisibleWithThreshold(hass,slot,measure,config={}) {
  if(slot.hidden===true)return false;
  if(!isVisible(hass,slot,measure))return false;
  if(config.hide_low_power_devices!==true || !isConsumerSlot(slot))return true;
  const limit=Number(config.device_display_threshold_w);
  if(!Number.isFinite(limit)||limit<0)return true;
  const watts=slotPower(hass,slot,measure);
  return watts!=null && Math.abs(watts)>=limit;
}
function isVisible(hass, slot, measure) {
  if(slot.hidden===true)return false;
  if(["pv","home","flow_grid","battery"].includes(slot.mode)) {
    const w=slotPower(hass,slot,measure);
    return w!=null&&Math.abs(w)>=(slot.hide_below||0);
  }
  if (slot.mode === "grid") {
    if (!slot.entity && !slot.entity_secondary) return false;
    const w=slotPower(hass,slot);
    return w!=null&&Math.abs(w)>=(slot.hide_below||0);
  }
  if (!slot.entity) return false;
  const w=slotPower(hass,slot);
  return w!=null && Math.abs(w)>=(slot.hide_below||0);
}

const clampNum=(v,min,max,def)=>{const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):def;};

// Berechnet das Kachel-CSS aus den aufgelösten Einstellungen (testbar ohne DOM).
// Theme-Variablen --smartify-energy-row-* (z. B. E-Paper) haben Vorrang vor der Konfiguration.
function slotStyleVars(s) {
  const radius = s.border_radius === null || s.border_radius === undefined || s.border_radius === ""
    ? "var(--ha-card-border-radius,8px)" : clampNum(s.border_radius, 0, 60, 8) + "px";
  const border = s.slot_border === false ? "none" : "inset 0 0 0 1px var(--ha-card-border-color,var(--divider-color))";
  return {
    radius: `var(--smartify-energy-row-slot-border-radius,${radius})`,
    shadow: `var(--smartify-energy-row-slot-shadow,${border})`,
    barHeight: ["top", "bottom"].includes(s.bar_position) ? clampNum(s.bar_height, 0, 16, 4) : 0,
  };
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
  input[type=text], input[type=number], select {
    width:100%; box-sizing:border-box;
    background:var(--card-background-color); color:var(--primary-text-color);
    border:1px solid var(--divider-color); border-radius:4px; padding:6px 8px; font-size:13px;
  }
  .row { display:flex; gap:8px; align-items:center; margin:6px 0; }
  input[type=checkbox] { width:16px; height:16px; cursor:pointer; flex-shrink:0; }
  .field { position:relative; }
  .field.override label { color:var(--primary-color); font-weight:600; }
  .reset { position:absolute; right:0; top:2px; border:none; background:none; color:var(--primary-color);
    cursor:pointer; font-size:12px; padding:0; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:0 10px; }
  .tabs { display:flex; gap:6px; margin:8px 0; }
  .tab { flex:1; padding:7px; border-radius:6px; border:1px solid var(--divider-color);
    background:transparent; color:var(--primary-text-color); cursor:pointer; font-size:12px; }
  .tab.active { background:var(--primary-color); color:var(--text-primary-color,#fff); border-color:var(--primary-color); }
  .slot-list { display:flex; flex-direction:column; gap:6px; }
  .slot-row { display:flex; align-items:center; gap:6px; padding:8px;
    background:var(--secondary-background-color); border-radius:6px; }
  .slot-row.is-hidden { opacity:.55; }
  .slot-label { flex:1; font-size:13px; font-weight:500; }
  .slot-label .ov { color:var(--primary-color); font-size:11px; margin-left:4px; }
  .slot-entity { flex:2; font-size:11px; color:var(--secondary-text-color);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .btn { padding:4px 8px; border-radius:4px; border:1px solid var(--divider-color);
    background:var(--card-background-color); color:var(--primary-text-color); cursor:pointer; font-size:12px; }
  .btn:hover { background:var(--primary-color); color:white; }
  .slot-editor { background:var(--secondary-background-color); border-radius:8px; padding:12px; margin-top:8px; }
  .slot-editor-title { font-weight:600; margin-bottom:10px; font-size:14px; }
  .btn-row { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
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

// Darstellungsoptionen: gleiche Felder für „Profil“ und „Nur diese Karte“.
const SETTING_FIELDS = [
  { key: "height", label: "Höhe (px)", type: "number", min: 30, max: 300 },
  { key: "gap", label: "Abstand zwischen Kacheln (px)", type: "number", min: 0, max: 40 },
  { key: "icon_size", label: "Icon-Größe (px)", type: "number", min: 10, max: 96 },
  { key: "font_size_value", label: "Schriftgröße Wert", type: "number", min: 8, max: 64 },
  { key: "font_size_name", label: "Schriftgröße Name", type: "number", min: 8, max: 38 },
  { key: "border_radius", label: "Eckenradius (px, leer = Theme)", type: "number", min: 0, max: 60, nullable: true },
  { key: "show_unit", label: "Einheit anzeigen", type: "select", options: [["auto","Automatisch (bei Platzmangel ausblenden)"],["true","Immer"],["false","Nie"]] },
  { key: "value_format", label: "Werteformat", type: "select", options: [["auto","Automatisch (ab 1000 W in kW)"],["w","Immer W (ganzzahlig)"],["kw","Immer kW"]] },
  { key: "theme_style", label: "Hintergrund", type: "select", options: [["theme","Home Assistant Theme"],["gradient","Original-Farbverläufe"]] },
  { key: "text_color", label: "Textfarbe", type: "select", options: [["theme","Theme"],["slot","Textfarbe je Slot"]] },
  { key: "bar_position", label: "Farbbalken", type: "select", options: [["top","Oben"],["bottom","Unten"],["none","Kein Balken"]] },
  { key: "bar_style", label: "Farbbalken-Stil", type: "select", options: [["accent","Einfarbig (Akzent)"],["gradient","Farbverlauf"]] },
  { key: "bar_height", label: "Farbbalken-Höhe (px)", type: "number", min: 0, max: 16 },
  { key: "background_transparency", label: "Hintergrundtransparenz (0–100 %)", type: "range", min: 0, max: 100, step: 5 },
  { key: "slot_border", label: "Rahmen um Kacheln", type: "checkbox" },
  { key: "allow_wrap", label: "Zeilenumbruch auf schmalen Bildschirmen", type: "checkbox" },
  { key: "hide_low_power_devices", label: "Verbraucher mit geringer Leistung ausblenden", type: "checkbox" },
  { key: "device_display_threshold_w", label: "Ausblenden unter Leistung (W)", type: "number", min: 0, max: 100000 },
];

function parseFieldValue(field, el) {
  if (field.type === "checkbox") return el.checked;
  if (field.type === "number" || field.type === "range") {
    if (field.nullable && String(el.value).trim() === "") return null;
    return clampNum(el.value, field.min ?? -Infinity, field.max ?? Infinity, DEFAULT_SETTINGS[field.key] ?? 0);
  }
  if (field.key === "show_unit") return parseShowUnit(el.value);
  return el.value;
}

// ── Editor ───────────────────────────────────────────────────────────────────

class SmartifyEnergyRowCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._cardConfig  = {};
    this._hass        = null;
    this._store       = { profiles: {}, loaded: false };
    this._draft       = null;   // bearbeitete Kopie des aktiven Profils
    this._dirty       = false;
    this._target      = "profile";
    this._editingSlot = null;
    this._status      = "";
    this._loading     = false;
    this._flowCheck   = "";
    this._newProfile  = false;
  }

  set hass(h) {
    this._hass = h;
    if (!this._loaded && h?.connection) {
      this._loaded = true;
      this._loadFromHA();
    }
  }

  setConfig(config) {
    const before = this._profileName();
    this._cardConfig = { ...config };
    if (this._profileName() !== before) { this._draft = null; this._dirty = false; }
    this._render();
  }

  _profileName() {
    const p = String(this._cardConfig?.profile || "");
    return PROFILE_NAME_RE.test(p) ? p : "standard";
  }

  _profileDraft() {
    if (!this._draft) {
      const p = this._store.profiles[this._profileName()];
      this._draft = { settings: { ...(p?.settings || {}) }, slots: mergeSlots(p?.slots).map(s => ({ ...s })) };
    }
    return this._draft;
  }

  async _loadFromHA() {
    this._loading = true;
    this._render();
    this._store = normalizeStore(await wsGet(this._hass.connection));
    this._draft = null;
    this._loading = false;
    this._render();
  }

  async _saveProfile() {
    if (!this._hass?.connection) { this._status = "❌ Keine HA-Verbindung"; this._render(); return false; }
    const name = this._profileName();
    const profile = this._profileDraft();
    this._status = "⏳ Speichern...";
    this._render();
    const ok = await wsSaveProfile(this._hass.connection, name, profile);
    if (ok) {
      this._store = { ...this._store, profiles: { ...this._store.profiles, [name]: JSON.parse(JSON.stringify(profile)) } };
      this._dirty = false;
      window.dispatchEvent(new CustomEvent("smartify-energy-row-card-reload", { detail: { store: this._store } }));
    }
    this._status = ok ? `✅ Profil „${name}“ gespeichert – gilt für alle Karten mit diesem Profil` : "❌ Fehler beim Speichern (Administratorrechte erforderlich)";
    this._render();
    return ok;
  }

  _dispatchCard(cfg) {
    this._cardConfig = cfg;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: cfg }, bubbles: true, composed: true,
    }));
  }

  // Kartenwerte (Overrides) ins Profil übernehmen und aus der Karte entfernen.
  async _promoteCardToProfile() {
    const draft = this._profileDraft();
    const c = this._cardConfig;
    for (const [k, v] of Object.entries(c)) if (SETTING_KEYS.has(k)) draft.settings[k] = v;
    draft.slots = applySlotOverrides(draft.slots, c.slots);
    this._dirty = true;
    if (await this._saveProfile()) {
      const keep = {};
      for (const [k, v] of Object.entries(c)) if (CARD_ONLY_KEYS.has(k) && k !== "slots") keep[k] = v;
      keep.profile = this._profileName();
      this._dispatchCard(keep);
      this._render();
    }
  }

  _entityList() {
    if (!this._hass) return [];
    return Object.keys(this._hass.states).sort();
  }

  _datalist(id) {
    return `<datalist id="${id}">${this._entityList().map(e => `<option value="${esc(e)}">`).join("")}</datalist>`;
  }

  _effectiveSettings() {
    const draft = this._profileDraft();
    const base = { ...DEFAULT_SETTINGS };
    for (const [k, v] of Object.entries(draft.settings)) if (SETTING_KEYS.has(k)) base[k] = v;
    if (this._target === "profile") return base;
    for (const [k, v] of Object.entries(this._cardConfig)) if (SETTING_KEYS.has(k)) base[k] = v;
    return base;
  }

  _effectiveSlots() {
    const base = this._profileDraft().slots;
    return this._target === "profile" ? base : applySlotOverrides(base, this._cardConfig.slots);
  }

  _renderField(f, s) {
    const overridden = this._target === "card" && Object.prototype.hasOwnProperty.call(this._cardConfig, f.key);
    const v = s[f.key];
    let input;
    if (f.type === "checkbox") {
      return `<div class="row field ${overridden?"override":""}"><input type="checkbox" data-setting="${f.key}" id="${f.key}" ${v?"checked":""}>
        <label for="${f.key}" style="margin:0;font-size:13px">${esc(f.label)}</label>
        ${overridden?`<button class="reset" data-reset="${f.key}" title="Profilwert verwenden">↺</button>`:""}</div>`;
    }
    if (f.type === "select") {
      const cur = String(f.key === "show_unit" ? parseShowUnit(v) : v);
      input = `<select data-setting="${f.key}" id="${f.key}">${f.options.map(([val, txt]) => `<option value="${val}" ${cur===val?"selected":""}>${esc(txt)}</option>`).join("")}</select>`;
    } else {
      input = `<input type="${f.type}" data-setting="${f.key}" id="${f.key}" ${f.min!=null?`min="${f.min}"`:""} ${f.max!=null?`max="${f.max}"`:""} ${f.step?`step="${f.step}"`:""} value="${v===null||v===undefined?"":esc(v)}">`;
    }
    return `<div class="field ${overridden?"override":""}"><label for="${f.key}">${esc(f.label)}</label>${input}
      ${overridden?`<button class="reset" data-reset="${f.key}" title="Profilwert verwenden">↺ Profil</button>`:""}</div>`;
  }

  _renderSlotEditor(slot) {
    const isGrid = slot.mode === "grid";
    const isLevel = slot.mode === "heatpump" || slot.mode === "poolpump";
    return `
      <div class="slot-editor">
        <div class="slot-editor-title">✏️ ${esc(slot.label)} ${this._target==="card"?"(nur diese Karte)":"(Profil)"}</div>

        <label>Label</label>
        <input type="text" data-field="label" value="${esc(slot.label || "")}">

        <label>Icon (MDI, z.B. mdi:solar-power)</label>
        <input type="text" data-field="icon" value="${esc(slot.icon || "")}">

        ${isGrid ? `
          <label>Entity Netzbezug</label>
          ${this._datalist("sl-e1")}
          <input list="sl-e1" type="text" data-field="entity" value="${esc(slot.entity || "")}">
          <label>Entity Netzeinspeisung</label>
          ${this._datalist("sl-e2")}
          <input list="sl-e2" type="text" data-field="entity_secondary" value="${esc(slot.entity_secondary || "")}">
        ` : `
          <label>Entity${isLevel ? " Leistung" : ""}</label>
          ${this._datalist("sl-e1")}
          <input list="sl-e1" type="text" data-field="entity" value="${esc(slot.entity || "")}">
        `}

        ${isLevel ? `
          <label>Entity Aktivität${slot.mode==="heatpump"?" (defrost / hot_water)":" (optional)"}</label>
          ${this._datalist("sl-act")}
          <input list="sl-act" type="text" data-field="entity_activity" value="${esc(slot.entity_activity || "")}">
          <div class="grid2">
            <div><label>Farbe mittel ab (W)</label><input type="number" data-field="threshold_mid" value="${levelThresholds(slot).mid}"></div>
            <div><label>Farbe hoch ab (W)</label><input type="number" data-field="threshold_high" value="${levelThresholds(slot).high}"></div>
          </div>
        ` : ""}

        <label>Ausblenden unterhalb (W)</label>
        <input type="number" data-field="hide_below" value="${slot.hide_below ?? 0}">

        <div class="row">
          <input type="checkbox" data-field="show_name" id="sn_${esc(slot.id)}" ${slot.show_name ? "checked" : ""}>
          <label for="sn_${esc(slot.id)}" style="margin:0;font-size:13px">Name anzeigen</label>
        </div>

        <label>Farbmarkierung (Hex, optional)</label>
        <input type="text" data-field="accent_color" value="${esc(slot.accent_color||"")}" placeholder="#f5b301">

        <label>Textfarbe (bei „Textfarbe je Slot“)</label>
        <div class="color-row">
          <input type="color" id="color_pick" value="${safeAccent(slot.color_text, "#ffffff").length===7?safeAccent(slot.color_text, "#ffffff"):"#ffffff"}">
          <input type="text"  data-field="color_text" value="${esc(slot.color_text || "")}">
        </div>

        <div class="btn-row">
          <button class="btn-save">💾 Übernehmen</button>
          <button class="btn-cancel">Abbrechen</button>
          ${this._target==="profile"&&!DEFAULT_SLOT_MAP.has(slot.id)?`<button class="btn-cancel" id="slot_delete">🗑 Entfernen</button>`:""}
        </div>
      </div>`;
  }

  _render() {
    const c    = this._cardConfig;
    const name = this._profileName();
    const profiles = Object.keys(this._store.profiles);
    if (!profiles.includes(name)) profiles.push(name);
    const exists = !!this._store.profiles[name];
    const s = this._effectiveSettings();
    const slots = this._effectiveSlots();
    const slot = this._editingSlot ? slots.find(x => x.id === this._editingSlot) : null;
    const cardOverrides = Object.keys(c).filter(k => SETTING_KEYS.has(k)).length + (Array.isArray(c.slots) ? c.slots.length : 0);
    const cardSlotIds = new Set((Array.isArray(c.slots) ? c.slots : []).map(x => x?.id));
    const sourceMode = s.source_mode || "manual";

    this.shadowRoot.innerHTML = `
      <style>${EDITOR_CSS}</style>

      <div class="section">Profil</div>
      <label for="profile">Profil dieser Karte</label>
      <select id="profile">
        ${profiles.map(p => `<option value="${esc(p)}" ${p===name?"selected":""}>${esc(p)}${this._store.profiles[p]?"":" (neu)"}</option>`).join("")}
        <option value="__new__">＋ Neues Profil …</option>
      </select>
      ${this._newProfile ? `
        <div class="row"><input type="text" id="new_profile_name" placeholder="z. B. kompakt" style="flex:1">
        <button class="btn" id="create_profile">Anlegen</button></div>
        <div class="hint">Erlaubt: a–z, 0–9, _ und -. Das neue Profil startet als Kopie von „${esc(name)}“.</div>` : ""}
      <div class="hint">Alle Karten mit demselben Profil teilen Slots und Darstellung. Abweichungen gelten nur für diese Karte und überschreiben das Profil.${exists||this._loading?"":" Dieses Profil ist noch nicht gespeichert."}</div>
      <div class="tabs">
        <button class="tab ${this._target==="profile"?"active":""}" data-target="profile">Profil „${esc(name)}“ (alle Karten)</button>
        <button class="tab ${this._target==="card"?"active":""}" data-target="card">Nur diese Karte${cardOverrides?` (${cardOverrides})`:""}</button>
      </div>
      ${this._target==="card" ? `<div class="hint">Blau markierte Werte weichen vom Profil ab. ↺ setzt sie zurück.</div>
        ${cardOverrides?`<button class="btn" id="promote">⇧ Abweichungen dieser Karte ins Profil übernehmen</button>`:""}` : ""}

      <div class="section">Datenquelle</div>
      <label>Entitäten</label>
      <select id="source_mode" data-setting="source_mode">
       <option value="manual" ${sourceMode==="manual"?"selected":""}>Eigenständig konfigurieren</option>
       <option value="linked" ${sourceMode==="linked"?"selected":""}>Mit Flow Card verknüpfen</option>
       <option value="import" ${sourceMode==="import"?"selected":""}>Einmalig aus Flow Card importieren</option>
      </select>
      ${sourceMode==="linked"||sourceMode==="import"?`
      <label>Dashboard-Pfad (auch komplette URL oder /dashboard/ansicht)</label><input type="text" id="flow_dashboard" data-setting="flow_dashboard" value="${esc(s.flow_dashboard||"lovelace")}">
      <label>Flow Card Nummer (beginnend bei 1; bei Ansichtspfad nur innerhalb dieser Ansicht)</label><input type="number" id="flow_index" data-setting="flow_index" min="1" value="${s.flow_index||1}">
      <button class="btn" type="button" id="flow_check">Verbindung prüfen</button>
      <div class="hint">Beispiel: /dashboard-energiemanager/s-f-c. Flow Card Nummer 1 = erste Flow Card auf dieser Ansicht.</div>
      ${this._flowCheck?'<div class="status" role="status">'+esc(this._flowCheck)+'</div>':''}
      ${sourceMode==="import"?'<button class="btn" id="flow_import">Jetzt aus Flow Card ins Profil übernehmen</button>':""}
      <div class="hint">Flow Card muss im gespeicherten Lovelace-Dashboard liegen. Verknüpfung übernimmt Entitäten, Namen und Icons.</div>
      `:''}

      <div class="section">Darstellung</div>
      <div class="grid2">
        ${SETTING_FIELDS.slice(0, 6).map(f => this._renderField(f, s)).join("")}
      </div>
      ${SETTING_FIELDS.slice(6).map(f => this._renderField(f, s)).join("")}
      <div class="hint">„Ausblenden unter Leistung“ betrifft nur Verbraucher. PV, Hausverbrauch, Netz und Akku bleiben sichtbar. Theme-Variablen <code>--smartify-energy-row-*</code> (z. B. E-Paper) haben Vorrang.</div>

      <div class="section">Energie-Slots</div>
      ${this._loading
        ? `<div class="status">⏳ Lade gespeicherte Profile...</div>`
        : slot
          ? this._renderSlotEditor(slot)
          : `
            <div class="slot-list">
              ${slots.map((x, i) => `
                <div class="slot-row ${x.hidden?"is-hidden":""}">
                  <input type="checkbox" title="anzeigen" data-visible="${esc(x.id)}" ${x.hidden?"":"checked"}>
                  <div class="slot-label">${esc(x.label)}${this._target==="card"&&cardSlotIds.has(x.id)?`<span class="ov">● Karte</span>`:""}</div>
                  <div class="slot-entity">${esc(x.entity || x.entity_secondary || (x.entities||[]).join(", ") || "— keine Entity —")}</div>
                  ${this._target==="profile"?`<button class="btn" data-move="${i}:-1" title="nach oben">▲</button><button class="btn" data-move="${i}:1" title="nach unten">▼</button>`:""}
                  ${this._target==="card"&&cardSlotIds.has(x.id)?`<button class="btn" data-slot-reset="${esc(x.id)}" title="Profilwert verwenden">↺</button>`:""}
                  <button class="btn" data-edit="${esc(x.id)}">✏️</button>
                </div>`).join("")}
            </div>
            ${this._target==="profile"?`<button class="btn" id="add_slot" style="margin-top:6px">＋ Verbraucher hinzufügen</button>`:""}
          `}
      ${this._target==="profile" ? `
        <button class="save-all" id="save-all" ${this._dirty||!exists?"":"disabled"}>💾 Profil „${esc(name)}“ in HA speichern</button>
        <div class="hint">Gilt sofort für alle Dashboards und Geräte mit diesem Profil (Administratorrechte nötig).</div>` : ""}
      <div class="status">${esc(this._status)}</div>
    `;

    const root = this.shadowRoot;

    // Profilauswahl
    root.getElementById("profile")?.addEventListener("change", e => {
      if (e.target.value === "__new__") { this._newProfile = true; this._render(); return; }
      this._newProfile = false; this._status = "";
      this._dispatchCard({ ...this._cardConfig, profile: e.target.value });
    });
    root.getElementById("create_profile")?.addEventListener("click", async () => {
      const n = String(root.getElementById("new_profile_name")?.value || "").trim().toLowerCase();
      if (!PROFILE_NAME_RE.test(n)) { this._status = "❌ Ungültiger Profilname"; this._render(); return; }
      const copy = JSON.parse(JSON.stringify(this._profileDraft()));
      this._newProfile = false;
      this._dispatchCard({ ...this._cardConfig, profile: n });
      this._draft = copy; this._dirty = true;
      await this._saveProfile();
    });
    root.querySelectorAll("[data-target]").forEach(b => b.addEventListener("click", () => {
      this._target = b.dataset.target; this._editingSlot = null; this._render();
    }));
    root.getElementById("promote")?.addEventListener("click", () => this._promoteCardToProfile());

    // Einstellungen (Profil oder Karte)
    const allFields = [...SETTING_FIELDS, { key: "source_mode", type: "select" }, { key: "flow_dashboard", type: "text" }, { key: "flow_index", type: "number", min: 1, max: 999 }];
    root.querySelectorAll("[data-setting]").forEach(el => el.addEventListener("change", () => {
      const f = allFields.find(x => x.key === el.dataset.setting);
      if (!f) return;
      let v = f.type === "text" ? (el.value.trim() || "lovelace") : parseFieldValue(f, el);
      if (this._target === "profile") {
        this._profileDraft().settings[f.key] = v; this._dirty = true; this._status = ""; this._render();
      } else {
        this._dispatchCard({ ...this._cardConfig, [f.key]: v });
      }
    }));
    root.querySelectorAll("[data-reset]").forEach(b => b.addEventListener("click", () => {
      const cfg = { ...this._cardConfig }; delete cfg[b.dataset.reset]; this._dispatchCard(cfg);
    }));

    root.getElementById("flow_check")?.addEventListener("click",async()=>{
      this._flowCheck="Prüfe Verbindung …";this._render();
      try{
        const eff=this._effectiveSettings();
        const flow=await loadFlowConfig(this._hass,eff.flow_dashboard,eff.flow_index);
        const fs=resolveFlowSlots(this._hass,flow);
        this._flowCheck="✓ Flow Card gefunden: "+fs.length+" Datenquellen/Verbraucher erkannt (inklusive "+(fs.find(x=>x.mode==="pv")?.entities?.length||0)+" PV-Anlagen).";
      }catch(e){this._flowCheck="✕ "+String(e.message||e);}
      this._render();
    });
    root.getElementById("flow_import")?.addEventListener("click", async()=>{
      try{
        const eff=this._effectiveSettings();
        const flow=await loadFlowConfig(this._hass,eff.flow_dashboard,eff.flow_index);
        const draft=this._profileDraft();
        draft.slots=resolveFlowSlots(this._hass,flow);
        draft.settings.source_mode="manual";
        this._dirty=true;
        if(!(await this._saveProfile()))throw Error("Speichern fehlgeschlagen (Administratorrechte erforderlich)");
        const cfg={...this._cardConfig};delete cfg.source_mode;this._dispatchCard(cfg);
        this._status="✅ Import ins Profil abgeschlossen";this._render();
      }catch(e){this._status="❌ "+String(e.message||e);this._render();}
    });

    root.getElementById("save-all")?.addEventListener("click", () => this._saveProfile());

    // Slot-Sichtbarkeit, Reihenfolge, Reset
    const setCardSlot = (id, patch) => {
      const list = Array.isArray(this._cardConfig.slots) ? this._cardConfig.slots.map(x => ({ ...x })) : [];
      const i = list.findIndex(x => x.id === id);
      const merged = { ...(i >= 0 ? list[i] : { id }), ...patch };
      const base = this._profileDraft().slots.find(x => x.id === id);
      const diff = base ? slotDiff(base, { ...base, ...merged }) : merged;
      if (i >= 0) list.splice(i, 1);
      if (Object.keys(diff).length > 1) list.push(diff);
      const cfg = { ...this._cardConfig };
      if (list.length) cfg.slots = list; else delete cfg.slots;
      this._dispatchCard(cfg);
    };
    root.querySelectorAll("[data-visible]").forEach(el => el.addEventListener("change", () => {
      const id = el.dataset.visible;
      if (this._target === "profile") {
        const s0 = this._profileDraft().slots.find(x => x.id === id);
        if (s0) { if (el.checked) delete s0.hidden; else s0.hidden = true; }
        this._dirty = true; this._render();
      } else setCardSlot(id, { hidden: !el.checked });
    }));
    root.querySelectorAll("[data-move]").forEach(b => b.addEventListener("click", () => {
      const [i, d] = b.dataset.move.split(":").map(Number);
      const list = this._profileDraft().slots;
      const j = i + d;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      this._dirty = true; this._render();
    }));
    root.querySelectorAll("[data-slot-reset]").forEach(b => b.addEventListener("click", () => {
      const list = (this._cardConfig.slots || []).filter(x => x?.id !== b.dataset.slotReset);
      const cfg = { ...this._cardConfig };
      if (list.length) cfg.slots = list; else delete cfg.slots;
      this._dispatchCard(cfg);
    }));
    root.getElementById("add_slot")?.addEventListener("click", () => {
      const id = "custom_" + Date.now().toString(36);
      this._profileDraft().slots.push({ id, label: "Verbraucher", icon: "mdi:power-plug", entity: "", hide_below: 10,
        show_name: true, gradient: ["#90A4AE", "#546E7A"], color_text: "#fff" });
      this._dirty = true; this._editingSlot = id; this._render();
    });
    root.querySelectorAll("[data-edit]").forEach(btn =>
      btn.addEventListener("click", () => { this._editingSlot = btn.dataset.edit; this._render(); })
    );

    // Slot-Editor
    if (slot) {
      const pick = root.getElementById("color_pick");
      const txt  = root.querySelector("[data-field=color_text]");
      if (pick && txt) {
        pick.addEventListener("input", e => { txt.value = e.target.value; });
        txt.addEventListener("input",  e => { try { pick.value = e.target.value; } catch {} });
      }
      root.querySelector(".btn-save")?.addEventListener("click", () => {
        const updated = { ...slot };
        root.querySelectorAll("[data-field]").forEach(el => {
          const f = el.dataset.field;
          if (el.type === "checkbox")    updated[f] = el.checked;
          else if (el.type === "number") updated[f] = parseFloat(el.value) || 0;
          else                           updated[f] = el.value;
        });
        if (!updated.color_text && pick) updated.color_text = pick.value;
        this._editingSlot = null;
        if (this._target === "profile") {
          const d = this._profileDraft();
          d.slots = d.slots.map(x => x.id === slot.id ? updated : x);
          this._dirty = true;
          this._render();
        } else {
          const base = this._profileDraft().slots.find(x => x.id === slot.id) || {};
          const diff = slotDiff(base, updated);
          const list = (Array.isArray(this._cardConfig.slots) ? this._cardConfig.slots : []).filter(x => x.id !== slot.id);
          if (Object.keys(diff).length > 1) list.push(diff);
          const cfg = { ...this._cardConfig };
          if (list.length) cfg.slots = list; else delete cfg.slots;
          this._dispatchCard(cfg);
          this._render();
        }
      });
      root.querySelector(".btn-cancel")?.addEventListener("click", () => {
        this._editingSlot = null;
        this._render();
      });
      root.getElementById("slot_delete")?.addEventListener("click", () => {
        const d = this._profileDraft();
        d.slots = d.slots.filter(x => x.id !== slot.id);
        this._editingSlot = null; this._dirty = true; this._render();
      });
    }
  }
}

if (!customElements.get("smartify-energy-row-card-editor")) customElements.define("smartify-energy-row-card-editor", SmartifyEnergyRowCardEditor);

// ── Card ─────────────────────────────────────────────────────────────────────

class SmartifyEnergyRowCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass   = null;
    this._config = {};
    this._store  = { profiles: {}, loaded: false };
    this._loaded = false;
    this._flowConfig = null;
    this._flowError = "";
    this._flowFetched = 0;
    this._flowRequest = false;
    this._flowGeneration = 0;
    this._ro = null;
    this._onReload = e => {
      if (e.detail?.store) this._store = e.detail.store;
      this._render();
    };
  }

  static getConfigElement() {
    return document.createElement("smartify-energy-row-card-editor");
  }

  static getStubConfig() {
    return { profile: "standard" };
  }

  // Aufgelöste Einstellungen: Standard < Profil < Karte
  get _settings() { return resolveCardConfig(this._config, this._store).settings; }

  setConfig(config) {
    this._config = { ...(config || {}) };
    this._flowFetched = 0;
    this._flowGeneration++;
    this._flowConfig = null;
    this._flowError = "";
    this._render();
    // Lovelace can call setConfig without assigning hass again: refresh immediately.
    if(this._hass?.connection)this._refreshFlowConfig();
  }

  set hass(hass) {
    this._hass = hass;
    this._refreshFlowConfig();
    if (!this._loaded && hass?.connection) {
      this._loaded = true;
      wsGet(hass.connection).then(data => {
        this._store = normalizeStore(data);
        this._flowFetched = 0;
        this._refreshFlowConfig();
        this._render();
      });
    } else {
      this._render();
    }
  }

  async _refreshFlowConfig(){
    const s=this._settings;
    if(s.source_mode!=="linked"||!this._hass?.connection||this._flowRequest)return;
    if(Date.now()-this._flowFetched<15000)return;
    this._flowFetched=Date.now();this._flowRequest=true;
    const generation=this._flowGeneration;
    try{
      const flow=await loadFlowConfig(this._hass,s.flow_dashboard,s.flow_index);
      if(generation===this._flowGeneration){this._flowConfig=flow;this._flowError="";}
    }catch(e){if(generation===this._flowGeneration){this._flowConfig=null;this._flowError=String(e.message||e);}}
    finally{
      this._flowRequest=false;
      this._render();
      if(generation!==this._flowGeneration)this._refreshFlowConfig();
    }
  }

  connectedCallback() {
    window.addEventListener("smartify-energy-row-card-reload", this._onReload);
    this.style.display = "block";
    this.style.margin  = "0";
    this.style.padding = "0";
    // Never mutate parent ha-card or dashboard styles (other cards may share them).
    if (!this._ro && typeof ResizeObserver !== "undefined") {
      let lastW = 0;
      this._ro = new ResizeObserver(entries => {
        const w = Math.round(entries[0]?.contentRect?.width || 0);
        if (w !== lastW) { lastW = w; this._fit(); }
      });
    }
    this._ro?.observe(this);
  }

  disconnectedCallback() {
    window.removeEventListener("smartify-energy-row-card-reload", this._onReload);
    this._ro?.disconnect();
  }

  _handleTap(slot) {
    const entityId = slot.entity || slot.entities?.[0] || slot.entity_secondary;
    if (!entityId) return;
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  // show_unit: auto → Einheit ausblenden, sobald ein Wert nicht passt; danach Schrift bis 10px verkleinern.
  _fit() {
    const row = this.shadowRoot?.querySelector?.(".row");
    if (!row || !row.clientWidth) return;
    const s = this._settings;
    const mode = parseShowUnit(s.show_unit);
    const base = clampNum(s.font_size_value, 8, 64, 20);
    const values = [...row.querySelectorAll(".value")];
    if (!values.length) return;
    const setFs = fs => values.forEach(v => { v.style.fontSize = `${fs}px`; });
    const overflow = () => values.some(v => v.scrollWidth > v.clientWidth + 0.5);
    row.classList.toggle("no-unit", mode === false);
    setFs(base);
    if (mode === "auto" && overflow()) row.classList.add("no-unit");
    let fs = base;
    while (fs > 10 && overflow()) { fs -= 1; setFs(fs); }
  }

  _render() {
    const h        = this._hass;
    const resolved = resolveCardConfig(this._config, this._store);
    const c        = resolved.settings;
    const height   = clampNum(c.height, 30, 300, 90);
    const gap      = clampNum(c.gap, 0, 40, 4);
    const fsValue  = clampNum(c.font_size_value, 8, 64, 20);
    const fsName   = clampNum(c.font_size_name, 8, 38, 11);
    const iconSize = clampNum(c.icon_size, 10, 96, 24);
    const fmt      = ["auto","w","kw"].includes(c.value_format) ? c.value_format : "auto";
    const wrap     = c.allow_wrap !== false;
    const vars     = slotStyleVars(c);
    const barPos   = vars.barHeight > 0 ? c.bar_position : "none";
    const slotText = c.text_color === "slot";

    const linked=c.source_mode==="linked";
    const dataSlots=linked
      ?(this._flowConfig?applySlotOverrides(resolveFlowSlots(h,this._flowConfig),this._config.slots):[])
      :resolved.slots;
    const measurements=dataSlots.some(slot=>["pv","home","flow_grid","battery"].includes(slot.mode))
      ?flowMeasurements(h,dataSlots):null;
    const visible=dataSlots.filter(s=>isVisibleWithThreshold(h,s,measurements,c));
    const missingProfile = resolved.explicitProfile && this._store.loaded && !resolved.profile && !Array.isArray(this._config.slots);

    const slotsHTML = visible.map(slot => {
      const bg      = getBackground(h, slot, measurements);
      const bar     = getBar(h, slot, measurements, c.bar_style);
      const parts   = getDisplayParts(h, slot, measurements, fmt);
      const overlay = getBoilerOverlay(h, slot);
      const iconOff = overlay !== "";
      const flip    = (slot.mode === "grid" || slot.mode==="flow_grid") && slotPower(h,slot,measurements)>0
                      ? "scaleX(-1)" : "scaleX(1)";
      const color   = slotText ? safeAccent(slot.color_text, "var(--primary-text-color)") : "var(--primary-text-color)";
      return `
        <div class="slot" data-id="${esc(slot.id)}"
             style="--row-gradient:${bg};--row-bar:${bar};--row-text:${color};height:${height}px;">
          ${barPos!=="none"?`<div class="bar ${barPos}"></div>`:""}
          <div class="icon-wrap">
            <ha-icon icon="${esc(slot.icon)}"
              style="color:${iconOff?"transparent":"currentColor"};transform:${flip};--mdc-icon-size:${iconSize}px;width:${iconSize}px;height:${iconSize}px"></ha-icon>
            ${overlay}
          </div>
          <div class="value" style="font-size:${fsValue}px"><span class="num">${esc(parts.num)}</span>${parts.unit?`<span class="unit">&nbsp;${esc(parts.unit)}</span>`:""}${parts.dir?`<span class="unit dir"> · ${esc(parts.dir)}</span>`:""}</div>
          ${slot.show_name ? `<div class="name" style="font-size:${fsName}px">${esc(slot.label)}</div>` : ""}
        </div>`;
    }).join("");

    const bgLayer = c.theme_style==="gradient"
      ? "var(--row-gradient,var(--ha-card-background,var(--card-background-color,#fff)))"
      : "var(--smartify-energy-row-slot-background,var(--ha-card-background,var(--card-background-color,#fff)))";
    const empty = missingProfile
      ? `Profil „${resolved.name}“ ist nicht gespeichert. Bitte im Karteneditor anlegen.`
      : linked?(this._flowError||(this._flowConfig?"Flow Card verbunden, aber keine verfügbaren Leistungssensoren gefunden":"Lade Flow Card …")):"Bitte Entitäten im Editor konfigurieren.";

    this.shadowRoot.innerHTML = `
      <style>
        :host {display:block;font-family:var(--primary-font-family,inherit);color:var(--primary-text-color);}
        .row { display:flex; flex-wrap:${wrap?"wrap":"nowrap"}; gap:${gap}px; width:100%;
               box-sizing:border-box; line-height:normal; overflow:hidden; }
        .slot { flex:${wrap?"1 1 90px":"1 1 0"}; min-width:${wrap?"65px":"0"};
                color:var(--smartify-energy-row-text-color,var(--row-text));
                border-radius:${vars.radius}; box-shadow:${vars.shadow};
                display:flex; flex-direction:column; align-items:center; justify-content:center;
                cursor:pointer; box-sizing:border-box; position:relative;
                padding:${barPos==="top"?vars.barHeight:0}px 0 ${barPos==="bottom"?vars.barHeight:0}px;
                transition:transform .15s ease; overflow:hidden; isolation:isolate; }
        .slot:before{content:"";position:absolute;inset:0;pointer-events:none;z-index:-1;
          background:${bgLayer};
          opacity:${Math.max(0,Math.min(1,1-(Number(c.background_transparency)||0)/100))};}
        .slot:active { transform:scale(0.96); }
        .bar { position:absolute; left:0; right:0; height:${vars.barHeight}px; background:var(--row-bar); pointer-events:none; }
        .bar.top { top:0; } .bar.bottom { bottom:0; }
        ha-icon { display:block; }
        .icon-wrap { position:relative; display:flex; align-items:center; justify-content:center; }
        .overlay { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
                   pointer-events:none; display:flex; overflow:hidden;
                   background:var(--smartify-energy-row-overlay-background,#444); border-radius:3px; }
        .value { font-weight:bold; line-height:1.1; margin-top:2px; width:100%; box-sizing:border-box;
                 padding:0 3px; text-align:center; white-space:nowrap; overflow:hidden; }
        .row.no-unit .unit { display:none; }
        .name  { margin-top:1px; width:100%; box-sizing:border-box; padding:0 3px; text-align:center;
                 white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
                 ${slotText?"opacity:.75;":"color:var(--smartify-energy-row-text-color,var(--secondary-text-color));"} }
        .empty { font-size:12px; color:var(--secondary-text-color);
                 padding:14px; text-align:center; line-height:normal; }
      </style>
      <div class="row">
        ${visible.length ? slotsHTML : `<div class="empty">${esc(empty)}</div>`}
      </div>`;

    this.shadowRoot.querySelectorAll(".slot").forEach(el => {
      const s = dataSlots.find(s => s.id === el.dataset.id);
      if (s) el.addEventListener("click", () => this._handleTap(s));
    });
    this._fit();
  }

  getCardSize()      { return 1; }
  getLayoutOptions() { return { grid_columns: 12, grid_rows: "auto" }; }
}

if (!customElements.get("smartify-energy-row-card")) customElements.define("smartify-energy-row-card", SmartifyEnergyRowCard);


window.customCards = window.customCards || [];
window.customCards.push({
  type: "smartify-energy-row-card",
  name: "Smartify Energy Row Card",
  description: "Alle Energiewerte in einer Zeile — zentrale Profile, Abweichungen pro Karte.",
  preview: false,
});
