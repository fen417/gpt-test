import { parentPort } from 'node:worker_threads';
import { SoloAuthority } from '../../shared/solo-authority.js';
const authority=new SoloAuthority(data=>{if(typeof data==='string')parentPort.postMessage(data);else parentPort.postMessage(data.buffer,[data.buffer]);});
parentPort.on('message',data=>authority.message(data));
