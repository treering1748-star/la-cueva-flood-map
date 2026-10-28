/* La Cueva Flood Study – interactive map */
(function(){
'use strict';

// ---------- constants ----------
const BOUNDS = L.latLngBounds([35.85265, -106.66744], [35.88861, -106.63056]); // lidar rectangle
const UTM = '+proj=utm +zone=13 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
const FT = 3.280833333; // US survey ft per m
const WALK = {
  A:{c:'#e41a1c',d:'Gated entrance and existing drainage'},
  B:{c:'#377eb8',d:'Converging water and a possible holding area'},
  C:{c:'#4daf4a',d:'Another rise, the pink marker and a new pattern'},
  D:{c:'#984ea3',d:'Hard channel floor and seepage near the first tent rock'},
  E:{c:'#ff7f00',d:'Boulders, repeated crossings and places to hold water'},
  F:{c:'#a65628',d:'Road cuts and the area nested in the road bend'},
  G:{c:'#f781bf',d:'Cabin entrance and parking-area runoff'},
  H:{c:'#17becf',d:'Bent culvert, road junction and converging channels'},
  I:{c:'#666666',d:'Lower corridor, zone 5 and the slash-pile area'}
};
const SLOPE = [['#1a9850','0–10 %'],['#a6d96a','10–15 %'],['#fee08b','15–25 %'],['#f46d43','25–30 %'],['#a50026','> 30 %']];
const DRAIN = {'0.2-1 ha':['#7fc8ff',1],'1-5 ha':['#2a8cff',1.7],'5-20 ha':['#0050d0',2.5],'>20 ha':['#001f80',3.5]};

// ---------- map ----------
const map = L.map('map', {zoomControl:false, maxZoom:21, minZoom:10, preferCanvas:false});
L.control.zoom({position:'topright'}).addTo(map);
L.control.scale({position:'bottomright', imperial:true, metric:true, maxWidth:160}).addTo(map);
map.createPane('rasters'); map.getPane('rasters').style.zIndex = 250;
map.createPane('lines'); map.getPane('lines').style.zIndex = 420;
map.createPane('points'); map.getPane('points').style.zIndex = 620;

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const el = (tag, attrs={}, html='') => { const e=document.createElement(tag); for(const k in attrs) e.setAttribute(k, attrs[k]); if(html) e.innerHTML=html; return e; };
const fmt = (v, d=0) => v==null||isNaN(v) ? '—' : Number(v).toLocaleString('en-US',{minimumFractionDigits:d, maximumFractionDigits:d});
const getJSON = url => fetch(url).then(r => { if(!r.ok) throw new Error(url+' '+r.status); return r.json(); });
const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---------- basemaps ----------
const bases = {
  'Satellite (Esri)': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom:21, maxNativeZoom:19, attribution:'Imagery © Esri, Maxar, Earthstar Geographics'}),
  'USGS Topo': L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}', {maxZoom:21, maxNativeZoom:16, attribution:'USGS The National Map'}),
  'OpenTopoMap': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {maxZoom:21, maxNativeZoom:17, attribution:'© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)'}),
  'None': L.layerGroup()
};
let currentBase = 'Satellite (Esri)';
bases[currentBase].addTo(map);

// ---------- lidar tile layers (jpg interior / png edge tiles) ----------
let EDGES = new Set();
const LidarLayer = L.TileLayer.extend({
  getTileUrl(c){ const k=`${c.z}/${c.x}/${c.y}`; return `tiles/${this.options.set}/${k}.${EDGES.has(k)?'png':'jpg'}`; }
});
const lidar = (set, opacity) => new LidarLayer('', {set, pane:'rasters', bounds:BOUNDS, minNativeZoom:12, maxNativeZoom:18, maxZoom:21, opacity, attribution:'2024 lidar: NV5 Geospatial for USACE &amp; NPS'});

// ---------- vector styles ----------
function roadLayer(url, style, label){
  return () => getJSON(url).then(g => L.geoJSON(g, {pane:'lines', style, onEachFeature:(f,l)=>{
    const n = label(f.properties); if(n) l.bindTooltip(n, {sticky:true, className:'road-tip'});
  }}));
}
function cased(color, w){ return [{color:'#222', weight:w+2, opacity:.85}, {color, weight:w, opacity:1}]; }
function casedRoads(url, color, w, label){
  return () => getJSON(url).then(g => {
    const grp = L.layerGroup();
    const [a,b] = cased(color,w);
    L.geoJSON(g, {pane:'lines', style:a, interactive:false}).addTo(grp);
    L.geoJSON(g, {pane:'lines', style:b, onEachFeature:(f,l)=>{ const n=label(f.properties); if(n) l.bindTooltip(n,{sticky:true,className:'road-tip'}); }}).addTo(grp);
    return grp;
  });
}
const nm = p => [p.name, p.owner].filter(Boolean).join(' · ');
const fsName = p => `FR ${p.road_id}${p.name?' '+p.name.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase()):''} · ${p.maint_level||''} · ${p.surface||''}`;

