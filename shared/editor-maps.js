
import registry from './editor-maps.json' with {type:'json'};
import {emptyM05Edits,terrainWithEdits,modelColliders,validateM05Edits} from './campaign/m05-editor.js';
export const EDITOR_GRID={min:-816,cell:4,count:408};
export const FLAT_HEIGHTS=new Float32Array((EDITOR_GRID.count+1)**2);
export const validEditorMapId=id=>typeof id==='string'&&/^editor-[a-f0-9]{16}$/.test(id);
export function validEditorMapConfig(config){return config&&typeof config.name==='string'&&config.name.trim().length>0&&config.name.length<=100&&Number.isInteger(config.size)&&config.size>=128&&config.size<=1024&&config.size%32===0;}
export function sandboxBase(config){
 const a=config.size*.32;
 return {boxes:[],sites:{spawnA:{x:-a,y:0,z:-a},spawnB:{x:a,y:0,z:a}},routes:{},fuelRoutes:{}};
}
export function createEditorSandbox(id,config,data=emptyM05Edits()){
 if(!validEditorMapId(id)||!validEditorMapConfig(config)||validateM05Edits(data).length)throw Error('Invalid editor sandbox '+id);
 const base=sandboxBase(config),terrain=terrainWithEdits(EDITOR_GRID,FLAT_HEIGHTS,data.terrain),size=config.size;
 const spawns=Object.entries(base.sites).map(([key,p])=>{const [x,,z]=data.sites[key]??[p.x,p.y,p.z];return {x,y:terrain.heightAt(x,z),z};});
 return {id,name:config.name,editorSandbox:true,editorData:data,theme:'desert-village',tdmLoadout:'class',size,width:size,depth:size,terrain,roads:[],boxes:data.models.flatMap(modelColliders),surfacePatches:data.paint,editorLayers:data.layers??[],editorRoads:data.roads??[],structures:[],points:[],districts:[],signs:[],landmarks:[],spawns,spawnPoints:spawns.map(p=>[p]),vehicleSpawns:[],navigationCell:3,navigationSize:size,navigationClearance:.66,stepHeight:.38,playArea:{minX:-size/2,maxX:size/2,minZ:-size/2,maxZ:size/2},fogColor:'#c3a483',fogDensity:.00132,sunColor:'#ffe0a9',...data.lighting};
}
export const EDITOR_MAPS=Object.fromEntries(Object.entries(registry.maps).map(([id,entry])=>[id,createEditorSandbox(id,entry.config,entry.data)]));
export const EDITOR_MAP_CONFIGS=Object.fromEntries(Object.entries(registry.maps).map(([id,entry])=>[id,entry.config]));
