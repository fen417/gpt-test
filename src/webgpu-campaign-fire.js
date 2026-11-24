import { AdditiveBlending, Color, DoubleSide } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, float, texture, uv, vec3, vec4, uniform, Fn, sin, smoothstep, abs, mix, length, max, pow } from 'three/tsl';

export function webGpuCampaignSmoke(map) {
  const material=new MeshBasicNodeMaterial({transparent:true,depthWrite:false,fog:false});
  const tint=uniform(new Color('#62605a'));
  material.userData.fireUniforms={tint};
  material.fragmentNode=Fn(()=>{
    const alpha=texture(map).sample(uv()).a.mul(attribute('smokeOpacity','float')).toVar();
    alpha.lessThan(.01).discard();
    return vec4(tint,alpha);
  })();
  material.toneMapped=false;
  return material;
}

export function webGpuCampaignFlame(phase) {
  const material=new MeshBasicNodeMaterial({
    transparent:true,depthWrite:false,side:DoubleSide,blending:AdditiveBlending,fog:false,
  });
  const time=uniform(0),seed=float(phase);
  material.userData.fireUniforms={time};
  material.fragmentNode=Fn(()=>{
    const p=uv(),y=p.y;
    const wobble=sin(y.mul(11).sub(time.mul(5)).add(seed)).mul(.07)
      .add(sin(y.mul(24).sub(time.mul(9)).add(seed.mul(2))).mul(.035));
    const width=y.oneMinus().mul(.46).add(.035);
    const edge=smoothstep(width.mul(.45),width,abs(p.x.sub(.5).add(wobble))).oneMinus();
    const tongues=sin(p.x.mul(28).add(time.mul(7)).add(seed)).mul(.18)
      .add(sin(p.x.mul(47).sub(time.mul(4))).mul(.10)).add(.72);
    const alpha=edge.mul(smoothstep(tongues.sub(.18),tongues.add(.12),y).oneMinus())
      .mul(smoothstep(0,.07,y)).mul(sin(y.mul(31).sub(time.mul(12)).add(seed)).mul(.18).add(.75)).toVar();
    alpha.lessThan(.025).discard();
    const color=mix(vec3(1,.92,.42),vec3(1,.28,.025),smoothstep(.1,.8,y)).mul(1.5);
    return vec4(color,alpha.mul(.85));
  })();
  material.toneMapped=false;
  return material;
}

export function webGpuCampaignGlow() {
  const material=new MeshBasicNodeMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,fog:false});
  const strength=uniform(.2);
  material.userData.fireUniforms={strength};
  const alpha=pow(max(0,length(uv().sub(.5)).mul(2).oneMinus()),2).mul(strength);
  material.fragmentNode=vec4(1,.28,.025,alpha);
  material.toneMapped=false;
  return material;
}