// ---------- layer registry ----------
const LAYERS = [
  // rasters
  {id:'terrain', group:'raster', name:'Elevation + hillshade', on:true, opacity:1, sw:'linear-gradient(90deg,#2b83ba,#abdda4,#ffffbf,#fdae61,#d7191c)',
    make:()=>Promise.resolve(lidar('terrain',1)),
    legend:'<span class="sw" style="background:linear-gradient(90deg,#2b83ba,#abdda4,#ffffbf,#fdae61,#d7191c)"></span><span>low (7,320 ft) → high (8,740 ft)</span>'},
  {id:'hillshade', group:'raster', name:'Hillshade 0.25 m', on:false, opacity:1, sw:'linear-gradient(90deg,#333,#eee)', make:()=>Promise.resolve(lidar('hillshade',1))},
  {id:'slope', group:'raster', name:'Slope class', on:false, opacity:.7, sw:'linear-gradient(90deg,#1a9850,#a6d96a,#fee08b,#f46d43,#a50026)', make:()=>Promise.resolve(lidar('slope',.7)),
    legend:SLOPE.map(s=>`<span class="sw" style="background:${s[0]}"></span><span>${s[1]}</span>`).join('')},
  // vectors
  {id:'photos', group:'vector', name:'Field photos (27 Oct 2026)', on:true, swClass:'dot', sw:'#e41a1c', make:()=>photosLayer()},
  {id:'sfnf', group:'vector', name:'Santa Fe National Forest boundary', on:true, swClass:'line', sw:'#1a7a1a',
    make:()=>getJSON('data/sfnf_boundary.geojson').then(g=>L.geoJSON(g,{pane:'lines',style:{color:'#1a7a1a',weight:3,dashArray:'9 6',opacity:.95},onEachFeature:(f,l)=>l.bindTooltip('Santa Fe National Forest boundary (National Forest / private land)',{sticky:true,className:'road-tip'})})),
    legend:'<span class="ln" style="border-top:3px dashed #1a7a1a"></span><span>National Forest System land / private land</span>'},
  {id:'ownership', group:'vector', name:'Land ownership', on:false, swClass:'', sw:'linear-gradient(90deg,rgba(120,190,120,.6) 50%,rgba(240,200,140,.6) 50%)',
    make:()=>getJSON('data/ownership.geojson').then(g=>L.geoJSON(g,{pane:'lines',style:f=>({stroke:false,fillColor:f.properties.owner_code==='FS'?'#78be78':'#f0c88c',fillOpacity:.35}),onEachFeature:(f,l)=>l.bindTooltip(`${f.properties.owner} · ${fmt(f.properties.area_ac,0)} ac in map area`,{sticky:true,className:'road-tip'})})),
    legend:'<span class="sw" style="background:rgba(120,190,120,.6)"></span><span>National Forest (USFS)</span><span class="sw" style="background:rgba(240,200,140,.6)"></span><span>Private</span>'},
  {id:'bridges', group:'vector', name:'Bridges (NMDOT)', on:true, swClass:'dot', sw:'#111',
    make:()=>getJSON('data/bridges.geojson').then(g=>L.geoJSON(g,{pane:'points',pointToLayer:(f,ll)=>L.marker(ll,{icon:L.divIcon({className:'',html:'<div style="width:12px;height:12px;background:#111;border:2px solid #fff;box-shadow:0 0 2px #000"></div>',iconSize:[12,12],iconAnchor:[6,6]})}),
      onEachFeature:(f,l)=>{const p=f.properties; l.bindPopup(`<b>Bridge ${esc(p.bin)}</b><br>${esc(p.route_id)}${p.milepost?' · MP '+p.milepost:''}<br>Owner: ${esc(p.owner)}<br>Length: ${fmt(p.length_ft,0)} ft · Condition: ${esc(p.condition)}`);}}))},
  {id:'state', group:'vector', name:'State highways', on:true, swClass:'line', sw:'#e62828', make:casedRoads('data/roads_state.geojson','#e62828',3.5,nm)},
  {id:'county', group:'vector', name:'County roads', on:true, swClass:'line', sw:'#ffaa00', make:casedRoads('data/roads_county.geojson','#ffaa00',2.6,nm)},
  {id:'municipal', group:'vector', name:'Municipal roads (per NMDOT)', on:true, swClass:'line', sw:'#ffeb78', make:casedRoads('data/roads_municipal.geojson','#ffeb78',2,nm)},
  {id:'private', group:'vector', name:'Private roads', on:true, swClass:'line', sw:'#8a8a8a', make:roadLayer('data/roads_private.geojson',{color:'#6e6e6e',weight:2,dashArray:'5 4'},nm)},
  {id:'fs', group:'vector', name:'Forest Service roads', on:true, swClass:'line', sw:'#8a5a1e',
    make:roadLayer('data/roads_fs.geojson', f=>{const m=(f.properties.maint_level||'')[0]; return m==='2'?{color:'#78501e',weight:2,dashArray:'6 4'}:m==='3'?{color:'#aa7832',weight:2.6}:{color:'#78501e',weight:3.2};}, fsName),
    legend:'<span class="ln" style="border-top:3px dashed #78501e"></span><span>Level 2 – high clearance</span><span class="ln" style="border-color:#aa7832"></span><span>Level 3 – passenger car</span><span class="ln" style="border-color:#78501e;border-top-width:4px"></span><span>Level 4 – paved / moderate</span>'},
  {id:'drainage', group:'vector', name:'Drainage lines (D8)', on:false, swClass:'line', sw:'#2a8cff',
    make:()=>getJSON('data/drainage.geojson').then(g=>L.geoJSON(g,{pane:'lines',style:f=>{const s=DRAIN[f.properties.cls]||['#2a8cff',1];return {color:s[0],weight:s[1],opacity:.95};},
      onEachFeature:(f,l)=>l.bindTooltip(`Contributing area ≈ ${fmt(f.properties.contrib_ha,1)} ha (${fmt(f.properties.contrib_ha*2.471,1)} ac)`,{sticky:true,className:'road-tip'})})),
    legend:Object.entries(DRAIN).map(([k,v])=>`<span class="ln" style="border-color:${v[0]};border-top-width:${Math.max(2,v[1])}px"></span><span>${k} contributing area</span>`).join('')},
  {id:'c40', group:'vector', name:'Contours 40 ft', on:false, swClass:'line', sw:'#46230a',
    make:()=>getJSON('data/contours_40ft.geojson').then(g=>L.geoJSON(g,{pane:'lines',style:{color:'#46230a',weight:1.5,opacity:.9},onEachFeature:(f,l)=>l.bindTooltip(`${fmt(f.properties.ELEV_FT,0)} ft`,{sticky:true,className:'road-tip'})}))},
  {id:'c20', group:'vector', name:'Contours 20 ft', on:false, swClass:'line', sw:'#7a4a1e',
    make:()=>getJSON('data/contours_20ft.geojson').then(g=>L.geoJSON(g,{pane:'lines',style:{color:'#7a4a1e',weight:.8,opacity:.8},onEachFeature:(f,l)=>l.bindTooltip(`${fmt(f.properties.ELEV_FT,0)} ft`,{sticky:true,className:'road-tip'})}))}
];
const live = {}; // id -> leaflet layer (loaded)

