import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// This viewmodel uses ordinary opaque depth-tested geometry. It is rendered in
// its own depth pass by GameRenderer; no material is allowed to see through it.
export function createWeaponRig(owner = {}) {
  const weapon = new THREE.Group(); weapon.name = 'S09-first-person-rig';
  const ownedGeometries = new Set(), ownedMaterials = new Set();
  const mat = (name, color, roughness=.7, metalness=.2, extra={}) => {
    const m = new THREE.MeshStandardMaterial({color,roughness,metalness,opacity:1,transparent:false,depthTest:true,depthWrite:true,...extra});
    m.name=name;ownedMaterials.add(m);return m;
  };
  const metal=mat('weapon-forged-metal',0x343e43,.43,.75);
  const edge=mat('weapon-machined-edges',0x667176,.37,.82);
  const dark=mat('weapon-recess-metal',0x11191d,.64,.65);
  const polymer=mat('weapon-polymer',0x3e4640,.83,.06);
  const rubber=mat('weapon-rubber',0x1e2826,.97,.01);
  const glove=mat('glove-tactical-fabric',0x535c4c,.97,.01);
  const leather=mat('glove-leather-palms',0x343d35,.88,.03);
  const seam=mat('glove-stitched-seams',0x7c8170,.97,0);
  const knuckle=mat('glove-knuckle-protection',0x323d37,.76,.08);
  const cloth=owner.surfaces?.cloth?.clone?.()||mat('sleeve-ripstop-cloth',0x68745c,.98,0);
  cloth.name='sleeve-ripstop-cloth';cloth.color.setHex(0x68745c);cloth.roughness=.98;cloth.metalness=0;cloth.opacity=1;cloth.transparent=false;cloth.depthTest=true;cloth.depthWrite=true;ownedMaterials.add(cloth);
  const cuff=mat('sleeve-elastic-cuff',0x384638,.99,0);
  const brass=mat('weapon-brass-details',0xb89b59,.45,.77);
  const label=mat('weapon-engraved-markings',0xabb0a8,.75,.3);
  const lens=mat('lens-coated-glass',0x356b70,.12,.32,{transparent:true,opacity:.68,depthWrite:true});
  const unitBox=new RoundedBoxGeometry(1,1,1,2,.09);ownedGeometries.add(unitBox);
  const unitSphere=new THREE.SphereGeometry(1,28,18);ownedGeometries.add(unitSphere);
  function mesh(parent,geometry,material,x=0,y=0,z=0){ownedGeometries.add(geometry);const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=false;m.receiveShadow=false;parent.add(m);return m;}
  function rounded(parent,x,y,z,w,h,d,material){const m=mesh(parent,unitBox,material,x,y,z);m.scale.set(w,h,d);return m;}
  function ellipsoid(parent,center,scale,material){const m=mesh(parent,unitSphere,material,...center);m.scale.set(...scale);return m;}
  function cylinder(parent,x,y,z,r,h,material,axis='z',segments=20){const g=new THREE.CylinderGeometry(r,r,h,segments);if(axis==='z')g.rotateX(Math.PI/2);if(axis==='x')g.rotateZ(Math.PI/2);return mesh(parent,g,material,x,y,z);}
  function ring(parent,x,y,z,outer,inner,length,material,axis='z',segments=24){const points=[new THREE.Vector2(outer,-length/2),new THREE.Vector2(outer,length/2),new THREE.Vector2(inner,length/2),new THREE.Vector2(inner,-length/2),new THREE.Vector2(outer,-length/2)];const g=new THREE.LatheGeometry(points,segments);if(axis==='z')g.rotateX(Math.PI/2);if(axis==='x')g.rotateZ(Math.PI/2);return mesh(parent,g,material,x,y,z);}
  function shapePath(points){const s=new THREE.Shape();points.forEach(([z,y],i)=>i?s.lineTo(-z,y):s.moveTo(-z,y));s.closePath();return s;}
  function profile(parent,points,width,material,{x=0,holes=[],bevel=.0025}={}){
    const shape=shapePath(points);for(const points of holes){const p=new THREE.Path();points.forEach(([z,y],i)=>i?p.lineTo(-z,y):p.moveTo(-z,y));p.closePath();shape.holes.push(p);}
    const g=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:bevel>0,bevelSegments:2,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:8});g.rotateY(Math.PI/2);g.translate(x-width/2,0,0);return mesh(parent,g,material);
  }
  function curve(parent,points,radius,material,segments=16,radial=10){const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return mesh(parent,new THREE.TubeGeometry(path,segments,radius,radial,false),material);}
  function loft(parent,points,radii,material,{segments=48,radial=24,ellipse=[1,1],folds=0}={}){
    const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),frames=path.computeFrenetFrames(segments,false),positions=[],uv=[],indices=[];
    for(let i=0;i<=segments;i++){const t=i/segments,p=path.getPointAt(t),u=t*(radii.length-1),j=Math.min(radii.length-2,Math.floor(u)),base=THREE.MathUtils.lerp(radii[j],radii[j+1],u-j),r=base*(1+folds*Math.sin(t*75)*Math.sin(Math.PI*t));
      for(let k=0;k<=radial;k++){const a=k/radial*Math.PI*2,c=Math.cos(a)*r*ellipse[0],s=Math.sin(a)*r*ellipse[1];positions.push(p.x+frames.normals[i].x*c+frames.binormals[i].x*s,p.y+frames.normals[i].y*c+frames.binormals[i].y*s,p.z+frames.normals[i].z*c+frames.binormals[i].z*s);uv.push(k/radial,t*3);}
    }
    for(let i=0;i<segments;i++)for(let k=0;k<radial;k++){const a=i*(radial+1)+k,b=a+radial+1;indices.push(a,b,a+1,b,b+1,a+1);}
    const front=positions.length/3;positions.push(...path.getPointAt(0).toArray());uv.push(.5,0);const back=positions.length/3;positions.push(...path.getPointAt(1).toArray());uv.push(.5,1);
    for(let k=0;k<radial;k++){indices.push(front,k+1,k);const a=segments*(radial+1)+k;indices.push(back,a,a+1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return mesh(parent,g,material);
  }
  function screw(parent,x,y,z,r=.006){cylinder(parent,x,y,z,r,.004,edge,'x',12);const slot=rounded(parent,x+(x>0?.0025:-.0025),y,z,.0015,r*.32,r*1.25,dark);slot.rotation.x=.55;}
  function rail(parent,z0,z1,y=.093,width=.066){rounded(parent,0,y-.008,(z0+z1)/2,width*.8,.018,Math.abs(z1-z0)+.015,metal);for(let z=z0;z<z1;z+=.024)profile(parent,[[z-.008,y-.005],[z-.011,y+.006],[z+.01,y+.006],[z+.008,y-.005]],width,dark,{bevel:.001});}

  const receiver=new THREE.Group();weapon.add(receiver);
  profile(receiver,[[-.225,-.03],[-.225,.044],[-.195,.072],[.067,.072],[.105,.052],[.113,-.027]],.083,metal,{holes:[[[-.139,.006],[-.027,.006],[-.027,.039],[-.139,.039]]]});
  // The ejection window is a real opening, backed by the bolt in a deep cavity.
  const bolt=new THREE.Group();bolt.position.set(0,0,-.02);weapon.add(bolt);
  cylinder(bolt,0,.022,-.065,.024,.155,edge,'z',24);
  profile(receiver,[[-.165,-.003],[-.165,.049],[.08,.049],[.094,.025],[.094,-.017],[-.11,-.022]],.007,metal,{x:-.044});
  profile(receiver,[[-.18,-.029],[-.175,-.092],[-.096,-.125],[-.013,-.105],[.006,-.119],[.088,-.119],[.117,-.091],[.11,-.029]],.073,metal,{holes:[[[-.002,-.075],[.068,-.075],[.068,-.104],[.008,-.104]]],bevel:.003});
  profile(receiver,[[.049,-.106],[.038,-.14],[.063,-.255],[.12,-.263],[.146,-.239],[.112,-.12]],.068,polymer,{bevel:.004});
  for(let y=-.17;y>-.245;y-=.018){const band=rounded(receiver,0,y,.092,.072,.006,.059,rubber);band.rotation.x=-.22;}
  curve(receiver,[[.003,-.075,.025],[.003,-.087,.012],[.003,-.101,.019]],.0045,dark,10,10);
  for(const side of [-1,1]){
    for(const [y,z]of [[-.047,-.15],[-.042,.083],[.048,.065]])screw(receiver,side*.043,y,z);
    cylinder(receiver,side*.044,-.047,.005,.012,.004,dark,'x',16);
    const selector=rounded(receiver,side*.048,-.045,.023,.006,.009,.035,edge);selector.rotation.x=-.4;
    rounded(receiver,side*.046,-.006,-.19,.007,.035,.032,dark);
  }
  rounded(receiver,.05,-.022,-.082,.007,.007,.11,edge); // hinged dust cover
  cylinder(receiver,.055,.038,.064,.014,.034,metal,'x',20);
  rounded(receiver,0,.066,.113,.06,.013,.018,dark); // charging handle
  for(const side of [-1,1])rounded(receiver,side*.043,.066,.105,.035,.012,.018,dark);
  rail(receiver,-.205,.078,.083,.073);
  // Fine inlaid serial marks remain opaque geometry, not transparent decals.
  for(let i=0;i<9;i++)rounded(receiver,-.049,-.026,-.095+i*.008,.001,.002,.004+i%3*.001,label);
  for(let i=0;i<3;i++){const pin=rounded(receiver,-.049,.014,-.17+i*.012,.001,.013,.003,label);if(i===1)pin.rotation.x=.6;}

  const handguard=new THREE.Group();handguard.position.set(0,.008,-.225);weapon.add(handguard);
  const hgLength=.36;
  for(const side of [-1,1]){
    const holes=[];for(let z=-.054;z>-.33;z-=.058)holes.push([[z-.018,-.014],[z+.018,-.014],[z+.024,.008],[z+.019,.018],[z-.019,.018],[z-.024,.008]]);
    profile(handguard,[[0,-.031],[0,.035],[-.018,.046],[-.335,.046],[-.36,.025],[-.36,-.028],[-.333,-.042],[-.02,-.042]],.006,polymer,{x:side*.044,holes,bevel:.0015});
    for(let z=-.027;z>-.35;z-=.116)screw(handguard,side*.048,-.025,z,.005);
    // Faceted shoulders join the side plates to the lower and upper ribs.
    const rib=rounded(handguard,side*.031,-.034,-.18,.019,.016,.34,metal);rib.rotation.z=side*.52;
  }
  rounded(handguard,0,-.045,-.18,.064,.012,.345,polymer);
  rail(handguard,-.348,-.005,.075,.066);
  ring(handguard,0,.007,-.008,.051,.038,.018,metal,'z',32);
  const barrel=new THREE.Group();weapon.add(barrel);cylinder(barrel,0,0,0,.0135,.25,edge,'z',24);
  const barrelSleeve=new THREE.Group();weapon.add(barrelSleeve);ring(barrelSleeve,0,0,0,.022,.0138,.058,dark,'z',24);
  const muzzle=new THREE.Group();weapon.add(muzzle);
  ring(muzzle,0,0,-.018,.0235,.011,.048,dark,'z',32);
  ring(muzzle,0,0,-.047,.0255,.014,.013,edge,'z',32);
  for(let i=0;i<4;i++){const a=i/4*Math.PI*2,prong=rounded(muzzle,Math.cos(a)*.019,Math.sin(a)*.019,-.067,.012,.012,.031,dark);prong.rotation.z=a;}
  cylinder(muzzle,0,0,-.064,.0105,.003,rubber,'z',24);
  const suppressor=new THREE.Group();weapon.add(suppressor);
  ring(suppressor,0,0,-.08,.035,.012,.19,dark,'z',32);
  for(const z of [-.166,-.15,-.13,.008])ring(suppressor,0,0,z,.036,.031,.008,metal,'z',32);
  cylinder(suppressor,0,0,-.177,.0115,.002,rubber,'z',24);suppressor.visible=false;

  // A buffer tube and a skeletonised adjustable stock, not a rectangular brick.
  cylinder(receiver,0,.01,.226,.024,.22,metal,'z',24);
  for(const z of [.135,.149,.163])ring(receiver,0,.01,z,.027,.022,.006,dark,'z',24);
  profile(receiver,[[.225,.032],[.361,.032],[.46,-.011],[.483,-.122],[.431,-.143],[.295,-.104],[.268,-.055],[.225,-.045]],.074,polymer,{holes:[[[.292,-.047],[.364,-.044],[.422,-.073],[.43,-.109],[.325,-.082]]],bevel:.004});
  profile(receiver,[[.243,.026],[.252,.05],[.383,.05],[.429,.027],[.393,.013],[.25,.013]],.079,rubber,{bevel:.004});
  profile(receiver,[[.451,.009],[.484,-.009],[.505,-.13],[.48,-.15],[.458,-.129]],.084,rubber,{bevel:.004});
  for(let y=-.02;y>-.13;y-=.018)rounded(receiver,0,y,.499,.087,.006,.004,polymer);
  rounded(receiver,0,-.068,.268,.038,.02,.046,dark);
  ring(receiver,-.043,-.09,.388,.014,.009,.007,dark,'x',20);

  const magazine=new THREE.Group();magazine.name='removable-curved-magazine';weapon.add(magazine);
  const magBody=profile(magazine,[[-.155,-.092],[-.077,-.092],[-.071,-.181],[-.087,-.272],[-.116,-.337],[-.192,-.321],[-.17,-.24],[-.155,-.168]],.067,polymer,{bevel:.005});
  profile(magazine,[[-.194,-.314],[-.115,-.331],[-.11,-.347],[-.197,-.33]],.076,dark,{bevel:.002});
  for(const side of [-1,1])for(let i=0;i<3;i++){
    curve(magazine,[[side*.036,-.13,-.094-i*.022],[side*.037,-.23,-.108-i*.022],[side*.036,-.301,-.133-i*.022]],.0032,metal,10,8);
  }
  const supportAttachment=new THREE.Group();weapon.add(supportAttachment);supportAttachment.visible=false;
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.position.set(side*.035,-.04,-.535);leg.rotation.z=side*.16;supportAttachment.add(leg);
    cylinder(leg,0,-.07,0,.008,.17,metal,'y',14);rounded(leg,0,-.15,0,.025,.014,.033,rubber);
  }
  const beltBox=new THREE.Group();supportAttachment.add(beltBox);
  profile(beltBox,[[-.15,-.11],[-.015,-.11],[-.007,-.265],[-.17,-.269],[-.18,-.232]],.15,polymer,{bevel:.005});
  rounded(beltBox,0,-.117,-.087,.16,.025,.16,metal);
  for(let i=0;i<5;i++){cylinder(beltBox,.086,-.105-i*.012,-.12,.004,.065,brass,'z',10);}

  // Aperture sights have actual holes and never cover the aiming centre.
  const ironSights=new THREE.Group();weapon.add(ironSights);
  rounded(ironSights,0,.111,.043,.055,.027,.024,dark);
  ring(ironSights,0,.147,.043,.022,.012,.014,dark,'z',24);
  const frontSight=new THREE.Group();ironSights.add(frontSight);frontSight.position.set(0,0,-.525);
  profile(frontSight,[[-.01,.062],[-.01,.123],[.01,.123],[.01,.062]],.017,dark,{bevel:.001});
  for(const side of [-1,1])curve(frontSight,[[side*.028,.105,.002],[side*.022,.15,.002],[side*.009,.16,.002]],.0045,dark,8,10);
  const scope=new THREE.Group();weapon.add(scope);scope.visible=false;
  for(const z of [-.235,-.07]){rounded(scope,0,.112,z,.045,.044,.026,metal);ring(scope,0,.169,z,.041,.034,.019,dark,'z',24);}
  ring(scope,0,.169,-.15,.034,.025,.24,dark,'z',32);
  ring(scope,0,.169,-.28,.046,.029,.071,dark,'z',32);
  ring(scope,0,.169,-.012,.039,.03,.05,dark,'z',32);
  cylinder(scope,0,.169,.014,.029,.003,lens,'z',32);
  cylinder(scope,0,.169,-.318,.027,.003,lens,'z',32);
  cylinder(scope,0,.209,-.15,.019,.032,edge,'y',20);
  cylinder(scope,.042,.169,-.15,.018,.026,dark,'x',20);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;rounded(scope,Math.cos(a)*.037,.169+Math.sin(a)*.037,-.04,.005,.005,.045,metal).rotation.z=a;}

  // Continuous fabric sleeves, elastic cuffs and genuinely curved glove fingers.
  const leftArm=new THREE.Group();leftArm.name='left-articulated-forearm';weapon.add(leftArm);
  loft(leftArm,[[-.40,-.47,.25],[-.29,-.32,.055],[-.18,-.20,-.16],[-.09,-.117,-.35]],[.095,.086,.067,.045],cloth,{segments:64,radial:24,ellipse:[1.13,.89],folds:.065});
  loft(leftArm,[[-.108,-.129,-.311],[-.095,-.119,-.34],[-.083,-.108,-.361]],[.049,.047,.044],cuff,{segments:14,radial:24,ellipse:[1.07,.92],folds:.07});
  curve(leftArm,[[-.385,-.406,.23],[-.268,-.262,.04],[-.167,-.148,-.18],[-.086,-.071,-.338]],.0018,seam,32,6);
  for(let i=0;i<3;i++)curve(leftArm,[[-.206-i*.014,-.197-i*.012,-.123+i*.022],[-.17-i*.014,-.154-i*.012,-.16+i*.022],[-.135-i*.014,-.153-i*.012,-.167+i*.022]],.003,cloth,8,8);
  const rightArm=new THREE.Group();weapon.add(rightArm);
  loft(rightArm,[[.27,-.48,.43],[.205,-.36,.3],[.12,-.26,.18],[.064,-.205,.116]],[.105,.091,.068,.046],cloth,{segments:64,radial:24,ellipse:[1.1,.9],folds:.055});
  loft(rightArm,[[.089,-.23,.151],[.074,-.212,.129],[.062,-.198,.112]],[.052,.049,.044],cuff,{segments:14,radial:24,ellipse:[1.06,.94],folds:.06});
  curve(rightArm,[[.323,-.441,.42],[.247,-.324,.29],[.161,-.226,.172],[.102,-.181,.112]],.0018,seam,32,6);
  const leftHand=new THREE.Group();leftHand.name='left-support-glove';leftHand.position.set(-.018,-.075,-.36);weapon.add(leftHand);
  const leftBase=leftHand.position.clone(), lp=p=>[p[0]-leftBase.x,p[1]-leftBase.y,p[2]-leftBase.z];
  ellipsoid(leftHand,lp([-.035,-.08,-.423]),[.051,.034,.068],glove);
  ellipsoid(leftHand,lp([-.025,-.093,-.426]),[.047,.018,.057],leather);
  for(let i=0;i<4;i++){
    const z=-.477+i*.028,r=i===3?.011:.0128;
    const points=[[-.06,-.071,z],[-.021,-.102,z-.002],[.026,-.094,z-.002],[.056,-.058,z],[.059,-.021,z+.003],[.044,.005,z+.006]];
    curve(leftHand,points.map(lp),r,glove,20,12);
    ellipsoid(leftHand,lp([.039,-.077,z]),[.016,.018,.016],knuckle);
    for(const [x,y]of [[-.016,-.105],[.056,-.041]])curve(leftHand,[[x-.006,y-.003,z-.01],[x,y-.006,z],[x+.006,y-.003,z+.01]].map(lp),.0012,seam,6,6);
  }
  curve(leftHand,[[-.067,-.068,-.383],[-.082,-.034,-.395],[-.071,.012,-.42],[-.047,.031,-.438]].map(lp),.015,glove,20,12);
  ellipsoid(leftHand,lp([-.073,-.017,-.407]),[.018,.022,.023],knuckle);
  curve(leftHand,[[-.07,-.092,-.375],[-.077,-.098,-.411],[-.072,-.087,-.464]].map(lp),.0018,seam,16,6);
  const rightHand=new THREE.Group();rightHand.name='right-trigger-glove';weapon.add(rightHand);
  ellipsoid(rightHand,[.048,-.174,.092],[.037,.064,.045],glove);
  ellipsoid(rightHand,[.027,-.178,.071],[.029,.057,.035],leather);
  for(let i=0;i<3;i++){
    const y=-.156-i*.03;
    curve(rightHand,[[.059,y,.114],[.067,y-.005,.074],[.045,y-.008,.036],[.006,y-.005,.027],[-.028,y,.043],[-.032,y+.005,.064]],.012,glove,20,12);
    ellipsoid(rightHand,[.062,y-.002,.048],[.015,.016,.018],knuckle);
    curve(rightHand,[[.051,y-.013,.041],[.063,y-.014,.049],[.068,y-.011,.061]],.0012,seam,6,6);
  }
  // Index finger reaches the trigger rather than becoming a fourth grip block.
  curve(rightHand,[[.06,-.13,.096],[.069,-.107,.057],[.049,-.092,.019],[.021,-.091,.006],[.014,-.102,.012]],.012,glove,24,12);
  curve(rightHand,[[.057,-.12,.12],[.022,-.108,.139],[-.014,-.108,.122],[-.03,-.124,.091]],.016,glove,20,12);
  curve(rightHand,[[.071,-.143,.12],[.077,-.176,.116],[.066,-.214,.104]],.0018,seam,16,6);
  for(const [y,z]of [[-.15,.123],[-.18,.12],[-.211,.11]])ellipsoid(rightHand,[.076,y,z],[.013,.013,.016],knuckle);

  const flashMaterial=new THREE.MeshBasicMaterial({name:'muzzle-flash',color:0xffd08a,transparent:true,opacity:.92,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});ownedMaterials.add(flashMaterial);
  const muzzleFlash=new THREE.Group();weapon.add(muzzleFlash);muzzleFlash.visible=false;
  const flashShape=new THREE.Shape();for(let i=0;i<12;i++){const a=i/12*Math.PI*2,r=i%2?.018:.062;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?flashShape.lineTo(x,y):flashShape.moveTo(x,y);}flashShape.closePath();
  for(const angle of [0,Math.PI/2]){const f=mesh(muzzleFlash,new THREE.ShapeGeometry(flashShape),flashMaterial,0,0,-.045);f.rotation.y=angle*.25;}
  const flashLight=new THREE.PointLight(0xffc176,0,3.5,2);weapon.add(flashLight);

  // Merge each rigid island by material. Articulated groups remain independent.
  function batch(group){
    for(const child of [...group.children])if(child.isGroup)batch(child);
    const materials=new Map();for(const child of group.children)if(child.isMesh&&!Array.isArray(child.material)){if(!materials.has(child.material))materials.set(child.material,[]);materials.get(child.material).push(child);}
    for(const [material,meshes]of materials){if(meshes.length<2)continue;const parts=meshes.map(m=>{m.updateMatrix();const g=m.geometry.clone().applyMatrix4(m.matrix);const n=g.index?g.toNonIndexed():g; if(n!==g)g.dispose();return n;});const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());if(!geometry)continue;ownedGeometries.add(geometry);const merged=new THREE.Mesh(geometry,material);merged.name=`batched-${material.name}`;group.add(merged);for(const m of meshes)m.removeFromParent();}
  }
  for(const island of [receiver,handguard,barrel,barrelSleeve,muzzle,suppressor,magazine,supportAttachment,scope,ironSights,leftArm,rightArm,leftHand,rightHand])batch(island);
  // Dispose unreferenced source buffers after batching, retaining reused shapes.
  const liveGeometry=new Set();weapon.traverse(o=>{if(o.geometry)liveGeometry.add(o.geometry);});for(const geometry of ownedGeometries)if(!liveGeometry.has(geometry)){geometry.dispose();ownedGeometries.delete(geometry);}
  let previousClass='';
  function update({classId='assault',aim=0,reloadMotion=0,kick=0,clock=0}={}){
    if(classId!==previousClass){
      previousClass=classId;
      const length=classId==='medic'?.255:classId==='recon'?.42:classId==='support'?.39:.36;
      const barrelLength=classId==='medic'?.115:classId==='recon'?.27:classId==='support'?.24:.19;
      const end=-.225-length-barrelLength;
      handguard.scale.z=length/hgLength;barrel.position.set(0,.015,-.225-length-barrelLength/2);barrel.scale.z=barrelLength/.25;
      barrelSleeve.position.set(0,.015,-.225-length+.015);muzzle.position.set(0,.015,end);
      suppressor.position.set(0,.015,end-.035);supportAttachment.visible=classId==='support';magBody.visible=classId!=='support';
      magazine.scale.set(1,classId==='recon'?.72:classId==='medic'?1.08:1,classId==='medic'?.74:1);
      frontSight.position.z=-.225-length+.035;
      weapon.userData.muzzleZ=end-.085;
    }
    scope.visible=classId==='recon'&&aim<.92;suppressor.visible=classId==='recon';ironSights.visible=classId!=='recon'||aim>.92;
    muzzleFlash.position.set(0,.015,weapon.userData.muzzleZ-(classId==='recon'?.19:0));flashLight.position.copy(muzzleFlash.position);
    leftHand.position.set(leftBase.x-reloadMotion*.03,leftBase.y-reloadMotion*.17,leftBase.z+reloadMotion*.22);
    leftArm.position.set(-reloadMotion*.03,-reloadMotion*.17,reloadMotion*.22);leftArm.rotation.set(0,0,0);
    // Forearm/palm overlap is continuous for both the ready and reload poses.
    bolt.position.z=-.02+kick*.036;
    muzzleFlash.visible=kick>.65;muzzleFlash.rotation.z=clock*43;flashLight.intensity=kick>.65?1.8:0;
  }
  function dispose(){for(const geometry of ownedGeometries)geometry.dispose();for(const material of ownedMaterials)material.dispose();}
  update();weapon.position.set(.26,-.23,-.42);
  return {weapon,handguard,bolt,barrel,barrelSleeve,muzzle,suppressor,supportAttachment,scope,magazine,leftHand,leftArm,muzzleFlash,flashLight,flashMaterial,update,dispose};
}
