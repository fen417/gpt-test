import {makeProbeTexture,probeUniforms,giStrength,GI_VERSION,GI_LEVELS} from './gi-probes.js';
import {setWebGlGI} from './webgl-gi.js';
export class IndirectLighting{
  constructor(setMaterial=setWebGlGI){this.setMaterial=setMaterial;this.materials=new Set();this.serial=0;}
  invalidate(){this.dirty=true;}
  // Suspend before enhanced-surface material edits (POM modifies aoNode).
  suspend(){for(const m of this.materials)this.setMaterial(m,null);this.materials.clear();this.staticMaterials=null;this.dirty=true;}
  clear(){this.serial++;this.suspend();this.field?.texture.dispose();this.field=null;this.map=null;this.quality=null;this.pending=false;this.failed=false;this.sourceType=null;this.triangleCount=0;}
  async load(map,serial){
    try{
      const base=new URL('gi-v1/',document.baseURI);
      const manifest=await fetch(new URL('manifest.json',base)).then(r=>{if(!r.ok)throw Error('GI manifest '+r.status);return r.json();});
      const meta=manifest.maps?.[map.id];
      if(manifest.version!==GI_VERSION||!meta||meta.layout!==(map.layoutVersion??0))throw Error('GI layout mismatch '+map.id);
      const data=new Uint8Array(await fetch(new URL(meta.file,base)).then(r=>{if(!r.ok)throw Error('GI field '+r.status);return r.arrayBuffer();}));
      if(serial!==this.serial)return;
      if(meta.sourceType!=='visual-triangles'||!meta.triangles)throw Error('GI does not contain visual geometry '+map.id);
      const field={...meta,data};this.sourceType=meta.sourceType;this.triangleCount=meta.triangles;
      this.field=probeUniforms(field,makeProbeTexture(field));this.dirty=true;this.pending=false;
    }catch(error){if(serial===this.serial){this.pending=false;this.failed=true;console.warn('Indirect lighting unavailable:',map.id,error);}}
  }
  update(owner){
    const quality=owner.graphicsEffects?.gi??'off',level=GI_LEVELS[quality]??0,map=owner.map;
    // Keep the baked field resident through NVG toggles; only its contribution
    // is zero while the authored night-vision lighting owns the image.
    if(!level||!map){
      if(this.map)this.clear();return;
    }
    if(this.map!==map){this.clear();this.map=map;this.pending=true;this.load(map,this.serial);}
    if(!this.field)return;
    const field=this.field;
    if(this.quality!==quality){this.suspend();this.quality=quality;}
    field.strength.value=giStrength(owner.sun,quality,{campaign:owner.presentingCampaign,nightVision:owner.campaignNightVision,hemi:owner.hemiLight.intensity});field.quality.value=level;
    field.sunTint.copy(owner.sun.color).lerp(owner.hemiLight.color,.6).lerp({r:1,g:1,b:1},.32);
    if(field.gpu)field.gpu.strength.value=field.strength.value;
    // Scan only when a map model changes, or periodically to catch new
    // soldiers/vehicles. No ray tracing or material traversal every frame.
    if(!this.dirty&&owner.clock<(this.nextScan??0))return;
    const refreshStatic=this.dirty||this.staticRevision!==owner.staticMaterialRevision||!this.staticMaterials;
    this.dirty=false;this.nextScan=owner.clock+.8;
    const collect=(o,eligible)=>{
      if(!o.isMesh||o.userData.waterReflection||o.userData.waterSurface||o.userData.architecturalSurface==='water'||o.name==='Port water')return;
      for(const m of Array.isArray(o.material)?o.material:[o.material]){
        if(!m||m.transparent||!(m.isMeshStandardMaterial||m.isMeshLambertMaterial)||m.transmission>0||m.userData?.noGI)continue;
        eligible.add(m);
      }
    };
    if(refreshStatic){
      this.staticMaterials=new Set();owner.staticRoot?.traverse(o=>collect(o,this.staticMaterials));this.staticRevision=owner.staticMaterialRevision;
    }
    const eligible=new Set(this.staticMaterials);
    const walk=o=>{if(o===owner.staticRoot)return;collect(o,eligible);for(const c of o.children)walk(c);};walk(owner.scene);
    for(const m of eligible)if(!this.materials.has(m)){this.setMaterial(m,field);this.materials.add(m);}
    // Cached static materials stay patched until map/quality change. Removed
    // dynamic meshes release their patch to avoid retaining disposed rigs.
    for(const material of this.materials)if(!eligible.has(material)){this.setMaterial(material,null);this.materials.delete(material);}
  }
  stats(){return this.map?{map:this.map.id,ready:!!this.field,pending:this.pending,failed:this.failed,materials:this.materials.size,source:this.sourceType,triangles:this.triangleCount,bytes:this.field?.texture.image.data.byteLength??0}:null;}
  dispose(){this.clear();}
}