function setLayer(def, on){
  def.on = on;
  if(on){
    const add = lyr => { live[def.id]=lyr; if(def.on) lyr.addTo(map); if(def.opacity!=null && lyr.setOpacity) lyr.setOpacity(def.opacity); };
    if(live[def.id]) add(live[def.id]); else def.make().then(add).catch(e=>console.error(e));
  } else if(live[def.id]) map.removeLayer(live[def.id]);
  saveHash();
}

function buildLayerPanel(){
  const bl = $('#baseList');
  Object.keys(bases).forEach(name=>{
    const it = el('label',{class:'item'}, `<input type="radio" name="base" ${name===currentBase?'checked':''}><span class="name">${name}</span>`);
    it.querySelector('input').addEventListener('change',()=>{ map.removeLayer(bases[currentBase]); currentBase=name; bases[name].addTo(map); saveHash(); });
    bl.appendChild(it);
  });
  LAYERS.forEach(def=>{
    const list = def.group==='raster' ? $('#rasterList') : $('#vectorList');
    const swStyle = def.swClass==='line' ? `border-top-color:${def.sw}` : `background:${def.sw}`;
    const it = el('label',{class:'item'}, `<input type="checkbox" data-id="${def.id}" ${def.on?'checked':''}><span class="sw ${def.swClass||''}" style="${swStyle}"></span><span class="name">${def.name}</span>`);
    list.appendChild(it);
    let extra = null;
    if(def.opacity!=null){
      const r = el('input',{type:'range',min:0,max:1,step:.05,value:def.opacity,class:'opacity','aria-label':def.name+' opacity',title:'Opacity'});
      r.addEventListener('input',()=>{ def.opacity=+r.value; if(live[def.id]) live[def.id].setOpacity(def.opacity); });
      list.appendChild(r); extra=[r];
    }
    let lg=null;
    if(def.legend){ lg = el('div',{class:'legend'}, def.legend); list.appendChild(lg); }
    const vis = () => { [...(extra||[]), lg].forEach(x=>{ if(x) x.style.display = def.on?'':'none'; }); };
    it.querySelector('input').addEventListener('change',e=>{ setLayer(def, e.target.checked); vis(); });
    def._sync = () => { it.querySelector('input').checked = def.on; vis(); };
    vis();
  });
}

// ---------- photos ----------
let PHOTOS = [], AVAILABLE = new Set(), photoLayer = null, markers = {};
const walkOn = Object.fromEntries(Object.keys(WALK).map(k=>[k,true]));
let keyOnly = false;

