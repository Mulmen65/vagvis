/* Local geometry and Leaflet are bundled. OSM tiles are requested only for
   the map the user is viewing, never downloaded for offline distribution. */
(function(){
'use strict';
let map=null,layers={};
const V=window.Vagvis,$=id=>document.getElementById(id),masks=JSON.parse($('embedded-land').textContent);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dispose(){if(map){map.remove();map=null;}layers={};selectedId=null;}
function polygonPath(g,project){return (g.type==='Polygon'?[g.coordinates]:g.coordinates).map(p=>p.map(r=>r.map((x,i)=>(i?'L':'M')+project(x).join(',')).join('')+'Z').join('')).join('');}
function color(x,max){if(x==null)return '#c9d1cb';const t=Math.sqrt(x/Math.max(1,max));return 'rgb('+Math.round(223-208*t)+','+Math.round(235-136*t)+','+Math.round(207-119*t)+')';}
function draw({project,city,level,result,onSelect,fill,tooltip,dashed,fillOpacity,attribution,legend}){
 dispose();const areas=project.areas.filter(a=>a.city===city&&a.level===level),land=project.isDemo?null:masks[city],index=Object.fromEntries((result?.results||[]).filter(x=>x.city===city&&x.level===level).map(x=>[x.id,x])),max=Math.max(1,...Object.values(index).map(x=>x.central?.total||0));
 const status=$('map-status');if(!window.L){drawSVG(areas,land,index,max,onSelect,fill,dashed);if(legend)$('map-surface').insertAdjacentHTML('beforeend','<div class="map-legend">'+legend+'</div>');return;}
 const L=window.L;map=L.map('map-surface',{scrollWheelZoom:false,zoomSnap:.25,preferCanvas:false,attributionControl:false});
 // SVG clipping affects only the display. The original DeSO geometry stays in
 // the calculation engine, including municipal waters and bridge sections.
 const LandSVG=L.SVG.extend({
  _initContainer(){L.SVG.prototype._initContainer.call(this);if(!land)return;
   const ns='http://www.w3.org/2000/svg',defs=document.createElementNS(ns,'defs');this._landClip=document.createElementNS(ns,'clipPath');
   this._clipID='vagvis-land-'+L.Util.stamp(this);this._landClip.setAttribute('id',this._clipID);this._landClip.setAttribute('clipPathUnits','userSpaceOnUse');defs.appendChild(this._landClip);this._container.appendChild(defs);this._rootGroup.setAttribute('clip-path','url(#'+this._clipID+')');
  },
  _update(){L.SVG.prototype._update.call(this);if(!this._map||!this._landClip)return;
   const p=x=>{const a=this._map.latLngToLayerPoint([x[1],x[0]]);return [a.x,a.y];};
   this._landClip.innerHTML=land.features.map(f=>'<path clip-rule="evenodd" fill-rule="evenodd" d="'+polygonPath(f.geometry,p)+'"/>').join('');
  }
 });
 const renderer=new LandSVG({padding:.5}),fc={type:'FeatureCollection',features:areas.map(a=>({type:'Feature',properties:{id:a.id,name:a.name},geometry:a.geometry}))};
 baseWeight=level==='district'?1.4:.7;
 const layer=L.geoJSON(fc,{renderer,style:f=>({color:'#ffffff',weight:baseWeight,opacity:.95,fillColor:fill?fill(f.properties.id):color(index[f.properties.id]?.central?.total,max),fillOpacity:fillOpacity??OPAQUE,dashArray:dashed&&dashed(f.properties.id)?'4 4':null}),onEachFeature(f,l){
  const x=index[f.properties.id];layers[f.properties.id]=l;l.bindTooltip(tooltip?()=>tooltip(f.properties.id):esc(f.properties.name)+(x?.central?' · '+new Intl.NumberFormat('sv-SE',{maximumFractionDigits:0}).format(x.central.total)+' ton CO₂e/år':' · trafik saknas'),{sticky:true,className:'map-tip'});
  l.on('click',()=>onSelect(f.properties.id));
  // Ingen bringToFront vid hovring: att flytta elementet under muspekaren gör att Chrome tappar mouseout, och tooltips blir kvar.
  l.on('mouseover',()=>{if(f.properties.id!==selectedId)l.setStyle({weight:2.2,color:'#0b463a'});});
  l.on('mouseout',()=>{if(f.properties.id!==selectedId)l.setStyle({weight:baseWeight,color:'#ffffff'});});
 }}).addTo(map);
 if(legend){const lc=L.control({position:'bottomright'});lc.onAdd=()=>{const d=L.DomUtil.create('div','map-legend');d.innerHTML=legend;L.DomEvent.disableClickPropagation(d);return d;};lc.addTo(map);}
 const bounds=land?L.geoJSON(land).getBounds():layer.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[15,15]});
 const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,referrerPolicy:'strict-origin-when-cross-origin',attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'});
 const osm=$('map-osm'),localFile=window.location?.protocol==='file:';
 // Med bakgrundskarta är ytorna halvgenomskinliga så att gator, namn och kustlinje syns igenom.
 const surface=$('map-surface'),coastNote=land?'':' Områdena visas med SCB:s gränser, som även omfattar vatten.';
 function opacity(on){if(fillOpacity==null)layer.setStyle({fillOpacity:on?SEE_THROUGH:OPAQUE});surface.classList.toggle('osm-on',on);}
 function refresh(){if(localFile){osm.checked=false;osm.disabled=true;opacity(false);status.textContent='Offlinekarta. För OpenStreetMap: starta appen med Streamlit enligt README. Beräkningen fungerar även direkt från HTML-filen.'+coastNote;return;}
  if(osm.checked){tiles.addTo(map);tiles.bringToBack();opacity(true);status.textContent='OpenStreetMap · bakgrundskartan kräver internet. Områdesytor och beräkning finns lokalt.'+coastNote;}else{map.removeLayer(tiles);opacity(false);status.textContent='Bakgrund avstängd · områdeskartan fungerar utan internet.'+coastNote;}
 }
 let tileFailures=0;tiles.on('tileerror',()=>{tileFailures++;if(tileFailures>2)status.textContent='Bakgrundskartan kunde inte hämtas. Områdeskartan och beräkningen fungerar ändå. Kontrollera internet eller stäng av bakgrunden.';});
 osm.onchange=refresh;refresh();
 const roads=project.roads.filter(r=>r.city===city),roadLayer=L.geoJSON({type:'FeatureCollection',features:roads.map(r=>({type:'Feature',properties:{id:r.id,aadt:r.aadt},geometry:r.geometry}))},{style:f=>({color:f.properties.aadt==null?'#9a7d53':'#cc642d',weight:2,opacity:.8})});
 const show=$('map-roads');show.disabled=!roads.length;show.onchange=()=>{if(show.checked)roadLayer.addTo(map);else map.removeLayer(roadLayer);};
 L.control.attribution({position:'bottomleft',prefix:'<a href="https://leafletjs.com" target="_blank" rel="noopener noreferrer">Leaflet</a>'}).addTo(map).addAttribution(attribution||'Områden: SCB DeSO/RegSO 2025');
 $('map-fit').onclick=()=>map.fitBounds(bounds,{padding:[15,15]});
 setTimeout(()=>map?.invalidateSize(),50);
}
function drawSVG(areas,land,index,max,onSelect,fill,dashed){
 const surface=$('map-surface');surface.innerHTML='<svg id="map-svg" role="img" aria-label="Områdeskarta"></svg>';const svg=$('map-svg');
 const gs=land?land.features.map(f=>f.geometry):areas.map(a=>a.geometry),bs=gs.map(V.bbox),b=[Math.min(...bs.map(x=>x[0])),Math.min(...bs.map(x=>x[1])),Math.max(...bs.map(x=>x[2])),Math.max(...bs.map(x=>x[3]))],cos=Math.cos((b[1]+b[3])/2*Math.PI/180),scale=Math.min(940/((b[2]-b[0])*cos||1),530/(b[3]-b[1]||1)),p=x=>[30+(x[0]-b[0])*cos*scale,30+(b[3]-x[1])*scale];
 svg.setAttribute('viewBox','0 0 1000 590');svg.innerHTML=(land?'<defs><clipPath id="land-fallback">'+land.features.map(f=>'<path clip-rule="evenodd" d="'+polygonPath(f.geometry,p)+'"/>').join('')+'</clipPath></defs>':'')+'<g '+(land?'clip-path="url(#land-fallback)"':'')+'>'+areas.map(a=>'<path d="'+polygonPath(a.geometry,p)+'" fill="'+(fill?fill(a.id):color(index[a.id]?.central?.total,max))+'" fill-rule="evenodd" data-area="'+esc(a.id)+'"'+(dashed&&dashed(a.id)?' stroke-dasharray="4 4"':'')+'/>').join('')+'</g>';
 svg.addEventListener('click',e=>{const a=e.target.closest('[data-area]');if(a)onSelect(a.dataset.area);});
 if($('map-status'))$('map-status').textContent='Lokal områdeskarta · bakgrundskartan kunde inte startas.';
}
let selectedId=null,baseWeight=.7;
const OPAQUE=.85,SEE_THROUGH=.5;
function select(id){selectedId=id;for(const [key,l]of Object.entries(layers)){l.setStyle({weight:key===id?3:baseWeight,color:key===id?'#0b2e28':'#ffffff'});if(key===id)l.bringToFront();}}
window.VagvisMaps={draw,dispose,select,masks,color};
})();
