import { AdditiveBlending, NormalBlending, Color, DoubleSide } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, float, texture, uv, vec3, vec4, uniform, Fn, If, sin, smoothstep, abs, mix, length, max, pow } from 'three/tsl';

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

export function webGpuCampaignFlame(phase,vehicle=false) {
  const material=new MeshBasicNodeMaterial({
    transparent:true,depthWrite:false,side:DoubleSide,blending:vehicle?NormalBlending:AdditiveBlending,fog:false,
  });
  const time=uniform(0),seed=float(phase),detail=uniform(0);
  material.userData.fireUniforms={time,detail};
  material.fragmentNode=Fn(()=>{
    const p=uv(),y=p.y,t=time.mul(.62);
    const wobble=sin(y.mul(5.8).sub(t.mul(2.1)).add(seed)).mul(.085).mul(y)
      .add(sin(y.mul(13).sub(t.mul(3.7)).add(seed.mul(2))).mul(.045).mul(y));
    const width=y.oneMinus().mul(.40).add(.065);
    const edge=smoothstep(width.mul(.38),width,abs(p.x.sub(.5).add(wobble))).oneMinus();
    const flow=y.mul(12).sub(t.mul(3.8)).add(seed);
    const warp=sin(p.x.mul(13).add(sin(flow).mul(1.3)).add(seed));
    const tongues=warp.mul(.16).add(sin(p.x.mul(29).sub(flow.mul(.82)).add(seed)).mul(.12))
      .add(sin(p.x.mul(51).add(flow.mul(.43))).mul(.06)).add(.69);
    const cells=sin(p.x.mul(24).add(sin(flow).mul(2.1)).add(flow.mul(.67)))
      .mul(sin(p.x.mul(13).sub(flow.mul(.91)))).mul(.5).add(.5);
    const alpha=edge.mul(smoothstep(tongues.sub(.13),tongues.add(.12),y).oneMinus())
      .mul(smoothstep(0,.09,y)).mul(cells.mul(.23).add(.77)).toVar();
    const color=mix(vec3(1,.72,.19),vec3(.96,.14,.012),smoothstep(.10,.85,y)).toVar();
    If(detail.greaterThan(.5),()=>{
      const fine=sin(p.x.mul(49).add(sin(flow.mul(1.2)).mul(1.7)).sub(flow))
        .mul(sin(p.x.mul(33).add(flow.mul(.71)))).mul(.5).add(.5);
      const hot=smoothstep(.40,.88,cells.mul(.74).add(fine.mul(.26))).mul(smoothstep(.26,.84,y).oneMinus());
      alpha.mulAssign(fine.mul(.22).add(.78));color.assign(mix(color,vec3(1,.94,.52),hot.mul(.83)));
    });
    alpha.lessThan(.025).discard();
    if(vehicle){const orange=mix(vec3(1,.48,.055),vec3(.88,.085,.008),smoothstep(.1,.85,y));return vec4(mix(orange,color,.72),alpha.mul(.86));}
    return vec4(color.mul(1.5),alpha.mul(.85));
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