function photoIcon(p){
  const c = WALK[p.walk_group]?.c || '#444';
  const rot = p.image_dir_deg==null ? '' : `<g transform="rotate(${p.image_dir_deg} 13 13)"><path d="M13 0 L18.5 9 L13 7 L7.5 9 Z" fill="${c}" stroke="#fff" stroke-width="1"/></g>`;
  const ring = '';
  return L.divIcon({className:'ph', iconSize:[26,26], iconAnchor:[13,13],
    html:`<svg width="26" height="26" viewBox="0 0 26 26">${rot}<circle cx="13" cy="13" r="5.5" fill="${c}" stroke="#fff" stroke-width="1.5"/>${ring}</svg>`});
}
function photosLayer(){
  return Promise.all([getJSON('data/photos.geojson'), getJSON('photos/available.json').catch(()=>[])]).then(([g,av])=>{
    AVAILABLE = new Set(av);
    PHOTOS = g.features.map(f=>Object.assign({}, f.properties, {lat:f.geometry.coordinates[1], lng:f.geometry.coordinates[0]})).sort((a,b)=>a.photo_id.localeCompare(b.photo_id));
    photoLayer = L.layerGroup();
    PHOTOS.forEach(p=>{
      const m = L.marker([p.lat,p.lng], {icon:photoIcon(p), pane:'points', title:`Photo ${p.photo_id}`, riseOnHover:true, keyboard:true});
      m.bindTooltip(p.photo_id, {permanent:true, direction:'right', offset:[8,0], className:'ph-label'});
      m.on('click', ()=>openViewer(p.photo_id));
      markers[p.photo_id] = m;
    });
    applyPhotoFilter();
    buildWalkPanel();
    updateLabels();
    const h = parseHash(); if(h.photo) openViewer(h.photo, true);
    return photoLayer;
  });
}
function visiblePhotos(){ return PHOTOS.filter(p => walkOn[p.walk_group] && (!keyOnly || p.key_photo==='Yes')); }
function applyPhotoFilter(){
  if(!photoLayer) return;
  photoLayer.clearLayers();
  const vis = visiblePhotos();
  vis.forEach(p=>photoLayer.addLayer(markers[p.photo_id]));
  $('#photoCount').textContent = `${vis.length} of ${PHOTOS.length} photos shown`;
  document.querySelectorAll('.walk input').forEach(i=>{ i.checked = walkOn[i.dataset.g]; });
}
function buildWalkPanel(){
  const wl = $('#walkList'); wl.innerHTML='';
  Object.entries(WALK).forEach(([g,w])=>{
    const n = PHOTOS.filter(p=>p.walk_group===g); const ids = n.map(p=>p.photo_id);
    const it = el('label',{class:'item walk'}, `<input type="checkbox" data-g="${g}" checked><span class="sw dot" style="background:${w.c}"></span><span class="name"><b>Walk ${g}</b> <span class="count">· ${n.length===1?'photo':'photos'} ${ids.join(', ')}</span><span class="desc">${w.d}</span></span>`);
    it.querySelector('input').addEventListener('change',e=>{ walkOn[g]=e.target.checked; applyPhotoFilter(); });
    wl.appendChild(it);
  });
}
function updateLabels(){ const z = map.getZoom(); Object.values(markers).forEach(m=>{ const t=m.getTooltip(); if(t){ const e=t.getElement(); if(e) e.style.display = z>=14?'':'none'; }}); }
map.on('zoomend', updateLabels); map.on('layeradd', ()=>setTimeout(updateLabels,0));

