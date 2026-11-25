import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {MAPS} from '../shared/world.js';
import {ALHADRA} from '../shared/campaign/alhadra.js';
import {ALHADRA_DESERT} from '../shared/campaign/alhadra-desert.js';
import {TEL_MAZIN} from '../shared/campaign/tel-mazin.js';
import {NAHAR} from '../shared/campaign/nahar.js';
import {SAFRA} from '../shared/campaign/safra.js';
import {bakeProbeField,GI_VERSION} from '../src/gi-probes.js';
import {createHash} from 'node:crypto';
const dir='public/gi-v1';await mkdir(dir,{recursive:true});
const maps=[...Object.values(MAPS),ALHADRA,ALHADRA_DESERT,TEL_MAZIN,NAHAR,SAFRA],manifest={version:GI_VERSION,maps:{}};
for(const map of maps){
  const {data,...meta}=bakeProbeField(map);
  const file=map.id+'.rgba';
  const bytes=Buffer.from(data),sha256=createHash('sha256').update(bytes).digest('hex');
  let previous;try{previous=await readFile(dir+'/'+file);}catch{}
  if(!previous?.equals(bytes))await writeFile(dir+'/'+file,bytes);
  manifest.maps[map.id]={...meta,file,bytes:bytes.length,sha256};
  console.log('GI',map.id,meta.nx+'x'+meta.nz+'x3',bytes.length);
}
await writeFile(dir+'/manifest.json',JSON.stringify(manifest,null,2)+'\n');
