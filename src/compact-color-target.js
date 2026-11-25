import * as THREE from 'three';
// Preserve linear HDR until ACES, at four rather than eight bytes per pixel.
export const compactColorEligible=(quality,effects,samples,fg=false)=>quality==='low'&&!effects&&!samples&&!fg;
export function supportsCompactWebGL(renderer){
  const gl=renderer.getContext?.();
  if(!gl?.getExtension?.('EXT_color_buffer_float'))return false;
  const draw=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),read=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),texture=gl.getParameter(gl.TEXTURE_BINDING_2D);
  const target=gl.createFramebuffer(),color=gl.createTexture();
  try{
    gl.bindTexture(gl.TEXTURE_2D,color);
    gl.texStorage2D(gl.TEXTURE_2D,1,gl.R11F_G11F_B10F,4,4);
    gl.bindFramebuffer(gl.FRAMEBUFFER,target);
    gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,color,0);
    return gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
  }catch{return false;}
  finally{
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,draw);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,read);
    gl.bindTexture(gl.TEXTURE_2D,texture);gl.deleteFramebuffer(target);gl.deleteTexture(color);
  }
}
export function selectSceneColor(pass,compact,width,height,Target){
  if(pass.compactActive!==compact){
    pass.target.dispose();
    pass.target=compact?(pass.compactTarget??=new Target(1,1,{format:THREE.RGBFormat,type:THREE.UnsignedInt101111Type,depthBuffer:true})):pass.nativeTarget;
    pass.compactActive=compact;
  }
  if(pass.target.width!==width||pass.target.height!==height)pass.target.setSize(width,height);
}
export function displayVariant({fxaa,sharpen,grade,vignette,grain}){
  return [fxaa,sharpen,grade,vignette,grain].map(Boolean).map(Number).join('');
}