// viewer
let vIdx = -1, vList = [];
function openViewer(id, fly){
  id = String(id).padStart(3,'0');
  const p = PHOTOS.find(x=>x.photo_id===id); if(!p) return;
  vList = visiblePhotos(); if(!vList.includes(p)) vList = PHOTOS;
  vIdx = vList.indexOf(p);
  renderViewer(p);
  $('#viewer').hidden = false;
  if(fly) map.setView([p.lat,p.lng], Math.max(map.getZoom(),18));
  currentPhoto = id; saveHash();
}
let currentPhoto = null;
function renderViewer(p){
  const w = WALK[p.walk_group] || {c:'#444',d:''};
  $('#vTitle').textContent = `Photo ${p.photo_id} · ${p.filename}`;
  const has = AVAILABLE.has(p.photo_id);
  const src = `photos/web/${p.photo_id}.jpg`;
  $('#vImgWrap').innerHTML = has
    ? `<a href="${src}" target="_blank" rel="noopener" title="Open full size in a new window"><img src="${src}" alt="Field photo ${p.photo_id}, walk ${p.walk_group}"></a>`
    : `<div class="noimg"><b>Image not yet posted</b><br>This photo's location and camera data are shown here; the image will be added when the full photo set is uploaded.</div>`;
  const dir = p.image_dir_deg==null ? '—' : `${fmt(p.image_dir_deg,0)}° (${compass(p.image_dir_deg)})`;
  $('#vMeta').innerHTML = `
    <span class="walkbadge" style="background:${w.c}">Walk ${esc(p.walk_group)}</span>
    <p style="margin:6px 0 0">${esc(w.d)}</p>
    <dl>
      <dt>Time</dt><dd>${esc(p.local_time_mdt)} MDT</dd>
      <dt>Facing</dt><dd>${dir}</dd>
      <dt>Location</dt><dd>${fmt(p.lat,6)}, ${fmt(p.lng,6)}</dd>
      <dt>GPS error</dt><dd>± ${fmt(p.horiz_error_m,1)} m (± ${fmt(p.horiz_error_m*FT,0)} ft)</dd>
      <dt>Ground elev.</dt><dd>${fmt(p.dem_elev_m*FT,0)} ft (${fmt(p.dem_elev_m,1)} m, lidar)</dd>
      <dt>Camera alt.</dt><dd>${fmt(p.altitude_m,1)} m (GPS)</dd>
      <dt>Key photo</dt><dd>${p.key_photo==='Yes'?'Yes (16-photo starter set)':'No'}</dd>
      ${p.sha256?`<dt>SHA-256</dt><dd style="font-size:11px">${esc(p.sha256)}</dd>`:''}
    </dl>
    <div class="actions">
      ${has?`<a class="btn small" href="${src}" target="_blank" rel="noopener">Open full size ↗</a>`:''}
      <button class="btn small" id="vZoom">Show on map</button>
      <button class="btn small" id="vLink">Copy link</button>
    </div>
    <p class="hint">${vIdx+1} of ${vList.length} · use ← → keys to step through the photos in walk order</p>`;
  $('#vZoom').onclick = ()=>{ closeViewer(); map.setView([p.lat,p.lng], 19); markers[p.photo_id].openTooltip(); };
  $('#vLink').onclick = ()=>{ copyText(location.href); $('#vLink').textContent='Copied'; };
}
function compass(d){ return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((d%360)+360)%360/22.5)%16]; }
function step(k){ if(vIdx<0) return; vIdx = (vIdx+k+vList.length)%vList.length; const p=vList[vIdx]; renderViewer(p); currentPhoto=p.photo_id; saveHash(); if(!map.getBounds().contains([p.lat,p.lng])) map.panTo([p.lat,p.lng]); }
function closeViewer(){ $('#viewer').hidden = true; currentPhoto=null; saveHash(); }
$('#vPrev').onclick=()=>step(-1); $('#vNext').onclick=()=>step(1); $('#vClose').onclick=closeViewer;
$('#viewer').addEventListener('click', e=>{ if(e.target.id==='viewer') closeViewer(); });
document.addEventListener('keydown', e=>{
  if($('#viewer').hidden) { if(e.key==='Escape') cancelTool(); return; }
  if(e.key==='ArrowLeft') step(-1); else if(e.key==='ArrowRight') step(1); else if(e.key==='Escape') closeViewer();
});
$('#photoGo').onclick = ()=>{ const v=$('#photoSearch').value.trim(); if(v) openViewer(v, true); };
$('#photoSearch').addEventListener('keydown', e=>{ if(e.key==='Enter') $('#photoGo').click(); });
$('#walkAll').onclick=()=>{ Object.keys(walkOn).forEach(k=>walkOn[k]=true); applyPhotoFilter(); };
$('#walkNone').onclick=()=>{ Object.keys(walkOn).forEach(k=>walkOn[k]=false); applyPhotoFilter(); };

// ---------- DEM (2 m grid) ----------
let DEM = null, demPromise = null;
function loadDem(){
  if(!demPromise) demPromise = Promise.all([getJSON('data/dem_2m.json'), fetch('data/dem_2m.u16').then(r=>r.arrayBuffer())]).then(([h,buf])=>{ DEM = Object.assign(h,{a:new Uint16Array(buf)}); return DEM; });
  return demPromise;
}
const toUTM = ll => proj4('WGS84', UTM, [ll.lng, ll.lat]);
function demAt(x, y){ // bilinear, metres
  const d=DEM, fx=(x-d.x0)/d.res-.5, fy=(d.y0-y)/d.res-.5;
  const i=Math.floor(fx), j=Math.floor(fy); if(i<0||j<0||i>=d.width-1||j>=d.height-1) return null;
  const g=(ii,jj)=>{const v=d.a[jj*d.width+ii]; return v===d.nodata?NaN:d.base_m+v*d.scale;};
  const tx=fx-i, ty=fy-j;
  const v=g(i,j)*(1-tx)*(1-ty)+g(i+1,j)*tx*(1-ty)+g(i,j+1)*(1-tx)*ty+g(i+1,j+1)*tx*ty;
  return isNaN(v)?null:v;
}
function slopeAt(x,y){ const h=2; const a=demAt(x+h,y),b=demAt(x-h,y),c=demAt(x,y+h),e=demAt(x,y-h); if([a,b,c,e].some(v=>v==null)) return null; return Math.hypot((a-b)/(2*h),(c-e)/(2*h))*100; }
const slopeClass = s => s==null?'—':s<10?SLOPE[0][1]:s<15?SLOPE[1][1]:s<25?SLOPE[2][1]:s<30?SLOPE[3][1]:SLOPE[4][1];

