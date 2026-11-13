import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAUNCHER_POSE } from './gadget-poses.js';

const boxGeometry=new RoundedBoxGeometry(1,1,1,2,.055);
const cylinderGeometry=new THREE.CylinderGeometry(1,1,1,12);
const sphereGeometry=new THREE.SphereGeometry(1,12,8);
const templates=new WeakMap();

export function gadgetPalette(create) {
  return {
    olive:create('equipment-olive',0x59624a,.82,.15),dark:create('equipment-rubber',0x1e2828,.9,.04),
    metal:create('equipment-steel',0x7f8c8e,.4,.72),brass:create('equipment-brass',0xb59a56,.4,.65),
    white:create('equipment-ivory',0xd5d8ce,.7,.12),orange:create('equipment-orange',0xbb6836,.7,.12),
    blue:create('equipment-display',0x6abcbf,.4,.12,{emissive:0x338c96,emissiveIntensity:.65}),
    red:create('equipment-indicator',0xc1694a,.6,.05),cloth:create('equipment-webbing',0x6e6b53,.95,0),
    flame:create('equipment-flame',0x79ccff,.3,.05,{emissive:0x48aaff,emissiveIntensity:2}),
  };
}

function build(kind,m) {
  const root=new THREE.Group();root.name='equipment-'+kind;
  const add=(parent,geometry,material,x,y,z,sx,sy,sz)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);
    mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  };
  const box=(x,y,z,w,h,d,mat=m.olive,parent=root)=>add(parent,boxGeometry,mat,x,y,z,w,h,d);
  const tube=(x,y,z,r,length,mat=m.metal,axis='y',parent=root)=>{
    const mesh=add(parent,cylinderGeometry,mat,x,y,z,r,length,r);
    if(axis==='z')mesh.rotation.x=Math.PI/2;if(axis==='x')mesh.rotation.z=Math.PI/2;
    return mesh;
  };
  const ring=(x,y,z,r,width,length,mat=m.metal,axis='z')=>{
    const profile=[new THREE.Vector2(r,-length/2),new THREE.Vector2(r,length/2),new THREE.Vector2(r-width,length/2),
      new THREE.Vector2(r-width,-length/2),new THREE.Vector2(r,-length/2)];
    const geometry=new THREE.LatheGeometry(profile,16);geometry.userData.temporary=true;
    if(axis==='z')geometry.rotateX(Math.PI/2);
    return add(root,geometry,mat,x,y,z,1,1,1);
  };
  const wire=(points,r=.006,mat=m.dark)=>{
    const geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),16,r,6,false);
    geometry.userData.temporary=true;return add(root,geometry,mat,0,0,0,1,1,1);
  };
  if(kind==='ammo'){
    box(0,.035,0,.51,.07,.35,m.dark);
    for(const side of [-1,1]){
      box(side*.246,.17,0,.025,.27,.35);
      box(0,.17,side*.163,.49,.27,.024);
      for(const x of [-.18,.18])box(x,.17,side*.181,.035,.24,.017,m.metal);
    }
    const lid=box(0,.36,.16,.52,.035,.35,m.olive);lid.rotation.x=-.58;
    for(const x of [-.19,.19]){
      box(x,.25,-.188,.042,.072,.027,m.metal);
      tube(x,.31,.174,.016,.06,m.metal,'x');
    }
    box(0,.18,-.184,.18,.075,.009,m.white);
    for(let i=0;i<6;i++){
      const x=-.17+i*.067;
      tube(x,.22,-.018,.016,.16,m.brass,'z');
      const tip=add(root,sphereGeometry,m.metal,x,.22,-.112,.014,.014,.027);
      tip.rotation.x=.1;
      box(x,.13,.07,.042,.16,.055,m.dark);
    }
    wire([[-.1,.31,.02],[-.1,.38,.02],[.1,.38,.02],[.1,.31,.02]],.012,m.cloth);
    for(const z of [-.1,.1])box(0,.068,z,.46,.018,.022,m.orange);
  }else if(kind==='beacon'){
    box(0,.25,0,.31,.34,.22);
    box(0,.075,0,.35,.065,.27,m.dark);
    for(const side of [-1,1]){
      const leg=box(side*.20,.065,0,.24,.035,.055,m.metal);leg.rotation.z=-side*.22;
      box(side*.30,.025,0,.08,.045,.12,m.dark);
      for(const y of [.16,.22,.28])box(side*.161,y,.02,.012,.018,.14,m.dark);
      box(side*.12,.44,.02,.025,.09,.035,m.cloth);
    }
    box(0,.32,-.118,.23,.12,.025,m.dark);
    box(-.035,.33,-.133,.12,.07,.006,m.blue);
    for(let i=0;i<3;i++)tube(.075,.3+i*.03,-.137,.009,.009,m.orange,'z');
    tube(.10,.59,.035,.009,.42,m.metal);
    tube(.10,.88,.035,.006,.25,m.dark);
    add(root,sphereGeometry,m.blue,.10,1.01,.035,.016,.016,.016);
    box(0,.47,.01,.17,.035,.07,m.dark);
    wire([[-.13,.11,.12],[-.18,.3,.12],[-.14,.46,.06],[.03,.46,.06]],.008);
    box(-.11,.15,-.12,.055,.08,.02,m.white);
  }else if(kind.startsWith('defibrillator')){
    const sides=kind==='defibrillator-left'?[-1]:kind==='defibrillator-right'?[1]:[-1,1];
    for(const side of sides){
      const paddle=new THREE.Group();paddle.position.set(side*.115,0,0);paddle.rotation.z=side*.12;root.add(paddle);
      box(0,0,0,.105,.025,.13,m.metal,paddle);
      box(0,.023,0,.11,.025,.135,m.orange,paddle);
      for(const x of [-.025,.025])box(x,.055,0,.018,.06,.075,m.dark,paddle);
      box(0,.084,0,.075,.025,.075,m.dark,paddle);
      box(.016,.100,-.005,.023,.009,.024,m.red,paddle);
      wire([[side*.11,.02,.06],[side*.17,-.05,.1],[side*.08,-.10,.16],[side*.03,-.08,.23]],.005);
    }
    if(kind!=='defibrillator-right'){
      box(0,-.07,.23,.18,.085,.10,m.white);
      box(0,-.022,.23,.11,.012,.055,m.blue);
      for(const x of [-.065,.065])box(x,-.02,.24,.02,.012,.025,m.orange);
    }
  }else if(kind==='repair'){
    tube(0,-.04,.055,.046,.21,m.olive);
    ring(0,.055,.055,.048,.007,.018,m.dark,'y');
    tube(0,.085,.055,.018,.05,m.brass);
    box(0,.105,.055,.065,.018,.045,m.metal);
    tube(.034,.11,.055,.025,.01,m.red,'x');
    wire([[0,.12,.055],[0,.15,.02],[0,.13,-.12],[0,.11,-.19]],.011,m.brass);
    tube(0,.11,-.208,.018,.065,m.metal,'z');
    box(0,-.015,.103,.056,.11,.025,m.dark);
    for(let i=0;i<5;i++)box(0,-.055+i*.02,.119,.06,.006,.007,m.metal);
    box(0,-.055,.008,.05,.09,.016,m.white);
    const flame=new THREE.Group();flame.name='tool-flame';flame.position.set(0,.11,-.25);root.add(flame);
    const cone=new THREE.ConeGeometry(.026,.25,12);cone.userData.owned=true;
    const mesh=add(flame,cone,m.flame,0,0,-.115,1,1,1);mesh.rotation.x=-Math.PI/2;
    const core=new THREE.ConeGeometry(.013,.16,10);core.userData.owned=true;
    const inner=add(flame,core,m.white,0,0,-.07,1,1,1);inner.rotation.x=-Math.PI/2;
  }else if(kind==='launcher'){
    const triggerAssembly=new THREE.Group();root.add(triggerAssembly);
    triggerAssembly.position.z=LAUNCHER_POSE.triggerShiftZ;
    ring(0,.025,-.17,.057,.009,.84,m.olive);
    for(const z of [-.57,-.49,-.07,.22]){
      ring(0,.025,z,.061,.008,.022,m.dark);
      if(z>0)ring(0,.025,z+.02,.069,.014,.035,m.metal);
    }
    ring(0,.025,-.593,.057,.009,.017,m.metal);
    tube(0,.025,-.50,.043,.006,m.dark,'z');
    // Open trigger guard: the index finger must meet the trigger, not a solid box.
    box(0,-.028,.01,.045,.022,.085,m.dark,triggerAssembly);
    box(0,-.075,-.028,.024,.08,.012,m.dark,triggerAssembly);
    box(0,-.115,.01,.028,.014,.085,m.dark,triggerAssembly);
    const trigger=box(0,-.070,.016,.008,.032,.008,m.metal,triggerAssembly);trigger.rotation.x=-.12;
    const grip=box(0,-.15,.06,.036,.12,.06,m.dark,triggerAssembly);grip.rotation.x=-.16;
    for(const offset of [-.06,.06])box(0,-.027,LAUNCHER_POSE.supportZ+offset,.050,.034,.022,m.dark);
    box(0,-.050,LAUNCHER_POSE.supportZ,.075,.035,.16,m.cloth);
    for(const side of [-1,1]){
      box(side*.06,.025,-.34,.012,.075,.14,m.orange);
      for(let i=0;i<3;i++)box(side*.067,.025,-.37+i*.032,.003,.045,.013,m.white);
    }
    box(0,.102,-.12,.06,.045,.16,m.dark);
    ring(0,.145,-.12,.025,.007,.15,m.metal);
    // Keep the sight bore open: its front post must remain visible while aiming.
    ring(0,.145,-.198,.026,.004,.012,m.dark);
    tube(.037,.145,-.09,.014,.025,m.dark,'x');
    for(const z of [-.16,-.12,-.08])box(.050,.145,z,.005,.020,.009,m.metal);
    for(const side of [-1,1]){
      box(side*.038,-.16,.018,.009,.075,.012,m.metal,triggerAssembly);
      tube(side*.062,.025,-.27,.007,.007,m.metal,'x');
      tube(side*.061,.025,-.04,.007,.007,m.metal,'x');
      box(side*.046,-.07,.005,.014,.065,.024,m.metal,triggerAssembly);
    }
    box(0,-.201,.045,.075,.012,.075,m.metal,triggerAssembly);
    box(0,.104,-.52,.015,.08,.018,m.metal);
    for(const side of [-1,1])box(side*.027,.104,.10,.012,.085,.016,m.metal);
    box(0,.066,.10,.065,.012,.016,m.metal);
    box(0,-.008,.25,.13,.10,.055,m.dark);
    box(-.061,.032,-.24,.009,.055,.10,m.white);
  }else if(kind==='medkit'){
    box(0,0,0,.27,.16,.17,m.white);
    box(0,0,-.087,.20,.10,.012,m.orange);
    for(const x of [-.085,.085])box(x,.006,0,.026,.17,.18,m.cloth);
    wire([[-.07,.08,0],[-.07,.13,0],[.07,.13,0],[.07,.08,0]],.01,m.dark);
    box(0,0,-.097,.09,.018,.008,m.white);box(0,0,-.097,.018,.075,.008,m.white);
    for(const x of [-.11,.11])box(x,-.02,-.09,.03,.035,.018,m.metal);
  }else if(kind==='rocket'){
    tube(0,0,0,.034,.48,m.olive,'z');
    tube(0,0,-.17,.049,.15,m.orange,'z');
    const geometry=new THREE.ConeGeometry(.049,.13,12);geometry.userData.temporary=true;
    const nose=add(root,geometry,m.metal,0,0,-.31,1,1,1);nose.rotation.x=-Math.PI/2;
    ring(0,0,.25,.036,.008,.025,m.dark);
    for(const side of [-1,1]){box(side*.046,0,.16,.055,.008,.15,m.metal);box(0,side*.046,.16,.008,.055,.15,m.metal);}
  }
  // Rigid pieces share one draw per material. The flame keeps its own transform.
  root.updateMatrixWorld(true);
  const batches=new Map();
  root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.parent.name==='tool-flame')return;
    if(!batches.has(mesh.material))batches.set(mesh.material,[]);
    batches.get(mesh.material).push(mesh);
  });
  for(const [material,meshes] of batches){
    const parts=meshes.map(mesh=>{
      const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      if(!geometry.index)return geometry;
      const expanded=geometry.toNonIndexed();geometry.dispose();return expanded;
    });
    const merged=mergeGeometries(parts,false);
    parts.forEach(part=>part.dispose());
    merged.userData.owned=true;
    const mesh=new THREE.Mesh(merged,material);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
    for(const source of meshes){source.removeFromParent();if(source.geometry.userData.temporary)source.geometry.dispose();}
  }
  return root;
}

export function createGadgetModel(kind,palette) {
  if(!templates.has(palette))templates.set(palette,new Map());
  const models=templates.get(palette);
  if(!models.has(kind))models.set(kind,build(kind,palette));
  return models.get(kind).clone(true);
}

export function gadgetTemplates(palette) {
  return templates.get(palette)?.values()??[];
}
