import { SoloAuthority } from '../shared/solo-authority.js';
const authority=new SoloAuthority(data=>{
  if(typeof data==='string')self.postMessage(data);
  else self.postMessage(data.buffer,[data.buffer]);
});
self.onmessage=event=>authority.message(event.data);