// ---------- tools ----------
let tool = null, pts = [], drawLayer = L.layerGroup().addTo(map), tmpLine = null, hoverMk = null;
document.querySelectorAll('.tool').forEach(b=>b.addEventListener('click',()=>{
  const t=b.dataset.tool; if(tool===t){ cancelTool(); return; }
  cancelTool(); tool=t; b.classList.add('active'); map.doubleClickZoom.disable(); map.getContainer().style.cursor='crosshair';
  const msg={info:'Tap the map for ground elevation and slope.',profile:'Tap points along your line; double-tap (or press Finish) to draw the profile.',distance:'Tap points; double-tap or Finish to end.',area:'Tap corners; double-tap or Finish to close.'}[t];
  $('#toolOut').innerHTML = msg + (t!=='info'?' <button class="btn small" id="finishBtn">Finish</button>':'');
  const f=$('#finishBtn'); if(f) f.onclick=finishTool;
  if(t==='info'||t==='profile') loadDem();
}));
function cancelTool(){ tool=null; pts=[]; tmpLine=null; document.querySelectorAll('.tool').forEach(b=>b.classList.remove('active')); map.doubleClickZoom.enable(); map.getContainer().style.cursor=''; }
$('#clearBtn').onclick=()=>{ drawLayer.clearLayers(); $('#profileBox').hidden=true; $('#toolOut').textContent=''; cancelTool(); };

map.on('click', e=>{
  if(!tool) return;
  if(tool==='info'){
    loadDem().then(()=>{
      const [x,y]=toUTM(e.latlng); const z=demAt(x,y), s=slopeAt(x,y);
      const html = z==null ? 'Outside the lidar area.' : `<b>${fmt(z*FT,0)} ft</b> (${fmt(z,1)} m)<br>Slope ${fmt(s,0)} % · ${slopeClass(s)}`;
      L.popup().setLatLng(e.latlng).setContent(html).openOn(map);
      $('#toolOut').innerHTML = 'Spot elevation: '+html.replace('<br>',' · ');
    });
    return;
  }
  pts.push(e.latlng);
  L.circleMarker(e.latlng,{radius:3,color:'#000',fillColor:'#fff',fillOpacity:1,weight:1.5,pane:'points'}).addTo(drawLayer);
  if(tmpLine) drawLayer.removeLayer(tmpLine);
  tmpLine = (tool==='area'?L.polygon(pts,{color:'#d11',weight:2,fillOpacity:.12}):L.polyline(pts,{color:'#d11',weight:2.5,dashArray:tool==='profile'?null:'6 4'})).addTo(drawLayer);
  liveMeasure();
});
map.on('dblclick', e=>{ if(tool && tool!=='info'){ L.DomEvent.stop(e); finishTool(); } });

function lineLen(p){ let d=0; for(let i=1;i<p.length;i++) d+=p[i-1].distanceTo(p[i]); return d; }
function polyArea(p){ const u=p.map(toUTM); let a=0; for(let i=0;i<u.length;i++){ const [x1,y1]=u[i],[x2,y2]=u[(i+1)%u.length]; a+=x1*y2-x2*y1; } return Math.abs(a/2); }
function lenTxt(m){ const ft=m*FT; return ft<5280?`${fmt(ft,0)} ft (${fmt(m,0)} m)`:`${fmt(ft/5280,2)} mi (${fmt(m/1000,2)} km)`; }
function liveMeasure(){
  if(tool==='distance') $('#toolOut').innerHTML = `Distance: <b>${lenTxt(lineLen(pts))}</b> <button class="btn small" id="finishBtn">Finish</button>`;
  else if(tool==='area' && pts.length>2){ const a=polyArea(pts); $('#toolOut').innerHTML = `Area: <b>${fmt(a/4046.873,2)} ac</b> (${fmt(a/1e4,2)} ha) · perimeter ${lenTxt(lineLen([...pts,pts[0]]))} <button class="btn small" id="finishBtn">Finish</button>`; }
  else if(tool==='profile') $('#toolOut').innerHTML = `Profile line: ${lenTxt(lineLen(pts))} <button class="btn small" id="finishBtn">Finish</button>`;
  const f=$('#finishBtn'); if(f) f.onclick=finishTool;
}
function finishTool(){
  const t=tool, p=pts.slice();
  if(t==='profile' && p.length>1) loadDem().then(()=>drawProfile(p));
  if(t==='distance' && p.length>1) $('#toolOut').innerHTML = `Distance: <b>${lenTxt(lineLen(p))}</b>`;
  if(t==='area' && p.length>2){ const a=polyArea(p); $('#toolOut').innerHTML=`Area: <b>${fmt(a/4046.873,2)} ac</b> (${fmt(a/1e4,2)} ha)`; }
  cancelTool();
}

