import {WebGLRenderTarget} from 'three';
import {SMAAPass} from 'three/addons/postprocessing/SMAAPass.js';

export class WebGlSmaa {
  constructor(){
    this.input=new WebGLRenderTarget(1,1,{depthBuffer:false});
    this.pass=new SMAAPass();
    this.pass.renderToScreen=true;
    // The scene color is display-referred linear RGB, so only the final
    // framebuffer write converts it to the renderer's output color space.
    const blend=this.pass._materialBlend;
    blend.fragmentShader=blend.fragmentShader.replace(
      'gl_FragColor = SMAANeighborhoodBlendingPS( vUv, vOffset, tColor, tDiffuse );',
      'gl_FragColor = linearToOutputTexel( SMAANeighborhoodBlendingPS( vUv, vOffset, tColor, tDiffuse ) );',
    );
    blend.toneMapped=false;
  }

  get ready(){
    return this.pass._areaTexture.version>0&&this.pass._searchTexture.version>0;
  }

  resize({x,y}){
    if(this.input.width===x&&this.input.height===y)return;
    this.input.setSize(x,y);
    this.pass.setSize(x,y);
  }

  render(renderer){
    this.pass.render(renderer,null,this.input);
  }

  dispose(){
    this.input.dispose();
    this.pass.dispose();
  }
}
