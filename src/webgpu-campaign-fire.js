import { AdditiveBlending, NormalBlending, Color, FrontSide } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, float, texture, uv, vec3, vec4, uniform, Fn, If, sin, smoothstep, abs, mix, length, max, pow, normalView, positionView, dot, normalize } from 'three/tsl';

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
    transparent:true,depthWrite:false,side:FrontSide,blending:NormalBlending,fog:false,
  });
  const time=uniform(0),seed=float(phase),detail=uniform(0);
  material.userData.fireUniforms={time,detail};
  material.fragmentNode=Fn(()=>{
    const p=uv(),y=p.y,a=p.x.mul(6.2831853),t=time.mul(.62);
    const flow=y.mul(10).sub(t.mul(3.5)).add(seed);
    const bands=sin(a.mul(3).add(sin(flow).mul(1.4)).sub(flow.mul(.72))).mul(.5).add(.5);
    const eddies=sin(a.mul(5).sub(flow.mul(1.1)).add(sin(a.mul(2).add(flow)).mul(1.2))).mul(.5).add(.5);
    const density=smoothstep(.16,.78,bands.mul(.68).add(eddies.mul(.32))).toVar();
    If(detail.greaterThan(.5),()=>{
      const fine=sin(a.mul(8).add(flow.mul(1.7)).add(sin(a.mul(4).sub(flow)))).mul(.5).add(.5);
      density.mulAssign(fine.mul(.22).add(.78));
    });
    const rim=smoothstep(.04,.72,abs(dot(normalize(normalView),normalize(positionView))));
    const tip=sin(a.mul(2).add(flow.mul(.65))).mul(.12).add(sin(a.mul(3).sub(flow)).mul(.07)).add(.78);
    const alpha=density.mul(.76).add(.24).mul(rim).mul(smoothstep(0,.10,y))
      .mul(smoothstep(tip.sub(.18),tip.add(.11),y).oneMinus()).mul(vehicle?.56:.63);
    const color=mix(vec3(1,.60,.10),vec3(.83,.075,.006),smoothstep(.14,.92,y));
    const hot=smoothstep(.52,.88,bands).mul(smoothstep(.2,.72,y).oneMinus());
    alpha.lessThan(.008).discard();
    return vec4(mix(color,vec3(1,.88,.37),hot.mul(.72)),alpha);
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
