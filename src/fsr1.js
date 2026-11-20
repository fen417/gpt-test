// AMD FidelityFX Super Resolution 1.0 (FSR 1) spatial EASU + RCAS,
// ported to GLSL ES 3.00 / WebGL2 from the MIT-licensed GPUOpen reference:
// https://github.com/GPUOpen-Effects/FidelityFX-FSR
// Input to EASU is an already tone-mapped, display-referred RGB texture.
// Both stages use explicit texelFetch for compatibility with WebGL2 GPUs.
export const FSR1_SCALES = Object.freeze({
  ultra: 0.92,
  quality: 0.85,
  balanced: 0.75,
  performance: 0.67,
});
export function fsr1RenderScale(quality, adaptive = 1) {
  return quality === 'auto'
    ? Math.min(1, Math.max(0.6, adaptive))
    : FSR1_SCALES[quality] ?? FSR1_SCALES.quality;
}

export const FSR1_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

export const FSR1_EASU_FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D tInput;
uniform vec2 inputSize;
uniform vec2 outputSize;
out vec4 outColor;

vec3 source(ivec2 p) {
  return texelFetch(tInput, clamp(p, ivec2(0), ivec2(inputSize) - 1), 0).rgb;
}
float lum(vec3 c) { return c.g + 0.5 * (c.r + c.b); }

// Directional gradient of the four source pixels surrounding the output pixel.
void easuSet(inout vec2 dir, inout float edgeLen, vec2 fracPos, float weight,
             float a, float b, float c, float d, float e) {
  float dx = d - b;
  float dy = e - a;
  float gx = clamp(abs(dx) / max(max(abs(d-c), abs(c-b)), 1e-6), 0.0, 1.0);
  float gy = clamp(abs(dy) / max(max(abs(e-c), abs(c-a)), 1e-6), 0.0, 1.0);
  dir += vec2(dx, dy) * weight;
  edgeLen += (gx*gx + gy*gy) * weight;
}

void easuTap(inout vec3 accum, inout float sum,
             vec2 offset, vec2 dir, vec2 extent, float lobe, float clipDist, vec3 color) {
  vec2 rotated = vec2(dot(offset, dir), dot(offset, vec2(-dir.y, dir.x))) * extent;
  float d2 = min(dot(rotated, rotated), clipDist);
  float a = lobe*d2-1.0;
  float b = 0.4*d2-1.0;
  float w = ((25.0/16.0)*b*b-9.0/16.0)*a*a;
  accum += color*w;
  sum += w;
}

