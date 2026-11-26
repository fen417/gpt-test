import {EDITOR_MAPS} from '../shared/editor-maps.js';
import {registerLocalMap} from '../shared/world.js';
if(import.meta.env.DEV)for(const map of Object.values(EDITOR_MAPS))registerLocalMap(map);
import { SoloAuthority } from '../shared/solo-authority.js';
const authority=new SoloAuthority(data=>{
  if(typeof data==='string')self.postMessage(data);
  else self.postMessage(data.buffer,[data.buffer]);
});
self.onmessage=event=>authority.message(event.data);
