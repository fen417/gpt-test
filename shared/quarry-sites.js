// Local metres measured from the centre of each building's finished floor.
export const QUARRY_KITS = {
  transfer: {
    w: 26, d: 20, h: 6.2, paint: '#a89c84', roof: '#686e61',
    front: { at: -6, width: 5.4, top: 4.5 },
    back: { at: 6, width: 4.4, top: 4 },
    frontLight: { at: 5.8, width: 5.6, sill: 3.35, top: 4.55 },
    backLight: { at: -5.8, width: 5.6, sill: 3.35, top: 4.55 },
    side: { at: .8, width: 2.8, top: 2.7 },
    fixtures: [
      { x: 4.6, z: -4.8, w: 5.2, d: 1.8, h: 2.25, model: 'shelves' },
      { x: -3.4, z: 3.65, w: 5.5, d: 2.25, h: 1.42, model: 'freight' },
    ],
  },
  crusher: {
    w: 24, d: 19, h: 6.8, paint: '#a59a87', roof: '#616762',
    front: { at: 5.8, width: 4.8, top: 4.1 },
    back: { at: -5.8, width: 3.5, top: 3.55 },
    frontLight: { at: -5.4, width: 4.8, sill: 3.7, top: 4.8 },
    backLight: { at: 5.4, width: 4.8, sill: 3.7, top: 4.8 },
    side: { at: 1.6, width: 2.8, top: 2.7 },
    plant: { x: -.8, z: -1.4, w: 5.0, d: 4.5, h: 3.7, model: 'separator' },
    fixtures: [
      { x: -.7, z: -1.4, w: 6.0, d: 2.65, h: 2.55, model: 'mill' },
      { x: 5.5, z: 5.7, w: 4.2, d: 1.25, h: 1.23, model: 'bench' },
    ],
  },
  pump: {
    w: 19, d: 16, h: 4.9, paint: '#929d91', roof: '#585f57',
    front: { at: -4.6, width: 3.2, top: 3.1 },
    back: { at: 4.4, width: 2.8, top: 2.7 },
    side: { at: -.8, width: 2.4, top: 2.55 },
    fixtures: [
      { x: .4, z: .95, w: 5.5, d: 2.75, h: 1.9, model: 'pumps' },
      { x: 4.6, z: -4.25, w: 4.0, d: 1.0, h: 2.05, model: 'panels' },
    ],
  },
  service: {
    w: 20, d: 16, h: 4.6, paint: '#b0a18a', roof: '#777058',
    front: { at: 4.2, width: 4.2, top: 3.4 },
    back: { at: -4.4, width: 3.2, top: 2.9 },
    side: { at: .6, width: 2.4, top: 2.55 },
    fixtures: [
      { x: -.3, z: -1.6, w: 5.8, d: 1.75, h: 1.55, model: 'bench' },
      { x: -5.4, z: 4.8, w: 3.15, d: 1.1, h: 2.1, model: 'lockers' },
    ],
  },
};

export function quarryKitPlan(kit) {
  const {w,d,h,paint,roof,front,back,side,fixtures}=kit;
  const parts=[], navigation=[], thickness=.44;
  const part=(x,z,w,d,h,baseY=0,color=paint,material='concrete',attributes={})=> {
    parts.push({x,z,w,d,h,baseY,color,material,...attributes});
  };
  const wall=(axis,fixed,length,...apertures)=> {
    const span=(from,to,bottom,top)=> {
      const middle=(from+to)/2, size=to-from;
      if(axis==='x')part(middle,fixed,size,thickness,top-bottom,bottom);
      else part(fixed,middle,thickness,size,top-bottom,bottom);
    };
    let edge=-length/2;
    for(const opening of apertures.filter(Boolean).sort((a,b)=>a.at-b.at)){
      const left=opening.at-opening.width/2, right=opening.at+opening.width/2;
      span(edge,left,0,h);
      span(left,right,opening.top,h);
      if(opening.sill)span(left,right,0,opening.sill);
      else for(const offset of [-2.2,0,2.2])
        navigation.push(axis==='x'?[opening.at,fixed+offset]:[fixed+offset,opening.at]);
      edge=right;
    }
    span(edge,length/2,0,h);
  };
  wall('x',d/2-thickness/2,w,front,kit.frontLight);
  wall('x',-d/2+thickness/2,w,back,kit.backLight);
  wall('z',w/2-thickness/2,d-2*thickness,side);
  wall('z',-w/2+thickness/2,d-2*thickness,{at:-2.4,width:3.3,top:2.62,sill:1.16});
  part(0,0,w+.7,d+.7,.28,h,roof,'metal');
  part(0,0,w+.36,d+.36,.225,-.19,'#8e8a79','concrete',{noCollision:true});
  part(front.at,d/2+.88,front.width+.9,2.02,.16,front.top+.12,roof,'metal');
  for(const f of fixtures)part(f.x,f.z,f.w,f.d,f.h,.035,'#737870','metal',{model:f.model});
  if(kit.plant){
    const p=kit.plant;
    part(p.x,p.z,p.w,p.d,p.h,h+.28,'#6d7165','metal',{model:p.model});
  }
  navigation.push([-w*.22,0],[w*.22,0],[0,-d*.26],[0,d*.26]);
  return {parts,navigation};
}
