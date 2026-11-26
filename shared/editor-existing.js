
import {BASE_MAPS,MAP_EDITS} from './world.js';
import {applyMapEdits,validMapEdits,emptyMapEdits} from './map-edits.js';
import {modelColliders} from './campaign/m05-editor.js';
import {EDITOR_TEMPLATES} from './editor-map-config.js';
export const flatEditorTerrain={cell:4,heightAt:()=>0,raycast(o,d,max){const t=d.y<0?-o.y/d.y:Infinity;return t>=0&&t<=max?t:Infinity;}};
export function combinedLegacyEdits(source,data){
 const base=MAP_EDITS[source],extra=data.legacyEdits??emptyMapEdits(),moves={...base.moves,...extra.moves},removed=[...new Set([...base.removed,...extra.removed])];
 for(const k of removed)delete moves[k];
 return {version:1,moves,added:{...base.added,...extra.added},removed};
}
export function validateExistingEdits(config,data){
 if(!Object.hasOwn(EDITOR_TEMPLATES,config.source))return ['Неизвестный шаблон'];
 const e=data.legacyEdits;
 if(e!==undefined&&(!e||e.version!==1||!e.moves||!e.added||!Array.isArray(e.removed)||Object.keys(e.added).length))return ['Некорректные правки исходной карты'];
 try{
  if(!validMapEdits(BASE_MAPS[config.source],combinedLegacyEdits(config.source,data),BASE_MAPS))return ['Недопустимая трансформация исходного объекта'];
 }catch{return ['Некорректные правки исходной карты'];}
 if(Object.keys(data.terrain??{}).length||data.paint?.length||data.layers?.length||data.roads?.length||data.gameplay!==undefined)return ['Рельеф и правила исходной карты пока защищены'];
 return [];
}
export function createExistingMap(id,config,data){
 const errors=validateExistingEdits(config,data);if(errors.length)throw Error(errors.join('; '));
 const original=BASE_MAPS[config.source],edited=applyMapEdits(original,combinedLegacyEdits(config.source,data),BASE_MAPS);
 // Keep the native map's terrain, collision shapes, spawn arrays and routes.
 // A separate render map preserves the original asset identifiers; the
 // variant itself is registered only for local play.
 const renderMap={...edited,...data.lighting};
 const terrain=edited.terrain??flatEditorTerrain;
 return {...renderMap,id,name:config.name,editorSandbox:true,editorSource:config.source,editorRenderMap:renderMap,editorData:data,terrain,boxes:[...edited.boxes,...data.models.flatMap(modelColliders)]};
}