function drawProfile(p){
  const u=p.map(toUTM), S=[]; let dist=0;
  for(let i=1;i<u.length;i++){
    const [x0,y0]=u[i-1],[x1,y1]=u[i], L0=Math.hypot(x1-x0,y1-y0), n=Math.max(1,Math.ceil(L0/2));
    for(let k=(i===1?0:1);k<=n;k++){ const t=k/n, x=x0+(x1-x0)*t, y=y0+(y1-y0)*t; S.push({d:dist+L0*t, z:demAt(x,y), x, y}); }
    dist+=L0;
  }
  const good=S.filter(s=>s.z!=null); if(good.length<2){ $('#toolOut').textContent='Profile line is outside the lidar area.'; return; }
  const zs=good.map(s=>s.z), zmin=Math.min(...zs), zmax=Math.max(...zs);
  let gain=0, loss=0, maxg=0;
  for(let i=1;i<good.length;i++){ const dz=good[i].z-good[i-1].z; if(dz>0) gain+=dz; else loss-=dz; }
  for(let i=0;i<good.length;i++){ let j=i; while(j<good.length-1 && good[j].d-good[i].d<10) j++; if(good[j].d-good[i].d>=9) maxg=Math.max(maxg, Math.abs(good[j].z-good[i].z)/(good[j].d-good[i].d)*100); }
  const W=300,H=150,ml=42,mr=8,mt=8,mb=24, sx=d=>ml+(d/dist)*(W-ml-mr), pad=(zmax-zmin)*.08||2, z0=zmin-pad, z1=zmax+pad, sy=z=>mt+(1-(z-z0)/(z1-z0))*(H-mt-mb);
  const path=good.map((s,i)=>`${i?'L':'M'}${sx(s.d).toFixed(1)},${sy(s.z).toFixed(1)}`).join('');
  const area=path+`L${sx(good[good.length-1].d)},${H-mb}L${sx(good[0].d)},${H-mb}Z`;
  const ticks=[0,.5,1].map(f=>z0+(z1-z0)*f);
  const svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Elevation profile">
    <path d="${area}" fill="rgba(138,75,22,.15)"/><path d="${path}" fill="none" stroke="#8a4b16" stroke-width="1.6"/>
    ${ticks.map(z=>`<line x1="${ml}" x2="${W-mr}" y1="${sy(z)}" y2="${sy(z)}" stroke="currentColor" stroke-opacity=".12"/><text x="${ml-4}" y="${sy(z)+3}" font-size="9" text-anchor="end" fill="currentColor" fill-opacity=".7">${fmt(z*FT,0)}</text>`).join('')}
    <text x="${ml}" y="${H-6}" font-size="9" fill="currentColor" fill-opacity=".7">0</text>
    <text x="${W-mr}" y="${H-6}" font-size="9" text-anchor="end" fill="currentColor" fill-opacity=".7">${fmt(dist*FT,0)} ft</text>
    <text x="4" y="${mt+6}" font-size="9" fill="currentColor" fill-opacity=".7">ft</text>
    <line id="pfCursor" x1="0" x2="0" y1="${mt}" y2="${H-mb}" stroke="#d11" stroke-width="1" visibility="hidden"/>
    <rect id="pfHit" x="${ml}" y="${mt}" width="${W-ml-mr}" height="${H-mt-mb}" fill="transparent"/></svg>`;
  const box=$('#profileBox'); box.hidden=false;
  box.innerHTML = svg + `<div class="stats">Length ${lenTxt(dist)} · ${fmt(zmin*FT,0)}–${fmt(zmax*FT,0)} ft · climb ${fmt(gain*FT,0)} ft, descent ${fmt(loss*FT,0)} ft · average grade ${fmt(Math.abs(good[good.length-1].z-good[0].z)/dist*100,1)} % · steepest 10 m ${fmt(maxg,0)} %</div>`;
  $('#toolOut').textContent='Elevation profile (hover the chart to see the spot on the map):';
  const hit=box.querySelector('#pfHit'), cur=box.querySelector('#pfCursor'), svgEl=box.querySelector('svg');
  const move = ev => {
    const r=svgEl.getBoundingClientRect(), cx=((ev.touches?ev.touches[0].clientX:ev.clientX)-r.left)/r.width*W;
    const d=Math.max(0,Math.min(dist,(cx-ml)/(W-ml-mr)*dist)); let best=good[0]; for(const s of good) if(Math.abs(s.d-d)<Math.abs(best.d-d)) best=s;
    cur.setAttribute('x1',sx(best.d)); cur.setAttribute('x2',sx(best.d)); cur.setAttribute('visibility','visible');
    const ll=proj4(UTM,'WGS84',[best.x,best.y]);
    if(!hoverMk) hoverMk=L.circleMarker([ll[1],ll[0]],{radius:6,color:'#d11',weight:2,fillColor:'#fff',fillOpacity:1,pane:'points'}).addTo(drawLayer); else hoverMk.setLatLng([ll[1],ll[0]]);
    hoverMk.bindTooltip(`${fmt(best.z*FT,0)} ft · ${fmt(best.d*FT,0)} ft along`).openTooltip();
  };
  hit.addEventListener('mousemove',move); hit.addEventListener('touchmove',move,{passive:true});
  hit.addEventListener('mouseleave',()=>{ cur.setAttribute('visibility','hidden'); if(hoverMk){ drawLayer.removeLayer(hoverMk); hoverMk=null; } });
}

// ---------- geolocation ----------
let locOn=false, locMk=null, locCirc=null, firstFix=true;
$('#locateBtn').onclick=()=>{
  if(locOn){ map.stopLocate(); locOn=false; if(locMk){drawLayer.removeLayer(locMk);drawLayer.removeLayer(locCirc);locMk=null;} $('#locateBtn').textContent='◎ Show my location'; return; }
  locOn=true; firstFix=true; $('#locateBtn').textContent='◉ Stop tracking';
  map.locate({watch:true, enableHighAccuracy:true, maximumAge:5000});
};
map.on('locationfound', e=>{
  if(!locMk){ locCirc=L.circle(e.latlng,{radius:e.accuracy,color:'#1a73e8',weight:1,fillOpacity:.12,interactive:false}).addTo(drawLayer); locMk=L.circleMarker(e.latlng,{radius:7,color:'#fff',weight:2,fillColor:'#1a73e8',fillOpacity:1,pane:'points'}).addTo(drawLayer); }
  else { locMk.setLatLng(e.latlng); locCirc.setLatLng(e.latlng).setRadius(e.accuracy); }
  locMk.bindTooltip(`You are here (± ${fmt(e.accuracy*FT,0)} ft)`);
  if(firstFix){ firstFix=false; if(BOUNDS.pad(.5).contains(e.latlng)) map.setView(e.latlng, Math.max(map.getZoom(),17)); else $('#toolOut').textContent='Your location is outside the study area.'; }
});
map.on('locationerror', e=>{ $('#toolOut').textContent='Location unavailable: '+e.message; locOn=false; $('#locateBtn').textContent='◎ Show my location'; });

// ---------- hash / sharing ----------
function parseHash(){ const o={}; location.hash.replace(/^#/,'').split('&').forEach(kv=>{ const [k,v]=kv.split('='); if(k) o[k]=decodeURIComponent(v||''); }); return o; }
let hashTimer=null;
function saveHash(){
  clearTimeout(hashTimer); hashTimer=setTimeout(()=>{
    const c=map.getCenter(); const on=LAYERS.filter(l=>l.on).map(l=>l.id).join(',');
    let h=`map=${map.getZoom()}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}&base=${encodeURIComponent(currentBase)}&layers=${on}`;
    if(currentPhoto) h+=`&photo=${currentPhoto}`;
    history.replaceState(null,'','#'+h);
  },150);
}
map.on('moveend', saveHash);
function copyText(t){ if(navigator.clipboard) navigator.clipboard.writeText(t).catch(()=>{}); }
$('#shareBtn').onclick=()=>{ saveHash(); setTimeout(()=>{ copyText(location.href); $('#shareMsg').textContent='Link copied. It opens this view, layers and photo.'; },200); };

// ---------- panel / tabs ----------
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===t));
  document.querySelectorAll('.tabpane').forEach(p=>p.classList.toggle('active',p.id==='tab-'+t.dataset.tab));
}));
$('#panelToggle').onclick=()=>{ $('#panel').classList.add('collapsed'); $('#panelOpen').hidden=false; };
$('#panelOpen').onclick=()=>{ $('#panel').classList.remove('collapsed'); $('#panelOpen').hidden=true; };
if(window.innerWidth<760){ $('#panel').classList.add('collapsed'); $('#panelOpen').hidden=false; }

// ---------- init ----------
const h = parseHash();
if(h.base && bases[h.base]){ map.removeLayer(bases[currentBase]); currentBase=h.base; bases[currentBase].addTo(map); }
if(h.layers!=null){ const s=new Set(h.layers.split(',')); LAYERS.forEach(l=>l.on=s.has(l.id)); }
if(h.map){ const [z,la,ln]=h.map.split('/').map(Number); map.setView([la,ln],z); } else map.fitBounds(BOUNDS.pad(-.05));
getJSON('data/edge_tiles.json').then(a=>{ EDGES=new Set(a); }).catch(()=>{}).finally(()=>{
  buildLayerPanel();
  LAYERS.forEach(def=>{ if(def.on){ def.on=false; setLayer(def,true); def.on=true; } });
});
})();
