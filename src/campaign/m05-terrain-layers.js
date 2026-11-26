
import {CanvasTexture,BufferAttribute,Mesh,MeshStandardMaterial,MeshLambertMaterial,Vector2} from 'three';
import {pairMaterials} from '../visuals.js';
import {TERRAIN_LAYERS,sampleRoad} from '../../shared/campaign/m05-editor.js';
const tileSize=128,resolution=128;
function clear(tile){
 for(const node of [...tile.children])if(node.userData.m05Layer){node.removeFromParent();node.geometry.dispose();const mat=node.material._highMaterial??node.material;mat.alphaMap?.dispose();mat._lowMaterial?.dispose();mat.dispose();}
}
function baseFor(owner,layer){
 if(layer==='sand')return {map:owner.surfaces.maps['village-sand'],normalMap:owner.surfaces.villageNormals.sand,roughness:.98,color:0xf0dfc3};
 const m=owner.surfaces[layer];return {map:m.map,normalMap:m.normalMap,roughness:m.roughness,color:m.color,metalness:m.metalness};
}
export function prepareTerrainLayers(brushes=[],roads=[]){
 return {brushes,roads:roads.map(r=>({...r,curve:sampleRoad(r.points)}))};
}
export function applyTerrainLayers(owner,tile,prepared){
 clear(tile);
 const x=tile.position.x,z=tile.position.z,half=tileSize/2;
 const strokes=prepared.brushes.filter(p=>Math.abs(p.x-x)<half+p.radius&&Math.abs(p.z-z)<half+p.radius);
 const roads=prepared.roads.filter(r=>r.curve.some(p=>Math.abs(p[0]-x)<half+r.width&&Math.abs(p[1]-z)<half+r.width));
 if(!strokes.length&&!roads.length)return;
 const geometry=tile.geometry;
 for(const [order,layer] of TERRAIN_LAYERS.entries()){
  if(!strokes.some(p=>p.layer===layer)&&!roads.some(r=>r.layer===layer))continue;
  const c=document.createElement('canvas');c.width=c.height=resolution;const ctx=c.getContext('2d');
  ctx.fillStyle='#000';ctx.fillRect(0,0,resolution,resolution);
  const px=v=>(v-x+half)/tileSize*resolution,pz=v=>(v-z+half)/tileSize*resolution;
  // Each stroke is a weight, and painting another material erases the
  // previous weight at the same location. Original sand stays underneath.
  for(const p of strokes){
    const r=p.radius/tileSize*resolution,g=ctx.createRadialGradient(px(p.x),pz(p.z),Math.min(r*.999,p.hardness*r),px(p.x),pz(p.z),r);
    const color=p.layer===layer?'255,255,255':'0,0,0';
    g.addColorStop(0,'rgba('+color+','+p.strength+')');g.addColorStop(1,'rgba('+color+',0)');
    ctx.fillStyle=g;ctx.fillRect(px(p.x)-r,pz(p.z)-r,r*2,r*2);
  }
  for(const r of roads){
    ctx.strokeStyle=r.layer===layer?'#fff':'#000';ctx.lineWidth=r.width/tileSize*resolution;ctx.lineJoin=ctx.lineCap='round';
    ctx.beginPath();r.curve.forEach(([a,b],i)=>i?ctx.lineTo(px(a),pz(b)):ctx.moveTo(px(a),pz(b)));ctx.stroke();
  }
  const alpha=new CanvasTexture(c);alpha.channel=1;
  const source=baseFor(owner,layer),opts={map:source.map,color:source.color,alphaMap:alpha,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2};
  const high=new MeshStandardMaterial({...opts,roughness:source.roughness,metalness:source.metalness??0,normalMap:source.normalMap,normalScale:new Vector2(.6,.6)});
  const low=new MeshLambertMaterial(opts);pairMaterials(high,low);
  // UV1 maps the alpha mask exactly to its tile, UV0 remains world tiled.
  const g=geometry.clone(),p=g.attributes.position,uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){uv[i*2]=(p.getX(i)+half)/tileSize;uv[i*2+1]=(half-p.getZ(i))/tileSize;}
  g.setAttribute('uv1',new BufferAttribute(uv,2));
  const overlay=new Mesh(g,owner.lowQuality?low:high);overlay.name='m05-layer-'+layer;overlay.userData.m05Layer=true;overlay.renderOrder=2+order;overlay.receiveShadow=true;tile.add(overlay);
 }
}
