import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// This viewmodel uses ordinary opaque depth-tested geometry. It is rendered in
// its own depth pass by GameRenderer; no material is allowed to see through it.
export function createWeaponRig(owner = {}) {
  const weapon = new THREE.Group(); weapon.name = 'S09-first-person-rig';
  const ownedGeometries = new Set(), ownedMaterials = new Set(), ownedTextures = new Set();
  const isIntegrated = !!owner.integratedGpu;
  const mat = (name, color, roughness=.7, metalness=.2, extra={}) => {
    if (isIntegrated) {
      const { bumpMap: _b, bumpScale: _s, ...rest } = extra;
      const m = new THREE.MeshLambertMaterial({ color, opacity: 1, transparent: false, depthTest: true, depthWrite: true, ...rest });
      m.name = name; ownedMaterials.add(m); return m;
    }
    const m = new THREE.MeshStandardMaterial({color,roughness,metalness,opacity:1,transparent:false,depthTest:true,depthWrite:true,...extra});
    m.name=name;ownedMaterials.add(m);return m;
  };
  function surfaceGrain(name, directional, repeat) {
    const size = 64, pixels = new Uint8Array(size * size * 4);
    let seed = directional ? 1669 : 2081;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed >>> 24) / 255 - .5;
      const brush = directional ? 11 * Math.sin((y * 7 + x * .11) * Math.PI / 32) : 0;
      const value = Math.round(132 + brush + noise * (directional ? 18 : 44));
      const index = (y * size + x) * 4;
      pixels[index] = value;
      pixels[index + 1] = value;
      pixels[index + 2] = value;
      pixels[index + 3] = 255;
    }
    const texture = new THREE.DataTexture(pixels, size, size);
    texture.name = name;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.repeat.set(...repeat);
    texture.needsUpdate = true;
    ownedTextures.add(texture);
    return texture;
  }
  const metalGrain = surfaceGrain('brushed-metal-grain', true, [9, 14]);
  const polymerGrain = surfaceGrain('moulded-polymer-grain', false, [10, 10]);
  const metal=mat('weapon-forged-metal',0x48545a,.48,.69,{bumpMap:metalGrain,bumpScale:.00016});
  const edge=mat('weapon-machined-edges',0x788486,.36,.76,{bumpMap:metalGrain,bumpScale:.00012});
  const dark=mat('weapon-recess-metal',0x1c252a,.64,.55);
  const polymer=mat('weapon-polymer',0x424b42,.83,.06,{bumpMap:polymerGrain,bumpScale:.00026});
  const anodized=mat('weapon-handguard-anodized',0x5d6355,.62,.48,{bumpMap:metalGrain,bumpScale:.00019});
  const worn=mat('weapon-worn-bevels',0x898474,.54,.52);
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
  const lens=mat('lens-coated-glass',0x527780,.12,.22,{transparent:true,opacity:.34,depthWrite:false,side:THREE.DoubleSide});
  const unitBox=new RoundedBoxGeometry(1,1,1,1,.09);ownedGeometries.add(unitBox);
  const unitSphere=new THREE.SphereGeometry(1,12,8);ownedGeometries.add(unitSphere);
  const detailBox = new THREE.BoxGeometry(1,1,1);
  function mesh(parent,geometry,material,x=0,y=0,z=0){ownedGeometries.add(geometry);const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=false;m.receiveShadow=false;parent.add(m);return m;}
  function rounded(parent,x,y,z,w,h,d,material){const m=mesh(parent,unitBox,material,x,y,z);m.scale.set(w,h,d);return m;}
  function detail(parent,x,y,z,w,h,d,material){const m=mesh(parent,detailBox,material,x,y,z);m.scale.set(w,h,d);return m;}
  function ellipsoid(parent,center,scale,material){const m=mesh(parent,unitSphere,material,...center);m.scale.set(...scale);return m;}
  function cylinder(parent,x,y,z,r,h,material,axis='z',segments=12){const g=new THREE.CylinderGeometry(r,r,h,Math.min(segments,14));if(axis==='z')g.rotateX(Math.PI/2);if(axis==='x')g.rotateZ(Math.PI/2);return mesh(parent,g,material,x,y,z);}
  function ring(parent,x,y,z,outer,inner,length,material,axis='z',segments=16){const points=[new THREE.Vector2(outer,-length/2),new THREE.Vector2(outer,length/2),new THREE.Vector2(inner,length/2),new THREE.Vector2(inner,-length/2),new THREE.Vector2(outer,-length/2)];const g=new THREE.LatheGeometry(points,Math.min(segments,16));if(axis==='z')g.rotateX(Math.PI/2);if(axis==='x')g.rotateZ(Math.PI/2);return mesh(parent,g,material,x,y,z);}
  function shapePath(points){const s=new THREE.Shape();points.forEach(([z,y],i)=>i?s.lineTo(-z,y):s.moveTo(-z,y));s.closePath();return s;}
  function profile(parent,points,width,material,{x=0,holes=[],bevel=.0025}={}){
    const shape=shapePath(points);for(const points of holes){const p=new THREE.Path();points.forEach(([z,y],i)=>i?p.lineTo(-z,y):p.moveTo(-z,y));p.closePath();shape.holes.push(p);}
    const g=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:bevel>0,bevelSegments:1,steps:1,bevelSize:bevel,bevelThickness:bevel,curveSegments:4});g.rotateY(Math.PI/2);g.translate(x-width/2,0,0);return mesh(parent,g,material);
  }
  function curve(parent,points,radius,material,segments=10,radial=6){const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return mesh(parent,new THREE.TubeGeometry(path,Math.min(segments,12),radius,Math.min(radial,6),false),material);}
  function loft(parent,points,radii,material,{segments=20,radial=12,ellipse=[1,1],folds=0}={}){
    segments = Math.min(segments, 22); radial = Math.min(radial, 12);
    const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),frames=path.computeFrenetFrames(segments,false),positions=[],uv=[],indices=[];
    for(let i=0;i<=segments;i++){const t=i/segments,p=path.getPointAt(t),u=t*(radii.length-1),j=Math.min(radii.length-2,Math.floor(u)),base=THREE.MathUtils.lerp(radii[j],radii[j+1],u-j),r=base*(1+folds*Math.sin(t*75)*Math.sin(Math.PI*t));
      for(let k=0;k<=radial;k++){const a=k/radial*Math.PI*2,c=Math.cos(a)*r*ellipse[0],s=Math.sin(a)*r*ellipse[1];positions.push(p.x+frames.normals[i].x*c+frames.binormals[i].x*s,p.y+frames.normals[i].y*c+frames.binormals[i].y*s,p.z+frames.normals[i].z*c+frames.binormals[i].z*s);uv.push(k/radial,t*3);}
    }
    for(let i=0;i<segments;i++)for(let k=0;k<radial;k++){const a=i*(radial+1)+k,b=a+radial+1;indices.push(a,a+1,b,b,a+1,b+1);}
    const front=positions.length/3;positions.push(...path.getPointAt(0).toArray());uv.push(.5,0);const back=positions.length/3;positions.push(...path.getPointAt(1).toArray());uv.push(.5,1);
    for(let k=0;k<radial;k++){indices.push(front,k+1,k);const a=segments*(radial+1)+k;indices.push(back,a,a+1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return mesh(parent,g,material);
  }
  function screw(parent,x,y,z,r=.006){cylinder(parent,x,y,z,r,.004,edge,'x',12);const slot=detail(parent,x+(x>0?.0025:-.0025),y,z,.0015,r*.32,r*1.25,dark);slot.rotation.x=.55;}
  function rail(parent,z0,z1,y=.093,width=.066){
    rounded(parent,0,y-.009,(z0+z1)/2,width*.76,.02,Math.abs(z1-z0)+.015,metal);
    for(let z=z0,index=0;z<z1;z+=.024,index++){
      profile(parent,[[z-.008,y-.005],[z-.011,y+.006],[z+.010,y+.006],[z+.008,y-.005]],width,dark,{bevel:.001});
      if (index % 4 === 1) detail(parent,-width*.38,y+.007,z,.006,.001,.010,worn);
    }
  }

  const glyphs = {
    '0':'111101101101111','1':'010110010010111','2':'111001111100111',
    '3':'111001111001111','4':'101101111001001','6':'111100111101111',
    '9':'111101111001111', A:'010101111101101', C:'111100100100111',
    D:'110101101101110', G:'111100101101111', M:'101111111101101',
    R:'110101110101101', S:'111100111001111', X:'101101010101101',
  };
  function engraving(parent, text, z, y, size=.00245) {
    for (const [letter, character] of [...text].entries()) {
      const pixels = glyphs[character];
      if (!pixels) continue;
      for (const [index, lit] of [...pixels].entries()) if (lit === '1') {
        detail(parent,-.0501,y-Math.floor(index/3)*size,z-(letter*4+index%3)*size,.00065,size*.86,size*.86,label);
      }
    }
  }

  const receiver=new THREE.Group();weapon.add(receiver);
  profile(receiver,[[-.225,-.03],[-.225,.044],[-.195,.072],[.067,.072],[.105,.052],[.113,-.027]],.083,metal,{holes:[[[-.139,.006],[-.027,.006],[-.027,.039],[-.139,.039]]]});
  // The ejection window is a real opening, backed by the bolt in a deep cavity.
  const bolt=new THREE.Group();bolt.position.set(0,0,-.02);weapon.add(bolt);
  cylinder(bolt,0,.022,-.065,.024,.155,edge,'z',24);
  profile(receiver,[[-.165,-.003],[-.165,.049],[.08,.049],[.094,.025],[.094,-.017],[-.11,-.022]],.007,metal,{x:-.044});
  profile(receiver,[[-.205,.048],[-.195,.058],[.057,.058],[.079,.047],[.044,.041],[-.186,.041]],.006,edge,{x:-.042,bevel:.001});
  profile(receiver,[[-.209,-.021],[-.171,-.02],[-.158,-.037],[-.181,-.065],[-.209,-.055]],.009,anodized,{x:-.043,bevel:.002});
  profile(receiver,[[-.149,-.043],[-.064,-.041],[-.072,-.059],[-.136,-.065]],.009,dark,{x:-.041,bevel:.001});
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
  profile(receiver,[[-.14,-.015],[-.027,-.015],[-.03,-.034],[-.137,-.034]],.006,dark,{x:.049,bevel:.001});
  for (const z of [-.12,-.08,-.04]) detail(receiver,.053,-.031,z,.001,.004,.013,edge);
  cylinder(receiver,.055,.038,.064,.014,.034,metal,'x',20);
  rounded(receiver,0,.066,.113,.06,.013,.018,dark); // charging handle
  for(const side of [-1,1])rounded(receiver,side*.043,.066,.105,.035,.012,.018,dark);
  rail(receiver,-.205,.078,.083,.073);
  // Opaque recessed-looking inlays remain sharp at the close first-person angle.
  engraving(receiver,'S09',.060,.036,.003);
  const weaponLabels = Object.fromEntries(Object.entries({assault:'AR416',medic:'MCX9',support:'MG36',recon:'DMR12'}).map(([name,mark]) => {
    const stamp = new THREE.Group();
    stamp.name = `${name}-receiver-engraving`;
    receiver.add(stamp);
    engraving(stamp,mark,-.004,.035);
    return [name,stamp];
  }));
  for(let i=0;i<8;i++)detail(receiver,-.049,.004,-.021+i*.007,.001,.0017,.003+i%3*.001,label);
  for(let i=0;i<3;i++){const pin=rounded(receiver,-.049,.014,-.17+i*.012,.001,.013,.003,label);if(i===1)pin.rotation.x=.6;}

  const handguard=new THREE.Group();handguard.position.set(0,.008,-.225);weapon.add(handguard);
  const hgLength=.36;
  for(const side of [-1,1]){
    const holes=[];for(let z=-.054;z>-.33;z-=.058)holes.push([[z-.018,-.014],[z+.018,-.014],[z+.024,.008],[z+.019,.018],[z-.019,.018],[z-.024,.008]]);
    profile(handguard,[[0,-.031],[0,.035],[-.018,.046],[-.335,.046],[-.36,.025],[-.36,-.028],[-.333,-.042],[-.02,-.042]],.006,anodized,{x:side*.044,holes,bevel:.0015});
    for(let z=-.027;z>-.35;z-=.116)screw(handguard,side*.048,-.025,z,.005);
    // Faceted shoulders join the side plates to the lower and upper ribs.
    const rib=rounded(handguard,side*.031,-.034,-.18,.019,.016,.34,metal);rib.rotation.z=side*.52;
    for(let z=-.052;z>-.32;z-=.058)detail(handguard,side*.047,.032,z,.0018,.004,.028,worn);
  }
  cylinder(handguard,0,.007,-.175,.014,.346,dark,'z',18);
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
  const rifleFeed = new THREE.Group(), compactFeed = new THREE.Group(), marksmanFeed = new THREE.Group();
  magazine.add(rifleFeed,compactFeed,marksmanFeed);
  profile(rifleFeed,[[-.155,-.092],[-.077,-.092],[-.071,-.181],[-.087,-.272],[-.116,-.337],[-.192,-.321],[-.17,-.24],[-.155,-.168]],.067,polymer,{bevel:.005});
  profile(rifleFeed,[[-.194,-.314],[-.115,-.331],[-.11,-.347],[-.197,-.33]],.076,dark,{bevel:.002});
  for(const side of [-1,1])for(let i=0;i<3;i++){
    curve(rifleFeed,[[side*.036,-.13,-.094-i*.022],[side*.037,-.23,-.108-i*.022],[side*.036,-.301,-.133-i*.022]],.0032,metal,10,8);
  }
  profile(compactFeed,[[-.138,-.091],[-.093,-.091],[-.098,-.336],[-.15,-.336]],.049,dark,{bevel:.003});
  rounded(compactFeed,0,-.338,-.124,.063,.018,.068,polymer);
  for(const side of [-1,1])for(let y=-.15;y>-.315;y-=.033)detail(compactFeed,side*.026,y,-.124,.003,.004,.037,edge);
  profile(marksmanFeed,[[-.163,-.091],[-.067,-.091],[-.063,-.209],[-.158,-.226]],.076,metal,{bevel:.004});
  profile(marksmanFeed,[[-.161,-.216],[-.062,-.200],[-.061,-.214],[-.162,-.233]],.082,dark,{bevel:.002});
  for(const side of [-1,1])for(const z of [-.146,-.116,-.084])detail(marksmanFeed,side*.04,-.164,z,.003,.066,.009,dark);
  const supportAttachment=new THREE.Group();weapon.add(supportAttachment);supportAttachment.visible=false;
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.position.set(side*.035,-.04,-.535);leg.rotation.z=side*.16;supportAttachment.add(leg);
    cylinder(leg,0,-.07,0,.008,.17,metal,'y',14);rounded(leg,0,-.15,0,.025,.014,.033,rubber);
  }
  const beltBox=new THREE.Group();supportAttachment.add(beltBox);
  profile(beltBox,[[-.15,-.11],[-.015,-.11],[-.007,-.265],[-.17,-.269],[-.18,-.232]],.15,polymer,{bevel:.005});
  rounded(beltBox,0,-.117,-.087,.16,.025,.16,metal);
  for(let i=0;i<5;i++){cylinder(beltBox,.086,-.105-i*.012,-.12,.004,.065,brass,'z',10);}
  const feedCover = new THREE.Group();
  feedCover.position.set(0,.068,-.205);supportAttachment.add(feedCover);
  profile(feedCover,[[.004,0],[.012,.041],[.24,.037],[.263,.014],[.25,-.012],[.021,-.014]],.106,metal,{bevel:.004});
  for (const z of [.05,.09,.13,.17,.21]) rounded(feedCover,0,.039,z,.088,.007,.023,dark);
  for (const z of [.046,.195]) screw(feedCover,-.055,.014,z,.006);
  for (const z of [-.14,-.115,-.09,-.065]) cylinder(supportAttachment,-.061,.056,z,.0045,.04,brass,'x',12);

  // Aperture sights have actual holes and never cover the aiming centre.
  const ironSights=new THREE.Group();weapon.add(ironSights);
  rounded(ironSights,0,.111,.043,.055,.027,.024,dark);
  ring(ironSights,0,.164,.043,.020,.011,.014,dark,'z',24);
  const frontSight=new THREE.Group();ironSights.add(frontSight);frontSight.position.set(0,0,-.525);
  profile(frontSight,[[-.01,.062],[-.01,.139],[.005,.162],[.01,.062]],.012,dark,{bevel:.001});
  for(const side of [-1,1])curve(frontSight,[[side*.028,.105,.002],[side*.026,.15,.002],[side*.018,.174,.002]],.0045,dark,8,10);
  const scope=new THREE.Group();weapon.add(scope);scope.visible=false;
  for(const z of [-.235,-.07]){rounded(scope,0,.112,z,.045,.044,.026,metal);ring(scope,0,.169,z,.041,.034,.019,dark,'z',24);}
  ring(scope,0,.169,-.15,.034,.025,.24,dark,'z',32);
  ring(scope,0,.169,-.28,.046,.029,.071,dark,'z',32);
  ring(scope,0,.169,-.012,.039,.03,.05,dark,'z',32);
  cylinder(scope,0,.169,.014,.029,.003,lens,'z',32);
  cylinder(scope,0,.169,-.318,.027,.003,lens,'z',32);
  cylinder(scope,0,.209,-.15,.019,.032,edge,'y',20);
  cylinder(scope,.042,.169,-.15,.018,.026,dark,'x',20);
  for(let i=0;i<14;i++){const a=i/14*Math.PI*2;detail(scope,Math.cos(a)*.037,.169+Math.sin(a)*.037,-.04,.005,.005,.045,metal).rotation.z=a;}
  ring(scope,0,.169,-.312,.047,.035,.013,edge,'z',24);
  ring(scope,0,.169,.017,.041,.030,.012,edge,'z',24);
  for(let i=0;i<12;i++){
    const a=i/12*Math.PI*2;
    detail(scope,Math.cos(a)*.019,.216,-.15+Math.sin(a)*.019,.004,.016,.004,dark).rotation.y=-a;
  }
  const reflex = new THREE.Group();weapon.add(reflex);
  rounded(reflex,0,.109,-.10,.071,.022,.106,metal);
  ring(reflex,0,.166,-.127,.034,.025,.065,dark,'z',24);
  ring(reflex,0,.166,-.09,.035,.026,.009,edge,'z',24);
  cylinder(reflex,0,.166,-.105,.025,.002,lens,'z',24);
  cylinder(reflex,.038,.16,-.12,.011,.013,edge,'x',16);
  screw(reflex,-.034,.107,-.118,.0045);
  const redDot = new THREE.MeshBasicMaterial({color:0xffab78,toneMapped:false});
  redDot.name='weapon-optic-emitter';ownedMaterials.add(redDot);
  cylinder(reflex,0,.166,-.103,.0017,.001,redDot,'z',10);
  const compactOptic = new THREE.Group();weapon.add(compactOptic);
  rounded(compactOptic,0,.108,-.117,.061,.022,.075,dark);
  const frame = new THREE.Shape();
  frame.moveTo(-.035,.133);frame.lineTo(-.034,.191);frame.lineTo(-.023,.205);frame.lineTo(.023,.205);frame.lineTo(.034,.191);frame.lineTo(.035,.133);frame.closePath();
  const window = new THREE.Path();
  window.moveTo(-.025,.142);window.lineTo(.025,.142);window.lineTo(.024,.189);window.lineTo(.017,.195);window.lineTo(-.017,.195);window.lineTo(-.024,.189);window.closePath();frame.holes.push(window);
  mesh(compactOptic,new THREE.ExtrudeGeometry(frame,{depth:.042,bevelSize:.002,bevelThickness:.002,bevelSegments:1}),dark,0,0,-.143);
  mesh(compactOptic,new THREE.ShapeGeometry(new THREE.Shape(window.getPoints())),lens,0,0,-.126);
  cylinder(compactOptic,0,.166,-.122,.0017,.001,redDot,'z',10);
  for(const side of [-1,1])screw(compactOptic,side*.033,.144,-.123,.0045);

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
  function finger(parent, points, radius, segments=18) {
    return loft(parent,points,[radius*1.06,radius,radius*.86,radius*.45],glove,{segments,radial:10,ellipse:[1,.9]});
  }
  ellipsoid(leftHand,lp([-.035,-.08,-.423]),[.051,.034,.068],glove);
  ellipsoid(leftHand,lp([-.025,-.093,-.426]),[.047,.018,.057],leather);
  for(let i=0;i<4;i++){
    const z=-.477+i*.028,r=i===3?.011:.0128;
    const points=[[-.06,-.071,z],[-.021,-.102,z-.002],[.026,-.094,z-.002],[.056,-.058,z],[.059,-.021,z+.003],[.044,.005,z+.006]];
    finger(leftHand,points.map(lp),r);
    ellipsoid(leftHand,lp([.039,-.077,z]),[.016,.018,.016],knuckle);
    for(const [x,y]of [[-.016,-.105],[.056,-.041]])curve(leftHand,[[x-.006,y-.003,z-.01],[x,y-.006,z],[x+.006,y-.003,z+.01]].map(lp),.0012,seam,6,6);
  }
  finger(leftHand,[[-.067,-.068,-.383],[-.082,-.034,-.395],[-.071,.012,-.42],[-.047,.031,-.438]].map(lp),.015);
  ellipsoid(leftHand,lp([-.073,-.017,-.407]),[.018,.022,.023],knuckle);
  curve(leftHand,[[-.07,-.092,-.375],[-.077,-.098,-.411],[-.072,-.087,-.464]].map(lp),.0018,seam,16,6);
  const rightHand=new THREE.Group();rightHand.name='right-trigger-glove';weapon.add(rightHand);
  ellipsoid(rightHand,[.048,-.174,.092],[.037,.064,.045],glove);
  ellipsoid(rightHand,[.027,-.178,.071],[.029,.057,.035],leather);
  for(let i=0;i<3;i++){
    const y=-.156-i*.03;
    finger(rightHand,[[.059,y,.114],[.067,y-.005,.074],[.045,y-.008,.036],[.006,y-.005,.027],[-.028,y,.043],[-.032,y+.005,.064]],.012);
    ellipsoid(rightHand,[.062,y-.002,.048],[.015,.016,.018],knuckle);
    curve(rightHand,[[.051,y-.013,.041],[.063,y-.014,.049],[.068,y-.011,.061]],.0012,seam,6,6);
  }
  // Index finger reaches the trigger rather than becoming a fourth grip block.
  finger(rightHand,[[.06,-.13,.096],[.069,-.107,.057],[.049,-.092,.019],[.021,-.091,.006],[.014,-.102,.012]],.012,22);
  finger(rightHand,[[.057,-.12,.12],[.022,-.108,.139],[-.014,-.108,.122],[-.03,-.124,.091]],.016);
  curve(rightHand,[[.071,-.143,.12],[.077,-.176,.116],[.066,-.214,.104]],.0018,seam,16,6);
  for(const [y,z]of [[-.15,.123],[-.18,.12],[-.211,.11]])ellipsoid(rightHand,[.076,y,z],[.013,.013,.016],knuckle);

  const flashMaterial=new THREE.MeshBasicMaterial({name:'muzzle-flash',color:0xffd08a,transparent:true,opacity:.92,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});ownedMaterials.add(flashMaterial);
  const muzzleFlash=new THREE.Group();weapon.add(muzzleFlash);muzzleFlash.visible=false;
  const flashShape=new THREE.Shape();for(let i=0;i<12;i++){const a=i/12*Math.PI*2,r=i%2?.018:.062;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?flashShape.lineTo(x,y):flashShape.moveTo(x,y);}flashShape.closePath();
  for(const angle of [0,Math.PI/2]){const f=mesh(muzzleFlash,new THREE.ShapeGeometry(flashShape),flashMaterial,0,0,-.045);f.rotation.y=angle*.25;}
  const flashLight={position:new THREE.Vector3(),intensity:0};

  // Merge each rigid island by material. Articulated groups remain independent.
  function batch(group){
    for(const child of [...group.children])if(child.isGroup)batch(child);
    const materials=new Map();for(const child of group.children)if(child.isMesh&&!Array.isArray(child.material)){if(!materials.has(child.material))materials.set(child.material,[]);materials.get(child.material).push(child);}
    for(const [material,meshes]of materials){if(meshes.length<2)continue;const parts=meshes.map(m=>{m.updateMatrix();const g=m.geometry.clone().applyMatrix4(m.matrix);const n=g.index?g.toNonIndexed():g; if(n!==g)g.dispose();return n;});const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());if(!geometry)continue;ownedGeometries.add(geometry);const merged=new THREE.Mesh(geometry,material);merged.name=`batched-${material.name}`;group.add(merged);for(const m of meshes)m.removeFromParent();}
  }
  for(const island of [receiver,handguard,barrel,barrelSleeve,muzzle,suppressor,magazine,supportAttachment,scope,reflex,compactOptic,ironSights,leftArm,rightArm,leftHand,rightHand])batch(island);
  // Dispose unreferenced source buffers after batching, retaining reused shapes.
  const liveGeometry=new Set();weapon.traverse(o=>{if(o.geometry)liveGeometry.add(o.geometry);});for(const geometry of ownedGeometries)if(!liveGeometry.has(geometry)){geometry.dispose();ownedGeometries.delete(geometry);}
  const loadouts = {
    assault:{guard:.36,barrel:.19,width:1,finish:0x626859,handZ:-.423,grasp:[-.052,-.236,-.124]},
    medic:{guard:.245,barrel:.109,width:.93,finish:0x474f50,handZ:-.378,grasp:[-.045,-.237,-.123]},
    support:{guard:.397,barrel:.255,width:1.16,finish:0x555e55,handZ:-.447,grasp:[-.092,-.203,-.111]},
    recon:{guard:.432,barrel:.266,width:.99,finish:0x766f59,handZ:-.456,grasp:[-.056,-.176,-.112]},
  };
  const reloadKeys = [
    {time:0,       x:0,     y:0,     z:0,    pitch:0,     roll:0},
    {time:.17,     x:0,     y:0,     z:0,    pitch:0,     roll:0},
    {time:.34,     x:-.013, y:-.18,  z:.021, pitch:.08,   roll:-.10},
    {time:.47,     x:-.146, y:-.347, z:.085, pitch:-.245, roll:-.34},
    {time:.52,     x:-.152, y:-.347, z:.090, pitch:-.27,  roll:-.36},
    {time:.70,     x:-.021, y:-.155, z:.016, pitch:.065,  roll:-.09},
    {time:.82,     x:0,     y:0,     z:0,    pitch:0,     roll:0},
    {time:1,       x:0,     y:0,     z:0,    pitch:0,     roll:0},
  ];
  const palmLocal = new THREE.Vector3(...lp([-.035,-.08,-.423]));
  const wristLocal = new THREE.Vector3(...lp([-.083,-.108,-.361]));
  const shoulder = new THREE.Vector3(-.40,-.47,.25);
  const armAxis = new THREE.Vector3(0,0,1);
  const armDirection = new THREE.Vector3(-.083,-.108,-.361).sub(shoulder);
  const armLength = armDirection.length();
  const armRotation = new THREE.Quaternion().setFromUnitVectors(armAxis,armDirection.normalize());
  const armScale = new THREE.Vector3(1,1,1);
  const restArmInverse = new THREE.Matrix4().compose(shoulder,armRotation,armScale).invert();
  const wristDirection = new THREE.Vector3(), palmTarget = new THREE.Vector3(), gripTarget = new THREE.Vector3(), palmOffset = new THREE.Vector3();
  const chargeGrip = new THREE.Vector3(-.076,.019,.044);
  leftArm.matrixAutoUpdate = false;

  function poseReload(loadout, support, phase, amount, charging) {
    const feed = support ? beltBox : magazine;
    let next = 1;
    while (next < reloadKeys.length - 1 && phase > reloadKeys[next].time) next++;
    const from = reloadKeys[next - 1], to = reloadKeys[next];
    const blend = THREE.MathUtils.smoothstep(phase,from.time,to.time);
    const value = channel => THREE.MathUtils.lerp(from[channel],to[channel],blend) * amount;
    const feedDepth = support ? 1.08 : 1;
    feed.position.set(value('x'),value('y')*feedDepth,value('z'));
    feed.rotation.set(value('pitch'),0,value('roll'));
    const grip = THREE.MathUtils.smoothstep(phase,.015,.17) * (1-THREE.MathUtils.smoothstep(phase,.82,.99)) * amount;
    feedCover.rotation.x = support ? -1.07 * THREE.MathUtils.smoothstep(phase,.04,.19) * (1-THREE.MathUtils.smoothstep(phase,.73,.9)) * amount : 0;

    gripTarget.set(...loadout.grasp).applyQuaternion(feed.quaternion).add(feed.position);
    palmTarget.set(-.035,-.08,loadout.handZ).lerp(gripTarget,grip);
    palmTarget.lerp(chargeGrip,charging);
    leftHand.rotation.set(-.92*grip+feed.rotation.x*grip+charging*.7,.42*grip+charging*.3,.27*grip+feed.rotation.z*grip);
    palmOffset.copy(palmLocal).applyQuaternion(leftHand.quaternion);
    leftHand.position.copy(palmTarget).sub(palmOffset);

    // Keep the shoulder anchored while the cuff follows the rotating wrist.
    wristDirection.copy(wristLocal).applyQuaternion(leftHand.quaternion).add(leftHand.position).sub(shoulder);
    armScale.z = wristDirection.length()/armLength;
    armRotation.setFromUnitVectors(armAxis,wristDirection.normalize());
    leftArm.matrix.compose(shoulder,armRotation,armScale).multiply(restArmInverse);
    leftArm.matrixWorldNeedsUpdate = true;
  }

  let previousClass = '';
  function update({classId='assault',aim=0,reloadPhase,reloadMotion=0,reloadEmpty=true,kick=0,clock=0}={}){
    if (!Object.hasOwn(loadouts,classId)) classId = 'assault';
    const loadout = loadouts[classId], support = classId === 'support', recon = classId === 'recon';
    if (classId !== previousClass) {
      previousClass = classId;
      const end = -.225-loadout.guard-loadout.barrel;
      handguard.scale.set(loadout.width,1,loadout.guard/hgLength);
      anodized.color.setHex(loadout.finish);
      barrel.position.set(0,.015,end+loadout.barrel/2);
      barrel.scale.z = loadout.barrel/.25;
      barrelSleeve.position.set(0,.015,-.225-loadout.guard+.015);
      muzzle.position.set(0,.015,end);
      suppressor.position.set(0,.015,end-.035);
      muzzle.visible = !recon;
      supportAttachment.visible = support;
      magazine.visible = !support;
      rifleFeed.visible = classId === 'assault';
      compactFeed.visible = classId === 'medic';
      marksmanFeed.visible = recon;
      reflex.visible = classId === 'assault';
      compactOptic.visible = classId === 'medic';
      ironSights.visible = support;
      for (const [name, stamp] of Object.entries(weaponLabels)) stamp.visible = name === classId;
      frontSight.position.z = -.225-loadout.guard+.035;
      weapon.userData.muzzleZ = end-(recon?.215:.084);
      for (const feed of [magazine,beltBox]) { feed.position.set(0,0,0);feed.rotation.set(0,0,0); }
    }
    scope.visible = recon && aim < .92;
    suppressor.visible = recon;
    muzzleFlash.position.set(0,.015,weapon.userData.muzzleZ);
    flashLight.position.copy(muzzleFlash.position);
    const hasPhase = Number.isFinite(reloadPhase);
    const phase = hasPhase ? THREE.MathUtils.clamp(reloadPhase,0,1) : reloadMotion > 0 ? .64 : 1;
    const amount = hasPhase ? 1 : THREE.MathUtils.clamp(reloadMotion,0,1);
    const chargeStart=support?.89:.82, chargePeak=support?.93:.875, chargeEnd=support?.98:.94;
    const charging=support||reloadEmpty
      ? THREE.MathUtils.smoothstep(phase,chargeStart,chargePeak)*(1-THREE.MathUtils.smoothstep(phase,chargePeak,chargeEnd))
      : 0;
    poseReload(loadout,support,phase,amount,charging);
    bolt.position.z = -.02+kick*.036+charging*.045;
    muzzleFlash.visible = kick > .65;
    muzzleFlash.rotation.z = clock*43;
    muzzleFlash.scale.setScalar(.78+kick*.22);
    flashLight.intensity = kick > .65 ? 1.8 : 0;
  }
  function dispose(){
    for(const geometry of ownedGeometries)geometry.dispose();
    for(const material of ownedMaterials)material.dispose();
    for(const texture of ownedTextures)texture.dispose();
  }
  update();weapon.position.set(.26,-.23,-.42);
  return {weapon,handguard,bolt,barrel,barrelSleeve,muzzle,suppressor,supportAttachment,scope,magazine,leftHand,leftArm,muzzleFlash,flashLight,flashMaterial,update,dispose};
}