void main() {
  vec2 coord = (gl_FragCoord.xy * (inputSize/outputSize)) - vec2(0.5);
  ivec2 base = ivec2(floor(coord));
  vec2 pp = fract(coord);

  // Original EASU 12-tap cross footprint.
  vec3 b = source(base+ivec2( 0,-1)), c = source(base+ivec2( 1,-1));
  vec3 e = source(base+ivec2(-1, 0)), f = source(base+ivec2( 0, 0));
  vec3 g = source(base+ivec2( 1, 0)), h = source(base+ivec2( 2, 0));
  vec3 i = source(base+ivec2(-1, 1)), j = source(base+ivec2( 0, 1));
  vec3 k = source(base+ivec2( 1, 1)), l = source(base+ivec2( 2, 1));
  vec3 n = source(base+ivec2( 0, 2)), o = source(base+ivec2( 1, 2));

  float bL=lum(b), cL=lum(c), eL=lum(e), fL=lum(f);
  float gL=lum(g), hL=lum(h), iL=lum(i), jL=lum(j);
  float kL=lum(k), lL=lum(l), nL=lum(n), oL=lum(o);
  vec2 dir=vec2(0.0);
  float edgeLen=0.0;
  easuSet(dir,edgeLen,pp,(1.0-pp.x)*(1.0-pp.y),bL,eL,fL,gL,jL);
  easuSet(dir,edgeLen,pp,     pp.x *(1.0-pp.y),cL,fL,gL,hL,kL);
  easuSet(dir,edgeLen,pp,(1.0-pp.x)*     pp.y ,fL,iL,jL,kL,nL);
  easuSet(dir,edgeLen,pp,     pp.x *     pp.y ,gL,jL,kL,lL,oL);

  float dirSq=dot(dir,dir);
  dir=dirSq < 1.0/32768.0 ? vec2(1.0,0.0) : dir*inversesqrt(dirSq);
  edgeLen*=0.5;
  edgeLen*=edgeLen;
  float stretch=dot(dir,dir)/max(max(abs(dir.x),abs(dir.y)),1e-6);
  vec2 extent=vec2(1.0+(stretch-1.0)*edgeLen, 1.0-0.5*edgeLen);
  float lobe=mix(0.5,0.21,edgeLen);
  float clipDist=1.0/lobe;

  vec3 min4=min(min(f,g),min(j,k)),max4=max(max(f,g),max(j,k));
  vec3 color=vec3(0.0);
  float weight=0.0;
  easuTap(color,weight,vec2( 0.0,-1.0)-pp,dir,extent,lobe,clipDist,b);
  easuTap(color,weight,vec2( 1.0,-1.0)-pp,dir,extent,lobe,clipDist,c);
  easuTap(color,weight,vec2(-1.0, 1.0)-pp,dir,extent,lobe,clipDist,i);
  easuTap(color,weight,vec2( 0.0, 1.0)-pp,dir,extent,lobe,clipDist,j);
  easuTap(color,weight,vec2( 0.0, 0.0)-pp,dir,extent,lobe,clipDist,f);
  easuTap(color,weight,vec2(-1.0, 0.0)-pp,dir,extent,lobe,clipDist,e);
  easuTap(color,weight,vec2( 1.0, 1.0)-pp,dir,extent,lobe,clipDist,k);
  easuTap(color,weight,vec2( 2.0, 1.0)-pp,dir,extent,lobe,clipDist,l);
  easuTap(color,weight,vec2( 2.0, 0.0)-pp,dir,extent,lobe,clipDist,h);
  easuTap(color,weight,vec2( 1.0, 0.0)-pp,dir,extent,lobe,clipDist,g);
  easuTap(color,weight,vec2( 1.0, 2.0)-pp,dir,extent,lobe,clipDist,o);
  easuTap(color,weight,vec2( 0.0, 2.0)-pp,dir,extent,lobe,clipDist,n);
  outColor=vec4(clamp(color/max(weight,1e-6),min4,max4),1.0);
}
`;

export const FSR1_RCAS_FRAGMENT = /* glsl */ `
precision highp float;
precision highp int;
uniform sampler2D tInput;
uniform vec2 outputSize;
uniform float sharpness; // linear strength 0..1; 0 means pass-through
out vec4 outColor;
vec3 source(ivec2 p) {
  return texelFetch(tInput, clamp(p, ivec2(0), ivec2(outputSize)-1), 0).rgb;
}
void main() {
  ivec2 p=ivec2(gl_FragCoord.xy);
  if(sharpness<=0.0){outColor=vec4(source(p),1.0);return;}
  vec3 b=source(p+ivec2( 0,-1));
  vec3 d=source(p+ivec2(-1, 0));
  vec3 e=source(p);
  vec3 f=source(p+ivec2( 1, 0));
  vec3 h=source(p+ivec2( 0, 1));
  vec3 mn4=min(min(b,d),min(f,h)),mx4=max(max(b,d),max(f,h));
  vec3 hitMin=min(mn4,e)/(4.0*max(mx4,vec3(1e-6)));
  vec3 hitMax=(vec3(1.0)-max(mx4,e))/min(4.0*mn4-vec3(4.0),vec3(-1e-6));
  vec3 lobes=max(-hitMin,hitMax);
  float lobe=clamp(max(max(lobes.r,lobes.g),lobes.b),-0.1875,0.0)*sharpness;
  vec3 result=(e+lobe*(b+d+f+h))/(1.0+4.0*lobe);
  // The intermediate EASU/RCAS targets contain LINEAR display-referred RGB.
  // The final WebGL framebuffer requires exactly one linear -> sRGB encoding;
  // without this FSR looks substantially darker than the non-FSR path.
  outColor=linearToOutputTexel(vec4(clamp(result,0.0,1.0),1.0));
}
`;
