export const heatDistortionGLSL=`
uniform mat4 heatSources;
uniform vec4 heatStrength;
uniform float heatTime;
vec3 distortHeat(vec2 uv,vec3 color){
  if(dot(heatStrength,vec4(1.))<=0.)return color;
  float aspect=depthSize.x/depthSize.y;
  vec2 distortion=vec2(0.);
  float depth=-viewAt(uv).z;
  for(int i=0;i<4;i++){
    if(heatStrength[i]<=0.)continue;
    vec4 heat=heatSources[i];
    if(depth<heat.w-.55)continue;
    vec2 p=(uv-heat.xy)*vec2(aspect,1.)/heat.z;
    float envelope=1.-smoothstep(.16,1.,length(p));
    if(envelope<=0.)continue;
    distortion+=vec2(sin(p.y*26.-heatTime*24.+p.x*6.),cos(p.y*19.-heatTime*17.+p.x*12.))*envelope*heatStrength[i];
  }
  if(dot(distortion,distortion)<.00001)return color;
  vec2 next=uv+clamp(distortion,vec2(-1.),vec2(1.))*4.5/depthSize;
  if(abs(viewAt(next).z+depth)>2.+depth*.035)return color;
  return texture2D(source,next).rgb;
}
`;
