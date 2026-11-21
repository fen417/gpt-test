import {TextureLoader} from 'three';

export class MapTextures {
  loader=new TextureLoader();
  pending=new Set();

  load(url){
    let texture;
    const request=new Promise(resolve=>{texture=this.loader.load(url,resolve,undefined,resolve);});
    this.pending.add(request);
    request.then(()=>this.pending.delete(request));
    return texture;
  }

  ready(){
    return Promise.all(this.pending);
  }
}
