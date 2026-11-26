import {registerLocalMap} from '../shared/world.js';
const editorInit=import.meta.env.DEV?import('../shared/editor-maps.js').then(({EDITOR_MAPS})=>{for(const map of Object.values(EDITOR_MAPS))registerLocalMap(map);}):Promise.resolve();
import { SoloAuthority } from '../shared/solo-authority.js';
const authority=new SoloAuthority(data=>{
  if(typeof data==='string')self.postMessage(data);
  else self.postMessage(data.buffer,[data.buffer]);
});
self.onmessage=async event=>{await editorInit;authority.message(event.data);};
