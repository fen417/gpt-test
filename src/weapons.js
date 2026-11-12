import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { smoothRingSeams } from './character-geometry.js';
import { gloveSurface } from './glove-geometry.js';
import { createBakedGlove } from './fps-glove-mesh.js';

// This viewmodel uses ordinary opaque depth-tested geometry. It is rendered in
// its own depth pass by GameRenderer; no material is allowed to see through it.
export function createWeaponRig(owner = {}) {
  const weapon = new THREE.Group(); weapon.name = 'S09-first-person-rig';
  const ownedGeometries = new Set(), ownedMaterials = new Set(), ownedTextures = new Set();
  const mat = (name, color, roughness=.7, metalness=.2, extra={}) => {
    const { bumpMap: _b, bumpScale: _s, ...rest } = extra;
    const highMat = new THREE.MeshStandardMaterial({color,roughness,metalness,opacity:1,transparent:false,depthTest:true,depthWrite:true,...extra});
    const lowMat = new THREE.MeshLambertMaterial({ color, opacity: 1, transparent: false, depthTest: true, depthWrite: true, ...rest });
    highMat.name = name; lowMat.name = `${name}-low`;
    highMat._lowMaterial = lowMat;
    lowMat._highMaterial = highMat;
    ownedMaterials.add(highMat); ownedMaterials.add(lowMat);
    return owner.lowQuality ? lowMat : highMat;
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
  const fabricGrain = surfaceGrain('glove-woven-fabric', true, [2, 2]);
  const leatherGrain = surfaceGrain('glove-pebbled-leather', false, [2, 3]);
  const fabricPixels = fabricGrain.image.data;
  const leatherPixels = leatherGrain.image.data;
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
    const i=(y*64+x)*4;
    const warp=x%4, weft=y%4, over=(Math.floor(x/4)+Math.floor(y/4))%2===0;
    const weave=(over?warp:weft)===0?-29:(over?warp:weft)===2?18:0;
    const value=216+Math.round((fabricPixels[i]-132)*.6)+weave;
    fabricPixels[i]=fabricPixels[i+1]=fabricPixels[i+2]=value;
    const cell=(x+(Math.floor(y/6)%2)*3)%6;
    const pebble=Math.hypot(cell-2.5,y%6-2.5)<1.6?18:-6;
    const grain=202+Math.round((leatherPixels[i]-132)*.9)+pebble;
    leatherPixels[i]=leatherPixels[i+1]=leatherPixels[i+2]=grain;
  }
  const glove=mat('glove-tactical-fabric',0x51544d,.95,0,{map:fabricGrain,bumpMap:fabricGrain,bumpScale:.00045});
  const bakedGloveMat=mat('glove-anatomical-vertex-tints',0x999989,.96,0,{map:fabricGrain,bumpMap:fabricGrain,bumpScale:.0002,vertexColors:true});
  const leather=mat('glove-leather-palms',0x665b4e,.88,0,{map:leatherGrain,bumpMap:leatherGrain,bumpScale:.0004});
  const glovePanel=mat('glove-reinforced-panels',0x8d8979,.96,0,{map:fabricGrain,bumpMap:fabricGrain,bumpScale:.00028});
  const gloveThread=mat('glove-contrast-thread',0xb9b09b,.97,0);
  const seam=mat('glove-stitched-seams',0x969078,.97,0);
  const knuckle=mat('glove-knuckle-protection',0x323735,.96,0,{map:leatherGrain,bumpMap:leatherGrain,bumpScale:.00022});
  const clothMap = owner.surfaces?.maps?.cloth || null;
  const cloth = mat('sleeve-ripstop-cloth', 0x68745c, .98, 0, clothMap ? { map: clothMap } : {});
  const cuff=mat('sleeve-elastic-cuff',0x384638,.99,0);
  const brass=mat('weapon-brass-details',0xb89b59,.45,.77);
  const label=mat('weapon-engraved-markings',0xabb0a8,.75,.3);
  const lens=mat('lens-coated-glass',0x527780,.12,.22,{transparent:true,opacity:.34,depthWrite:false,side:THREE.DoubleSide});
  const unitBox=new RoundedBoxGeometry(1,1,1,1,.09);ownedGeometries.add(unitBox);
  const unitSphere=new THREE.SphereGeometry(1,18,12);ownedGeometries.add(unitSphere);
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
  function loft(parent,points,radii,material,{segments=20,radial=12,ellipse=[1,1],folds=0,widthAxis=null}={}){
    segments = Math.min(segments, 32); radial = Math.min(radial, 18);
    const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),frames=path.computeFrenetFrames(segments,false),positions=[],uv=[],indices=[];
    if(widthAxis)for(let i=0;i<=segments;i++){
      const tangent=frames.tangents[i],normal=frames.normals[i];
      normal.set(...widthAxis).addScaledVector(tangent,-normal.dot(tangent)).normalize();
      frames.binormals[i].crossVectors(tangent,normal).normalize();
    }
    for(let i=0;i<=segments;i++){const t=i/segments,p=path.getPointAt(t),u=t*(radii.length-1),j=Math.min(radii.length-2,Math.floor(u)),base=THREE.MathUtils.lerp(radii[j],radii[j+1],u-j);
      for(let k=0;k<=radial;k++){const a=k/radial*Math.PI*2;
        const r=base*(1+folds*Math.sin(Math.PI*t)*(Math.sin(t*37+a*2)*.65+Math.sin(t*21-a*3)*.35));
        const c=Math.cos(a)*r*ellipse[0],s=Math.sin(a)*r*ellipse[1];positions.push(p.x+frames.normals[i].x*c+frames.binormals[i].x*s,p.y+frames.normals[i].y*c+frames.binormals[i].y*s,p.z+frames.normals[i].z*c+frames.binormals[i].z*s);uv.push(k/radial,t*3);}
    }
    for(let i=0;i<segments;i++)for(let k=0;k<radial;k++){const a=i*(radial+1)+k,b=a+radial+1;indices.push(a,a+1,b,b,a+1,b+1);}
    const front=positions.length/3;positions.push(...path.getPointAt(0).toArray());uv.push(.5,0);const back=positions.length/3;positions.push(...path.getPointAt(1).toArray());uv.push(.5,1);
    for(let k=0;k<radial;k++){indices.push(front,k+1,k);const a=segments*(radial+1)+k;indices.push(back,a,a+1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();smoothRingSeams(g,segments+1,radial);return mesh(parent,g,material);
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
    '3':'111001111001111','4':'101101111001001','5':'111100111001111',
    '6':'111100111101111','7':'111001001001001','8':'111101111101111',
    '9':'111101111001111', A:'010101111101101', C:'111100100100111',
    D:'110101101101110', G:'111100101101111', K:'101101110101101',
    M:'101111111101101', P:'111101111100100', R:'110101110101101',
    S:'111100111001111', V:'101101101101010', X:'101101010101101',
  };
  function engraving(parent, text, z, y, size=.00245, x=-.0501) {
    for (const [letter, character] of [...text].entries()) {
      const pixels = glyphs[character];
      if (!pixels) continue;
      for (const [index, lit] of [...pixels].entries()) if (lit === '1') {
        detail(parent,x,y-Math.floor(index/3)*size,z-(letter*4+index%3)*size,.00065,size*.86,size*.86,label);
      }
    }
  }

  const receiver=new THREE.Group();weapon.add(receiver);
  profile(receiver,[[-.225,-.03],[-.225,.044],[-.195,.072],[.067,.072],[.105,.052],[.113,-.027]],.083,metal,{holes:[[[-.139,.006],[-.027,.006],[-.027,.039],[-.139,.039]]]});
  // The ejection window is a real opening, backed by the bolt in a deep cavity.
  const bolt=new THREE.Group();bolt.position.set(0,0,-.02);weapon.add(bolt);
  cylinder(bolt,0,.022,-.065,.024,.155,edge,'z',24);
  const boltHandleKnob=new THREE.Group();bolt.add(boltHandleKnob);boltHandleKnob.visible=false;
  cylinder(boltHandleKnob,.045,.022,-.045,.006,.042,metal,'x',10);
  ellipsoid(boltHandleKnob,[.068,.022,-.045],[.013,.013,.013],dark);
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
  const weaponLabels = Object.fromEntries(Object.entries({
    ar416:'AR416', ak12:'AK12M', mcx9:'MCX9', vk45:'VK45', mg36:'MG36', pkp:'PKP76', dmr12:'DMR12', sv98:'SV98M',
  }).map(([name,mark]) => {
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
  // The rail's underside is at y=.056; the side plates stop at y=.046.
  // A solid upper bridge overlaps both, including the sloped front/rear ends.
  profile(handguard,[[0,.028],[0,.062],[-.348,.062],[-.36,.046],[-.36,.024],
    [-.334,.034],[-.018,.034]],.083,anodized,{bevel:.001});
  for(const side of [-1,1]){
    profile(handguard,[[-.017,.045],[-.017,.060],[-.338,.060],[-.348,.049]],
      .009,metal,{x:side*.028,bevel:.001});
  }
  // The bore is a separate continuous assembly. Changing handguard length or
  // width must never shorten or hide the steel visible through its vents.
  const barrelCore=new THREE.Group();barrelCore.name='continuous-inner-barrel';weapon.add(barrelCore);
  cylinder(barrelCore,0,0,0,.016,.4,edge,'z',24);
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
  const rifleFeed = new THREE.Group(), compactFeed = new THREE.Group(), marksmanFeed = new THREE.Group(), akFeed = new THREE.Group(), vkFeed = new THREE.Group();
  magazine.add(rifleFeed,compactFeed,marksmanFeed,akFeed,vkFeed);
  const bakelite=mat('weapon-bakelite-plum',0x6b3e2e,.68,.12,{bumpMap:polymerGrain,bumpScale:.00022});
  const oliveMetal=mat('weapon-olive-ordnance',0x46543e,.62,.35);
  const medWhite=mat('gadget-med-case',0xd6dbd4,.55,.1);
  const medRed=mat('gadget-med-cross',0xc8322b,.5,.1);
  const stimGlow=new THREE.MeshBasicMaterial({name:'gadget-stim-glow',color:0x5bd9e8,toneMapped:false});ownedMaterials.add(stimGlow);
  const warnYellow=mat('gadget-warn-yellow',0xd4a438,.55,.2);
  profile(rifleFeed,[[-.155,-.092],[-.077,-.092],[-.071,-.181],[-.087,-.272],[-.116,-.337],[-.192,-.321],[-.17,-.24],[-.155,-.168]],.067,polymer,{bevel:.005});
  profile(rifleFeed,[[-.194,-.314],[-.115,-.331],[-.11,-.347],[-.197,-.33]],.076,dark,{bevel:.002});
  for(const side of [-1,1])for(let i=0;i<3;i++){
    curve(rifleFeed,[[side*.036,-.13,-.094-i*.022],[side*.037,-.23,-.108-i*.022],[side*.036,-.301,-.133-i*.022]],.0032,metal,10,8);
  }
  // AK-12M deep curved ribbed magazine with ammo inspection window
  const akMagazine = profile(akFeed,[[-.158,-.090],[-.074,-.090],[-.068,-.175],[-.092,-.278],[-.138,-.358],[-.218,-.332],[-.182,-.242],[-.158,-.165]],.069,bakelite,{bevel:.005});
  // Taper the top inside the receiver so the two bevels have separate surfaces.
  const neck = akMagazine.geometry.getAttribute('position');
  for(let i=0;i<neck.count;i++){
    const height=neck.getY(i);
    const taper=THREE.MathUtils.smoothstep(height,-.165,-.09);
    neck.setX(i,neck.getX(i)*(1-.32*taper));
  }
  akMagazine.geometry.computeVertexNormals();
  profile(akFeed,[[-.220,-.325],[-.136,-.352],[-.130,-.368],[-.224,-.342]],.078,dark,{bevel:.002});
  for(const side of [-1,1])for(let i=0;i<5;i++){
    rounded(akFeed,side*.036,-.145-i*.038,-.118-i*.012,.004,.012,.052,dark).rotation.x=.28;
  }
  profile(compactFeed,[[-.138,-.091],[-.093,-.091],[-.098,-.336],[-.15,-.336]],.049,dark,{bevel:.003});
  rounded(compactFeed,0,-.338,-.124,.063,.018,.068,polymer);
  for(const side of [-1,1])for(let y=-.15;y>-.315;y-=.033)detail(compactFeed,side*.026,y,-.124,.003,.004,.037,edge);
  // VK-45 extended 40-round forward-angled magazine
  profile(vkFeed,[[-.162,-.091],[-.114,-.091],[-.082,-.395],[-.136,-.402]],.052,dark,{bevel:.003});
  rounded(vkFeed,0,-.402,-.108,.066,.024,.074,polymer);
  for(const side of [-1,1])for(let i=0;i<6;i++)detail(vkFeed,side*.028,-.14-i*.042,-.135+i*.005,.003,.006,.036,brass);
  profile(marksmanFeed,[[-.163,-.091],[-.067,-.091],[-.063,-.209],[-.158,-.226]],.076,metal,{bevel:.004});
  profile(marksmanFeed,[[-.161,-.216],[-.062,-.200],[-.061,-.214],[-.162,-.233]],.082,dark,{bevel:.002});
  for(const side of [-1,1])for(const z of [-.146,-.116,-.084])detail(marksmanFeed,side*.04,-.164,z,.003,.066,.009,dark);

  // Secondary weapon structural assemblies (AK-12M, VK-45, PKP Pecheneg, SV-98M)
  const akVariant=new THREE.Group();weapon.add(akVariant);akVariant.visible=false;
  cylinder(akVariant,0,.056,-.38,.015,.31,dark,'z',16);
  rounded(akVariant,0,.058,-.37,.036,.028,.24,polymer);
  profile(akVariant,[[-.53,.012],[-.555,.064],[-.585,.064],[-.565,.012]],.026,metal,{bevel:.002});
  ring(akVariant,0,.015,-.645,.022,.012,.068,dark,'z',20);
  for(const z of [-.63,-.655])rounded(akVariant,0,.015,z,.048,.024,.012,metal);
  ring(akVariant,0,.076,-.595,.022,.017,.018,dark,'z',18);

  const vkVariant=new THREE.Group();weapon.add(vkVariant);vkVariant.visible=false;
  // KRISS Super V vertical recoil vector lower receiver housing + rectangular offset suppressor
  profile(vkVariant,[[-.245,-.022],[-.115,-.022],[-.085,-.225],[-.185,-.238],[-.255,-.135]],.079,polymer,{bevel:.004});
  for(const side of [-1,1]){
    rounded(vkVariant,side*.043,-.11,-.175,.006,.12,.075,metal);
    for(const y of [-.07,-.11,-.15])screw(vkVariant,side*.046,y,-.175,.0045);
  }
  rounded(vkVariant,0,-.012,-.52,.054,.078,.21,dark);
  for(const z of [-.44,-.52,-.59])rounded(vkVariant,0,-.012,z,.058,.082,.012,metal);
  cylinder(vkVariant,0,.015,-.63,.012,.012,edge,'z',16);

  const pkpVariant=new THREE.Group();weapon.add(pkpVariant);pkpVariant.visible=false;
  // Forced-air ribbed barrel cooling jacket & heavy carry handle
  cylinder(pkpVariant,0,.022,-.71,.026,.34,dark,'z',18);
  for(let z=-.57;z>-.85;z-=.045)rounded(pkpVariant,0,.028,z,.054,.038,.022,metal);
  curve(pkpVariant,[[0,.065,-.28],[0,.135,-.31],[0,.135,-.42],[0,.065,-.45]],.007,metal,12,8);
  cylinder(pkpVariant,.025,.135,-.365,.016,.095,bakelite,'z',12);

  const svVariant=new THREE.Group();weapon.add(svVariant);svVariant.visible=false;
  // SV-98M heavy rectangular 3-chamber sniper brake, fluted barrel & folding bipod
  rounded(svVariant,0,.015,-.955,.046,.038,.092,dark);
  for(const z of [-.925,-.955,-.985])rounded(svVariant,0,.015,z,.05,.022,.014,edge);
  for(const side of [-1,1]){
    const leg=new THREE.Group();leg.position.set(side*.032,-.032,-.62);leg.rotation.z=side*.22;leg.rotation.x=.18;svVariant.add(leg);
    cylinder(leg,0,-.085,0,.007,.19,metal,'y',10);
    rounded(leg,0,-.18,0,.024,.014,.032,rubber);
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
  const feedCover = new THREE.Group();
  feedCover.position.set(0,.068,-.205);supportAttachment.add(feedCover);
  profile(feedCover,[[.004,0],[.012,.041],[.24,.037],[.263,.014],[.25,-.012],[.021,-.014]],.106,metal,{bevel:.004});
  for (const z of [.05,.09,.13,.17,.21]) rounded(feedCover,0,.039,z,.088,.007,.023,dark);
  for (const z of [.046,.195]) screw(feedCover,-.055,.014,z,.006);
  for (const z of [-.14,-.115,-.09,-.065]) cylinder(supportAttachment,-.061,.056,z,.0045,.04,brass,'x',12);

  // ---- BF-style surface passes: silhouette first, then manufactured details. ----
  // All geometry is static, batched per material, and only the selected
  // weapon's detail group is visible.  No textures, network, or new libraries.
  const barrelFinish=mat('weapon-barrel-parkerized',0x303a39,.56,.65,{bumpMap:metalGrain,bumpScale:.00018});
  const serrated=mat('weapon-grip-checkering',0x29312d,.93,.03,{bumpMap:polymerGrain,bumpScale:.00038});
  const paint=mat('weapon-cerakote-wear',0x888d7a,.79,.32);
  const variantDetails={};
  for(const key of ['ar416','ak12','mcx9','vk45','mg36','pkp','dmr12','sv98']){
    const group=new THREE.Group();group.name=`${key}-hero-detail`;group.visible=false;
    weapon.add(group);variantDetails[key]=group;
  }
  // Receiver wear strips, bolt raceway, individual stamped body panels.
  // Important lateral features are on BOTH faces, not invisible coplanar planes.
  for(const sign of [-1,1]){
    const sx=sign*.0504;
    profile(receiver,[[-.187,.031],[-.164,.045],[.054,.045],[.071,.035],[-.062,.030],[-.149,.024]],
      .0015,anodized,{x:sx,bevel:.0005});
    profile(receiver,[[-.148,-.031],[-.051,-.03],[-.027,-.047],[-.12,-.055]],
      .0015,dark,{x:sx,bevel:.0004});
    for(let i=0;i<5;i++){
      const z=-.174+i*.027;
      const g=detail(receiver,sign*.0512,-.024,z,.0012,.0026,.014,dark);
      g.rotation.x=.20;
    }
    for(const z of [-.194,-.162,-.052,.041]){
      cylinder(receiver,sign*.0518,.034,z,.003,.0014,dark,'x',10);
      cylinder(receiver,sign*.0535,.034,z,.0015,.0015,edge,'x',8);
    }
  }
  // A shallow raised continuous upper receiver and genuinely layered rail base.
  profile(receiver,[[-.214,.067],[-.194,.082],[-.055,.084],[.052,.081],[.074,.071]],
    .077,metal,{bevel:.0014});
  for(const side of [-1,1]){
    curve(receiver,[[side*.040,.052,-.196],[side*.041,.068,-.168],[side*.041,.068,.026]],
      .00135,paint,14,5);
  }
  // Extra handguard machining which follows the shared fore-end on all rifles.
  // These strips sit on the exterior so holes retain their parallax/depth.
  for(const side of [-1,1]){
    for(let k=0;k<5;k++){
      const z=-.059-k*.056;
      const slot=rounded(handguard,side*.0502,-.001,z,.0025,.008,.038,dark);
      slot.rotation.x=.08;
      rounded(handguard,side*.0518,-.014,z,.0014,.0017,.028,paint);
    }
    profile(handguard,[[-.016,.022],[-.343,.022],[-.354,.013],[-.335,.009],[-.029,.009]],
      .003,metal,{x:side*.0485,bevel:.0004});
  }
  // AR416: heavy forged upper, bolt-forward-assist hump, vent collars.
  {
    const g=variantDetails.ar416;
    for(const side of [-1,1]){
      const panel=profile(g,[[-.203,.010],[-.173,.030],[-.050,.029],[-.014,.012],[-.052,-.028],[-.163,-.028]],
        .003,polymer,{x:side*.0528,bevel:.0014});
      for(let k=0;k<3;k++)detail(g,side*.0565,-.017,-.17+k*.032,.0013,.004,.022,serrated);
      cylinder(g,side*.0582,.022,-.019,.010,.010,edge,'x',16);
      cylinder(g,side*.063,.022,-.019,.006,.002,dark,'x',12);
    }
    for(const z of [-.25,-.37,-.49])ring(g,0,.015,z,.016,.015,.012,barrelFinish,'z',14);
  }
  // AK-12: tall dust cover, stamped safety and a prominent gas tube.
  {
    const g=variantDetails.ak12;
    profile(g,[[-.203,.040],[-.182,.074],[.052,.073],[.09,.04],[.049,.030],[-.186,.032]],
      .087,barrelFinish,{bevel:.003});
    for(const side of [-1,1]){
      profile(g,[[.079,-.008],[.028,-.009],[-.045,-.040],[-.137,-.041],[-.142,-.063],[.053,-.027]],
        .003,metal,{x:side*.054,bevel:.001});
      curve(g,[[side*.057,-.047,-.15],[side*.058,-.043,-.073],[side*.059,-.049,.050]],
        .0027,edge,10,7);
      for(let k=0;k<3;k++)screw(g,side*.061,-.023,.045-k*.074,.0038);
    }
    rounded(g,0,.091,-.40,.045,.024,.275,barrelFinish);
    cylinder(g,0,.092,-.50,.018,.046,edge,'z',16);
    for(const z of [-.325,-.40,-.47])rounded(g,0,.105,z,.054,.007,.009,metal);
    for(const z of [-.31,-.39,-.47])for(const x of [-.039,.039])
      detail(g,x,-.012,z,.005,.047,.008,serrated);
  }
  // MCX: distinct compact monolithic upper and machined M-LOK-esque cheek.
  {
    const g=variantDetails.mcx9;
    profile(g,[[-.196,-.022],[-.18,.064],[.107,.064],[.123,.039],[.085,-.041]],
      .086,barrelFinish,{bevel:.002});
    for(const side of [-1,1]){
      profile(g,[[-.206,.014],[-.024,.014],[.035,-.010],[-.037,-.026],[-.19,-.021]],
        .003,anodized,{x:side*.055,bevel:.001});
      for(let i=0;i<6;i++)detail(g,side*.059,-.012,-.174+i*.028,.002,.009,.014,serrated);
    }
    rounded(g,0,.069,.118,.068,.015,.057,metal);
    for(const z of [-.271,-.318,-.372])ring(g,0,.014,z,.021,.016,.007,edge,'z',16);
  }
  // VK45: sculpted recoil vector housing, angled cooling channels.
  {
    const g=variantDetails.vk45;
    for(const side of [-1,1]){
      profile(g,[[-.245,-.036],[-.119,-.042],[-.097,-.137],[-.160,-.240],[-.226,-.224]],
        .004,barrelFinish,{x:side*.044,bevel:.0015});
      for(let i=0;i<4;i++){
        const z=-.13-i*.018;
        const vent=detail(g,side*.051,-.125-i*.018,z,.002,.009,.022,serrated);
        vent.rotation.x=-.44;
      }
      for(const y of [-.16,-.20])screw(g,side*.053,y,-.173,.004);
    }
    rounded(g,0,.064,-.34,.060,.024,.14,barrelFinish);
  }
  // MG36: reinforced receiver, cooling vents and prominent top handle.
  {
    const g=variantDetails.mg36;
    for(const side of [-1,1]){
      profile(g,[[-.216,-.031],[-.168,.061],[.080,.060],[.124,.016],[.098,-.047]],
        .003,anodized,{x:side*.054,bevel:.002});
      for(let i=0;i<6;i++)rounded(g,side*.058,-.014,-.17+i*.036,.003,.009,.022,barrelFinish);
    }
    curve(g,[[0,.079,-.22],[0,.139,-.245],[0,.16,-.32],[0,.16,-.37],[0,.09,-.39]],
      .006,metal,18,10);
    rounded(g,0,.158,-.342,.038,.022,.090,serrated);
    for(const z of [-.44,-.49,-.54])ring(g,0,.015,z,.023,.018,.01,barrelFinish,'z',16);
  }
  // PKP: stronger steel handguard/cooling jacket, large top cover hinge.
  {
    const g=variantDetails.pkp;
    profile(g,[[-.225,.038],[-.166,.090],[.070,.090],[.120,.056],[.094,.023]],
      .099,barrelFinish,{bevel:.003});
    for(const z of [-.30,-.36,-.42,-.48]){
      ring(g,0,.022,z,.031,.027,.011,metal,'z',16);
      for(const side of [-1,1])detail(g,side*.054,.018,z,.004,.018,.012,serrated);
    }
    for(const side of [-1,1]){
      cylinder(g,side*.057,.062,-.15,.011,.007,edge,'x',14);
      for(let i=0;i<5;i++)detail(g,side*.057,.043,-.125+i*.040,.002,.005,.016,dark);
    }
  }
  // DMR: match receiver, cheekpiece, floated barrel interface and scope knobs.
  {
    const g=variantDetails.dmr12;
    for(const side of [-1,1]){
      profile(g,[[-.218,-.029],[-.186,.043],[-.054,.052],[.088,.039],[.112,-.039]],
        .002,anodized,{x:side*.053,bevel:.001});
      for(const z of [-.155,-.094,-.048])screw(g,side*.055,-.020,z,.004);
    }
    rounded(g,0,.029,.385,.084,.027,.115,serrated);
    for(const z of [-.36,-.42,-.48])ring(g,0,.015,z,.019,.014,.008,barrelFinish,'z',18);
  }
  // SV98: bolt-action tube/cheek rest and ventilated stock sides.
  {
    const g=variantDetails.sv98;
    cylinder(g,0,.037,-.044,.036,.32,barrelFinish,'z',20);
    for(const side of [-1,1]){
      profile(g,[[.195,-.010],[.440,-.010],[.443,-.045],[.209,-.044]],
        .006,polymer,{x:side*.044,bevel:.0015});
      for(let i=0;i<5;i++)detail(g,side*.049,-.012,.243+i*.034,.0016,.009,.011,serrated);
      cylinder(g,side*.062,.044,.069,.010,.033,edge,'x',14);
      cylinder(g,side*.078,.044,.069,.008,.008,barrelFinish,'x',14);
    }
    for(const z of [-.62,-.69,-.75])ring(g,0,.015,z,.020,.016,.008,barrelFinish,'z',16);
  }

  // Aperture sights have actual holes and never cover the aiming centre.
  const ironSights=new THREE.Group();weapon.add(ironSights);
  rounded(ironSights,0,.095,.043,.058,.034,.032,dark);
  profile(ironSights,[[.029,.092],[.032,.152],[.054,.152],[.057,.092]],.026,metal,{bevel:.0015});
  for(const side of [-1,1]){
    screw(ironSights,side*.031,.095,.043,.0045);
    curve(ironSights,[[side*.022,.118,.043],[side*.024,.155,.043],[side*.016,.176,.043]],.004,dark,8,8);
  }
  ring(ironSights,0,.164,.043,.020,.011,.014,dark,'z',24);
  const frontSight=new THREE.Group();ironSights.add(frontSight);frontSight.position.set(0,0,-.525);
  rounded(frontSight,0,.078,.002,.054,.024,.032,dark);
  profile(frontSight,[[-.01,.062],[-.01,.139],[.005,.162],[.01,.062]],.012,dark,{bevel:.001});
  for(const side of [-1,1])curve(frontSight,[[side*.028,.082,.002],[side*.026,.15,.002],[side*.018,.174,.002]],.0045,dark,8,10);

  const scope=new THREE.Group();weapon.add(scope);scope.visible=false;
  rounded(scope,0,.092,-.135,.058,.026,.195,metal);
  for(const z of [-.205,-.07]){
    rounded(scope,0,.112,z,.052,.056,.032,metal);
    for(const side of [-1,1])screw(scope,side*.028,.094,z,.005);
    ring(scope,0,.169,z,.041,.034,.022,dark,'z',24);
  }
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
  rounded(reflex,0,.094,-.105,.072,.030,.108,metal);
  profile(reflex,[[-.152,.098],[-.142,.146],[-.068,.146],[-.058,.098]],.052,dark,{bevel:.002});
  for(const side of [-1,1]){
    rounded(reflex,side*.024,.124,-.112,.010,.042,.068,metal);
    screw(reflex,side*.037,.094,-.082,.0045);
    screw(reflex,side*.037,.094,-.128,.0045);
  }
  ring(reflex,0,.166,-.127,.034,.025,.065,dark,'z',24);
  ring(reflex,0,.166,-.09,.035,.026,.009,edge,'z',24);
  cylinder(reflex,0,.166,-.105,.025,.002,lens,'z',24);
  cylinder(reflex,.038,.16,-.12,.011,.013,edge,'x',16);
  // Additional machined optic details for near-camera first-person inspection.
  for(const side of [-1,1]){
    rounded(reflex,side*.036,.137,-.117,.006,.031,.063,metal);
    cylinder(reflex,side*.040,.155,-.109,.008,.006,edge,'x',12);
    cylinder(reflex,side*.043,.155,-.109,.0035,.003,dark,'x',10);
  }
  ring(reflex,0,.166,-.146,.035,.027,.008,edge,'z',20);
  for(let i=0;i<12;i++){
    const a=i/12*Math.PI*2;
    const screwX=Math.cos(a)*.029,screwY=.166+Math.sin(a)*.029;
    if(i%3===0)cylinder(reflex,screwX,screwY,-.149,.0024,.002,metal,'z',8);
  }
  const redDot = new THREE.MeshBasicMaterial({color:0xffab78,toneMapped:false});
  redDot.name='weapon-optic-emitter';ownedMaterials.add(redDot);
  cylinder(reflex,0,.166,-.103,.0017,.001,redDot,'z',10);

  const compactOptic = new THREE.Group();weapon.add(compactOptic);
  // Picatinny rail clamp base + solid riser block joining receiver rail (.080) to sight hood (.138)
  rounded(compactOptic,0,.093,-.122,.068,.028,.084,metal);
  rounded(compactOptic,0,.118,-.122,.062,.036,.068,dark);
  for(const side of [-1,1]){
    rounded(compactOptic,side*.031,.112,-.122,.008,.048,.058,metal);
    screw(compactOptic,side*.035,.093,-.102,.0045);
    screw(compactOptic,side*.035,.093,-.142,.0045);
  }
  const frame = new THREE.Shape();
  frame.moveTo(-.035,.131);frame.lineTo(-.034,.191);frame.lineTo(-.023,.205);frame.lineTo(.023,.205);frame.lineTo(.034,.191);frame.lineTo(.035,.131);frame.closePath();
  const window = new THREE.Path();
  window.moveTo(-.025,.142);window.lineTo(.025,.142);window.lineTo(.024,.189);window.lineTo(.017,.195);window.lineTo(-.017,.195);window.lineTo(-.024,.189);window.closePath();frame.holes.push(window);
  mesh(compactOptic,new THREE.ExtrudeGeometry(frame,{depth:.046,bevelSize:.002,bevelThickness:.002,bevelSegments:1}),dark,0,0,-.145);
  mesh(compactOptic,new THREE.ShapeGeometry(new THREE.Shape(window.getPoints())),lens,0,0,-.126);
  cylinder(compactOptic,0,.166,-.122,.0017,.001,redDot,'z',10);
  for(const side of [-1,1])screw(compactOptic,side*.033,.138,-.123,.0045);

  // Tailored sleeves: elbow volume, tapered wrists and oblique tension folds.
  const leftArm=new THREE.Group();leftArm.name='left-articulated-forearm';weapon.add(leftArm);
  loft(leftArm,[[-.40,-.47,.25],[-.29,-.32,.055],[-.18,-.20,-.16],[-.09,-.117,-.35]],[.092,.09,.083,.071,.06,.047,.041],cloth,{segments:32,radial:18,ellipse:[1.1,.88],folds:.105});
  loft(leftArm,[[-.108,-.129,-.311],[-.095,-.119,-.34],[-.083,-.108,-.361]],[.049,.047,.044],cuff,{segments:14,radial:24,ellipse:[1.07,.92],folds:.07});
  curve(leftArm,[[-.385,-.406,.23],[-.268,-.262,.04],[-.167,-.148,-.18],[-.086,-.071,-.338]],.0018,seam,32,6);
  for(let i=0;i<3;i++)curve(leftArm,[[-.206-i*.014,-.197-i*.012,-.123+i*.022],[-.17-i*.014,-.154-i*.012,-.16+i*.022],[-.135-i*.014,-.153-i*.012,-.167+i*.022]],.0025,cloth,8,6);
  loft(leftArm,[[-.18,-.157,-.161],[-.144,-.129,-.224],[-.115,-.105,-.28]],[.021,.03,.022],cloth,{segments:12,radial:10,ellipse:[1,.16],widthAxis:[1,0,0]});
  const leftTab=rounded(leftArm,-.108,-.077,-.327,.039,.008,.024,cuff);leftTab.rotation.z=-.35;
  for(let i=0;i<6;i++)detail(leftArm,-.123+i*.005,-.071,-.325,.002,.0015,.009,seam);
  const rightArm=new THREE.Group();weapon.add(rightArm);
  loft(rightArm,[[.27,-.48,.43],[.205,-.36,.3],[.12,-.26,.18],[.064,-.205,.116]],[.097,.094,.084,.073,.058,.047,.04],cloth,{segments:32,radial:18,ellipse:[1.08,.9],folds:.09});
  loft(rightArm,[[.089,-.23,.151],[.074,-.212,.129],[.062,-.198,.112]],[.052,.049,.044],cuff,{segments:14,radial:24,ellipse:[1.06,.94],folds:.06});
  curve(rightArm,[[.323,-.441,.42],[.247,-.324,.29],[.161,-.226,.172],[.102,-.181,.112]],.0018,seam,32,6);
  const rightTab=rounded(rightArm,.101,-.196,.14,.026,.013,.035,cuff);rightTab.rotation.z=.3;
  const leftHand=new THREE.Group();leftHand.name='left-support-glove';leftHand.position.set(-.018,-.075,-.36);weapon.add(leftHand);
  const leftBase=leftHand.position.clone(), lp=p=>[p[0]-leftBase.x,p[1]-leftBase.y,p[2]-leftBase.z];
  function surfaceLine(parent,skin,t0,t1,angle,material=seam,radius=.00065){
    const points=Array.from({length:11},(_,i)=>skin.point(THREE.MathUtils.lerp(t0,t1,i/10),angle,.001).toArray());
    curve(parent,points,radius,material,12,6);
  }
  function surfaceStitches(parent,skin,t0,t1,angle,count){
    for(let i=0;i<count;i++){
      const t=THREE.MathUtils.lerp(t0,t1,(i+.5)/count);
      curve(parent,[-.035,0,.035].map(offset=>skin.point(t,angle+offset,.0012).toArray()),.00045,gloveThread,3,4);
    }
  }
  function palm(parent,points,widths,depths,across,{wrist=true}={}){
    const skin=gloveSurface(points,widths,depths,{across,segments:36});
    mesh(parent,skin.geometry,glove);
    mesh(parent,skin.patch(.22,.92,.38,2.76),glovePanel);
    mesh(parent,skin.patch(.29,.92,3.42,5.99),leather);
    for(const angle of [.36,2.78]){
      surfaceLine(parent,skin,.24,.89,angle);
      surfaceStitches(parent,skin,.27,.86,angle,14);
    }
    // Thin wrist closure follows the wrist contour instead of a floating block.
    if(wrist){
      mesh(parent,skin.patch(.08,.20,.10,3.04,.0011),knuckle);
      for(const angle of [.7,2.4])surfaceLine(parent,skin,.09,.19,angle,gloveThread,.0005);
    }
    return skin;
  }
  function finger(parent, points, radius, segments=32, across=[0,1,0]) {
    const widths=[1,.98,.94,.88,.91,.82,.77,.79,.66,.48,.16].map(v=>v*radius);
    const depths=[.86,.85,.81,.74,.79,.72,.67,.68,.59,.43,.14].map(v=>v*radius);
    const skin=gloveSurface(points,widths,depths,{across,segments:Math.max(32,segments),radial:16});
    mesh(parent,skin.geometry,glove);
    // Separate flat phalange panels expose the flexible fabric at both joints.
    for(const [from,to] of [[.07,.29],[.37,.58],[.69,.88]]){
      mesh(parent,skin.patch(from,to,.38,2.76),glovePanel);
      for(const angle of [.38,2.76])surfaceLine(parent,skin,from+.01,to-.01,angle,leather,.00045);
    }
    mesh(parent,skin.patch(.10,.94,3.40,6.02,.00055),leather);
    for(const t of [.325,.635]){
      curve(parent,Array.from({length:7},(_,i)=>skin.point(t,.35+i*2.44/6,.0008).toArray()),.00055,knuckle,8,4);
    }
    surfaceStitches(parent,skin,.12,.87,.30,9);
    return skin;
  }
  // Offline-baked watertight anatomical left hand.  Unlike swept cylinders,
  // fingers grow continuously out of the palm with a modeled thumb web and
  // individual knuckle profiles.  The mesh is decoded ONCE when the rig loads;
  // there is no voxel field or per-vertex generation in the render loop.
  const supportGlove = createBakedGlove('support', bakedGloveMat);
  ownedGeometries.add(supportGlove.geometry);
  leftHand.add(supportGlove);

  // Detailed first-person held grenade & class gadgets attached to leftHand
  const heldGrenade=new THREE.Group();heldGrenade.name='held-grenade';leftHand.add(heldGrenade);
  heldGrenade.position.set(.022,.068,-.058);heldGrenade.rotation.set(-.25,.22,-.12);heldGrenade.scale.setScalar(1.65);heldGrenade.visible=false;
  cylinder(heldGrenade,0,0,0,.025,.062,oliveMetal,'y',16);
  ellipsoid(heldGrenade,[0,.028,0],[.025,.018,.025],oliveMetal);
  ellipsoid(heldGrenade,[0,-.028,0],[.023,.016,.023],oliveMetal);
  for(const y of [-.020,-.007,.007,.020])ring(heldGrenade,0,y,0,.027,.023,.005,anodized,'y',16);
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3;
    rounded(heldGrenade,Math.cos(a)*.0245,0,Math.sin(a)*.0245,.004,.054,.004,anodized);
  }
  cylinder(heldGrenade,0,.013,0,.0262,.007,warnYellow,'y',16);
  cylinder(heldGrenade,0,.043,0,.013,.018,metal,'y',14);
  rounded(heldGrenade,0,.055,-.002,.018,.014,.022,metal);
  curve(heldGrenade,[[0,.059,.008],[.016,.054,.016],[.029,.022,.018],[.027,-.018,.014]],.0032,metal,12,6);
  ring(heldGrenade,-.016,.054,-.006,.012,.009,.003,brass,'x',14);
  ellipsoid(heldGrenade,[0,.063,0],[.0045,.0045,.0045],medRed);

  const heldStim=new THREE.Group();heldStim.name='held-stim';leftHand.add(heldStim);
  heldStim.position.set(.024,.062,-.058);heldStim.rotation.set(.25,0,-.2);heldStim.scale.setScalar(1.45);heldStim.visible=false;
  cylinder(heldStim,0,0,0,.013,.096,polymer,'y',14);
  cylinder(heldStim,0,-.018,0,.0145,.026,anodized,'y',14);
  cylinder(heldStim,0,.018,0,.0105,.038,stimGlow,'y',14);
  cylinder(heldStim,0,.044,0,.013,.016,brass,'y',14);
  cylinder(heldStim,0,-.052,0,.008,.014,medRed,'y',12);

  const heldMedkit=new THREE.Group();heldMedkit.name='held-medkit';leftHand.add(heldMedkit);
  heldMedkit.position.set(.028,.062,-.064);heldMedkit.rotation.set(.15,.2,-.1);heldMedkit.scale.setScalar(1.38);heldMedkit.visible=false;
  rounded(heldMedkit,0,0,0,.088,.062,.038,medWhite);
  rounded(heldMedkit,0,0,0,.090,.012,.040,oliveMetal);
  rounded(heldMedkit,0,0,-.020,.028,.009,.006,medRed);
  rounded(heldMedkit,0,0,-.020,.009,.028,.006,medRed);
  for(const sx of [-.026,.026])rounded(heldMedkit,sx,.024,0,.010,.016,.042,metal);

  const heldAmmo=new THREE.Group();heldAmmo.name='held-ammo';leftHand.add(heldAmmo);
  heldAmmo.position.set(.028,.062,-.064);heldAmmo.rotation.set(.12,.18,-.08);heldAmmo.scale.setScalar(1.38);heldAmmo.visible=false;
  rounded(heldAmmo,0,0,0,.092,.066,.046,oliveMetal);
  rounded(heldAmmo,0,.026,0,.096,.014,.050,anodized);
  for(let i=0;i<5;i++){
    const rx=-.028+i*.014;
    cylinder(heldAmmo,rx,.038,-.006,.0042,.028,brass,'y',10);
    cylinder(heldAmmo,rx,.056,-.006,.0032,.012,worn,'y',10);
  }

  const heldScanner=new THREE.Group();heldScanner.name='held-scanner';leftHand.add(heldScanner);
  heldScanner.position.set(.026,.064,-.062);heldScanner.rotation.set(.18,.12,-.1);heldScanner.scale.setScalar(1.45);heldScanner.visible=false;
  cylinder(heldScanner,0,0,0,.030,.044,anodized,'y',14);
  cylinder(heldScanner,0,.022,0,.034,.008,metal,'y',14);
  ellipsoid(heldScanner,[0,.028,0],[.022,.010,.022],stimGlow);
  cylinder(heldScanner,.018,.048,-.008,.0035,.056,metal,'y',10);
  ellipsoid(heldScanner,[.018,.078,-.008],[.005,.005,.005],stimGlow);
  for(let i=0;i<3;i++){
    const a=i*Math.PI*2/3;
    curve(heldScanner,[
      [Math.cos(a)*.011,-.014,Math.sin(a)*.011],
      [Math.cos(a)*.022,-.034,Math.sin(a)*.022],
      [Math.cos(a)*.033,-.054,Math.sin(a)*.033],
    ],.0042,polymer,6,6);
  }

  const rightHand=new THREE.Group();rightHand.name='right-trigger-glove';weapon.add(rightHand);
  // The pistol grip also receives a sculpted palm/finger junction. Its trigger
  // finger remains posed in the static hand mesh while firing recoil moves the
  // entire weapon/arm, avoiding dozens of draw calls or CPU skinning work.
  const triggerGloveModel=createBakedGlove('trigger',bakedGloveMat);
  ownedGeometries.add(triggerGloveModel.geometry);
  rightHand.add(triggerGloveModel);
  const triggerFinger=new THREE.Group();
  triggerFinger.position.set(.055,-.129,.098);rightHand.add(triggerFinger);
  const triggerIndexModel=createBakedGlove('index',bakedGloveMat);
  ownedGeometries.add(triggerIndexModel.geometry);triggerFinger.add(triggerIndexModel);

  const flashMaterial=new THREE.MeshBasicMaterial({name:'muzzle-flash',color:0xffd08a,transparent:true,opacity:.92,depthTest:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});ownedMaterials.add(flashMaterial);
  const muzzleFlash=new THREE.Group();weapon.add(muzzleFlash);muzzleFlash.visible=false;
  const flashShape=new THREE.Shape();for(let i=0;i<12;i++){const a=i/12*Math.PI*2,r=i%2?.018:.062;const x=Math.cos(a)*r,y=Math.sin(a)*r;i?flashShape.lineTo(x,y):flashShape.moveTo(x,y);}flashShape.closePath();
  for(const angle of [0,Math.PI/2]){const f=mesh(muzzleFlash,new THREE.ShapeGeometry(flashShape),flashMaterial,0,0,-.045);f.rotation.y=angle*.25;}
  const flashLight={position:new THREE.Vector3(),intensity:0};
  const rifleAssembly=new THREE.Group();
  for(const child of [...weapon.children]){
    if(![leftArm,rightArm,leftHand,rightHand,muzzleFlash].includes(child))rifleAssembly.add(child);
  }
  weapon.add(rifleAssembly);

  const pistolFrame=mat('pistol-polymer-frame',0x262c2b,.85,.06,{bumpMap:polymerGrain,bumpScale:.0003});
  const pistolSlide=mat('pistol-blued-slide',0x394148,.51,.69,{bumpMap:metalGrain,bumpScale:.00018});
  const heavySlide=mat('pistol-brushed-slide',0x969a94,.39,.76,{bumpMap:metalGrain,bumpScale:.00016});
  const sightDot=mat('pistol-sight-dots',0xd5ddbd,.83,.04,{emissive:0x485442,emissiveIntensity:.36});
  function slideSection(parent,points,from,to,finish,opening=0){
    const section=new THREE.Shape(points.map(([x,y])=>new THREE.Vector2(x,y)));
    if(opening){
      const hole=new THREE.Path();
      hole.absarc(0,.012,opening,0,Math.PI*2,true);
      section.holes.push(hole);
    }
    return mesh(parent,new THREE.ExtrudeGeometry(section,{
      depth:to-from,bevelEnabled:false,curveSegments:14,
    }),finish,0,0,from);
  }
  function buildPistol(heavy){
    const root=new THREE.Group(), slide=new THREE.Group(), magazine=new THREE.Group(), ejection=new THREE.Group();
    root.add(slide,magazine);slide.add(ejection);weapon.add(root);root.visible=false;
    const front=heavy?-.248:-.181, width=heavy?.075:.059, rear=.136, gripWidth=heavy?.065:.057;
    const finish=heavy?heavySlide:pistolSlide, frame=heavy?metal:pistolFrame;
    const half=width/2, shoulder=half-(heavy?.011:.006);
    rounded(root,0,-.047,(front+rear)/2,width*.87,.034,rear-front-.022,frame);
    profile(root,[[.126,-.05],[.057,-.052],[.021,-.211],[.034,-.225],[.104,-.225],[.141,-.081]],
      gripWidth,frame,{bevel:.004});
    profile(root,[[.137,-.085],[.145,-.083],[.127,-.155],[.109,-.215],[.101,-.219]],
      gripWidth*.81,heavy?rubber:pistolFrame,{bevel:.002});
    for(let n=0;n<7;n++){
      const y=-.111-n*.014;
      const insert=rounded(root,0,y,.138-n*.0038,gripWidth*.59,.0034,.0046,dark);
      insert.rotation.x=-.23;
    }
    profile(root,[[-.09,-.057],[.071,-.053],[.059,-.124],[-.038,-.127],[-.081,-.102]],gripWidth*.76,frame,{
      holes:[[[-.069,-.068],[.041,-.065],[.034,-.108],[-.035,-.111],[-.066,-.092]]],bevel:.003,
    });
    curve(root,[[0,-.063,.017],[0,-.087,.005],[0,-.105,-.002]],.007,edge);
    for(const side of [-1,1]){
      const x=side*gripWidth*.51;
      profile(root,[[.114,-.091],[.054,-.101],[.037,-.199],[.092,-.205]],.003,heavy?rubber:polymer,{x,bevel:.001});
      for(let row=0;row<10;row++)for(let col=0;col<4;col++){
        detail(root,x+side*.002,-.106-row*.009,.057+col*.011-row*.0016+(col%2)*.002,.002,.0038,.0046,knuckle);
      }
      for(const [y,z] of [[-.103,.1],[-.19,.081]])if(heavy)screw(root,x+side*.002,y,z,.005);
      rounded(root,side*(width*.48),-.037,.046,.007,.012,.034,edge);
      cylinder(root,x,-.091,.05,.008,.005,dark,'x');
    }
    const bore=heavy?.017:.012;
    const silhouette=[[-shoulder,-.018],[shoulder,-.018],[half,-.009],[half,.031],
      [shoulder,.047],[-shoulder,.047],[-half,.031],[-half,-.009]];
    // Solid nose and rear. Only the middle section opens into the ejection recess.
    slideSection(slide,silhouette,front,-.06,finish,bore+.0075);
    slideSection(slide,silhouette,.027,rear,finish);
    slideSection(slide,[[-shoulder,-.018],[shoulder,-.018],[half,-.009],[half,.002],
      [-half+.011,.002],[-half+.011,.043],[-shoulder,.047],[-half,.031],[-half,-.009]],-.06,.027,finish);
    rounded(slide,0,.004,-.017,width*.69,.009,.073,dark);
    rounded(slide,0,.014,rear+.001,width*.76,.047,.008,heavy?metal:dark);
    rounded(slide,0,.027,rear+.006,width*.43,.015,.004,heavy?edge:pistolSlide);
    if(heavy){
      rounded(slide,0,.048,(front-.066)/2,width*.43,.012,-.066-front,finish);
      rounded(root,0,-.067,(front-.071)/2,width*.84,.023,-.071-front,frame);
    }else{
      for(let n=0;n<3;n++)rounded(root,0,-.068,front+.038+n*.012,width*.66,.003,.004,dark);
    }
    cylinder(root,0,.012,(front+.047)/2,bore+.004,.023-front,edge);
    ring(root,0,.012,front-.004,bore+.006,bore,.015,edge);
    cylinder(root,0,.012,front+.006,bore*.96,.003,dark);
    cylinder(root,0,-.022,front+.01,heavy?.009:.007,.022,metal);
    rounded(root,0,.018,-.017,width*.61,.033,.079,metal);
    rounded(root,.01,.031,-.023,width*.49,.011,.052,heavy?edge:metal);
    detail(root,.012,.037,-.023,width*.30,.0014,.038,dark);
    ejection.position.set(width*.54,.024,-.015);
    for(const side of [-1,1]){
      for(let n=0;n<7;n++){
        const cut=detail(slide,side*(half+.0004),.014,.051+n*.010,.0014,.031,.0036,dark);
        cut.rotation.x=heavy?.09:.23;
      }
      if(heavy)for(let n=0;n<5;n++){
        detail(slide,side*(half+.0004),.012,front+.039+n*.011,.0014,.026,.0034,dark);
      }
      rounded(root,side*(half+.001),-.036,.079,.009,.010,.026,metal);
      rounded(slide,side*.017,.052,.109,.012,.014,.026,dark);
      detail(slide,side*.017,.053,.123,.006,.006,.002,sightDot);
    }
    // Slide serrations, textured grip and inset controls read properly at FOV 70-95.
    for(const side of [-1,1]){
      const x=side*(half+.0007);
      profile(slide,[[front+.021,-.004],[front+.115,-.004],[front+.113,.007],[front+.028,.009]],
        .0015,heavy?dark:metal,{x,bevel:.0003});
      for(let n=0;n<8;n++){
        const z=front+.024+n*.010;
        const cut=detail(slide,side*(half+.0018),.018,z,.0012,.028,.0024,dark);
        cut.rotation.x=heavy?-.12:.19;
      }
      const gripSide=side*(gripWidth*.5+.0015);
      for(let row=0;row<4;row++)for(let col=0;col<5;col++){
        // Polymer diamond checkering, less shiny than a solid flat grip slab.
        const y=-.126-row*.019,z=.065+col*.009+row*.007;
        const mark=detail(root,gripSide,y,z,.0015,.004,.0035,serrated);
        mark.rotation.x=-.29;
      }
      cylinder(root,side*(gripWidth*.5+.002),-.076,.068,.006,.003,metal,'x',12);
      cylinder(root,side*(gripWidth*.5+.004),-.076,.068,.003,.003,dark,'x',10);
      detail(slide,side*(half+.002),.026,.008,.002,.018,.037,heavy?paint:barrelFinish);
    }
    engraving(slide,heavy?'M50':'P19',-.077,.026,heavy?.0031:.00275,-half-.0006);
    rounded(slide,0,.052,front+.027,.012,.014,.024,dark);
    detail(slide,0,.054,front+.039,.006,.006,.002,sightDot);
    const magazineHome=new THREE.Vector3(0,-.227,.073);
    magazine.position.copy(magazineHome);
    rounded(magazine,0,.037,.001,gripWidth*.73,.073,.052,metal);
    rounded(magazine,0,0,0,gripWidth*.94,.012,.066,heavy?edge:rubber);
    rounded(magazine,0,.076,-.001,gripWidth*.56,.008,.038,dark);
    for(let n=0;n<3;n++)cylinder(magazine,gripWidth*.37,.057-n*.014,.002,.003,.002,brass,'x');
    return {root,slide,magazine,magazineHome,ejection,front,heavy,
      supportGrip:new THREE.Vector3(-gripWidth/2-.009,-.162,.071)};
  }
  const pistols={p19:buildPistol(false),m50:buildPistol(true)};

  const rifleGlove=new THREE.Group();
  for(const child of [...leftHand.children])if(child.isMesh)rifleGlove.add(child);
  leftHand.add(rifleGlove);
  const pistolGlove=new THREE.Group();leftHand.add(pistolGlove);
  pistolGlove.name='pistol-support-glove';
  const supportPoint=([x,y,z])=>lp([x-.035,y-.08,z-.423]);
  const supportPath=points=>points.map(supportPoint);
  palm(pistolGlove,supportPath([[-.058,-.035,.075],[-.041,-.023,.052],[-.018,-.009,.025],
    [-.009,-.004,-.014]]),[.022,.025,.032,.035,.033],[.019,.018,.016,.014,.011],[0,-1,0]);
  const supportFingers=[];
  for(const [index,y] of [.021,.003,-.014,-.029].entries()){
    const inset=index*.003;
    const root=[-.009,y,-.015+inset];
    const digit=new THREE.Group();
    digit.position.set(...supportPoint(root));
    pistolGlove.add(digit);
    supportFingers.push(digit);
    finger(digit,[[0,0,0],[.012,-.004,-.022],[.03,-.007,-.039+inset],
      [.046-inset,-.005,-.037+inset],[.052-inset,.001,-.031+inset]],.0096-index*.0007);
  }
  const supportThumb=new THREE.Group();
  supportThumb.position.set(...supportPoint([-.017,.014,.023]));
  pistolGlove.add(supportThumb);
  finger(supportThumb,[[0,0,0],[-.007,.030,-.014],[-.001,.052,-.043],
    [.007,.055,-.068],[.009,.050,-.078]],.0115);

  const pistolRight=new THREE.Group();pistolRight.name='pistol-trigger-glove';weapon.add(pistolRight);
  palm(pistolRight,[[.072,-.222,.142],[.058,-.197,.127],[.048,-.166,.110],
    [.041,-.130,.094]],[.024,.027,.030,.029,.024],[.020,.019,.017,.016,.013],[0,0,1]);
  for(const [index,y] of [-.14,-.164,-.187].entries()){
    const inset=index*.003, front=.035-inset;
    finger(pistolRight,[[.044,y,.088],[.049,y-.004,.062],[.032,y-.008,front+.008],
      [.009,y-.008,front],[-.014+inset,y-.006,front+.003],[-.026+inset,y-.002,front+.015]],
      .0105-index*.00085);
  }
  finger(pistolRight,[[.044,-.127,.123],[.022,-.112,.144],[-.005,-.102,.136],
    [-.023,-.100,.114],[-.031,-.104,.089]],.013);
  const pistolIndex=new THREE.Group();
  pistolIndex.position.set(.044,-.122,.083);
  pistolRight.add(pistolIndex);
  finger(pistolIndex,[[0,0,0],[.010,.023,-.026],[.005,.029,-.054],
    [-.022,.028,-.073],[-.036,.019,-.078]],.010);

  // Merge each rigid island by material. Articulated groups remain independent.
  function batch(group){
    for(const child of [...group.children])if(child.isGroup)batch(child);
    const materials=new Map();for(const child of group.children)if(child.isMesh&&!Array.isArray(child.material)){if(!materials.has(child.material))materials.set(child.material,[]);materials.get(child.material).push(child);}
    for(const [material,meshes]of materials){if(meshes.length<2)continue;const parts=meshes.map(m=>{m.updateMatrix();const g=m.geometry.clone().applyMatrix4(m.matrix);const n=g.index?g.toNonIndexed():g; if(n!==g)g.dispose();return n;});const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());if(!geometry)continue;ownedGeometries.add(geometry);const merged=new THREE.Mesh(geometry,material);merged.name=`batched-${material.name}`;group.add(merged);for(const m of meshes)m.removeFromParent();}
  }
  for(const island of [receiver,handguard,barrelCore,barrel,barrelSleeve,muzzle,suppressor,magazine,supportAttachment,akVariant,vkVariant,pkpVariant,svVariant,...Object.values(variantDetails),scope,reflex,compactOptic,ironSights,leftArm,rightArm,leftHand,rightHand,pistolRight,...Object.values(pistols).map(p=>p.root)])batch(island);
  // Dispose unreferenced source buffers after batching, retaining reused shapes.
  const liveGeometry=new Set();weapon.traverse(o=>{if(o.geometry)liveGeometry.add(o.geometry);});for(const geometry of ownedGeometries)if(!liveGeometry.has(geometry)){geometry.dispose();ownedGeometries.delete(geometry);}
  const loadouts = {
    ar416:{classId:'assault',guard:.36,barrel:.19,width:1,finish:0x626859,handZ:-.423,grasp:[-.052,-.236,-.124]},
    ak12:{classId:'assault',guard:.34,barrel:.21,width:1.04,finish:0x3f433e,handZ:-.415,grasp:[-.052,-.242,-.128]},
    mcx9:{classId:'medic',guard:.245,barrel:.109,width:.93,finish:0x474f50,handZ:-.378,grasp:[-.045,-.237,-.123]},
    vk45:{classId:'medic',guard:.225,barrel:.095,width:.98,finish:0x52575c,handZ:-.368,grasp:[-.046,-.242,-.142]},
    mg36:{classId:'support',guard:.397,barrel:.255,width:1.16,finish:0x555e55,handZ:-.447,grasp:[-.092,-.203,-.111]},
    pkp:{classId:'support',guard:.425,barrel:.285,width:1.22,finish:0x484d45,handZ:-.458,grasp:[-.096,-.208,-.114]},
    dmr12:{classId:'recon',guard:.432,barrel:.266,width:.99,finish:0x766f59,handZ:-.456,grasp:[-.056,-.176,-.112]},
    sv98:{classId:'recon',guard:.465,barrel:.310,width:1.03,finish:0x4d6147,handZ:-.468,grasp:[-.056,-.182,-.114]},
    assault:{classId:'assault',guard:.36,barrel:.19,width:1,finish:0x626859,handZ:-.423,grasp:[-.052,-.236,-.124]},
    medic:{classId:'medic',guard:.245,barrel:.109,width:.93,finish:0x474f50,handZ:-.378,grasp:[-.045,-.237,-.123]},
    support:{classId:'support',guard:.397,barrel:.255,width:1.16,finish:0x555e55,handZ:-.447,grasp:[-.092,-.203,-.111]},
    recon:{classId:'recon',guard:.432,barrel:.266,width:.99,finish:0x766f59,handZ:-.456,grasp:[-.056,-.176,-.112]},
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
  const pistolReloadKeys = [
    {time:0,   x:0,     y:0,     z:0,    pitch:0,    roll:0},
    {time:.14, x:0,     y:0,     z:0,    pitch:0,    roll:0},
    {time:.29, x:-.009, y:-.090, z:.018, pitch:.12,  roll:-.06},
    {time:.43, x:-.114, y:-.179, z:.048, pitch:.22,  roll:-.28},
    {time:.51, x:-.116, y:-.178, z:.046, pitch:.21,  roll:-.26},
    {time:.68, x:-.019, y:-.084, z:.018, pitch:.10,  roll:-.07},
    {time:.80, x:0,     y:0,     z:0,    pitch:0,    roll:0},
    {time:1,   x:0,     y:0,     z:0,    pitch:0,    roll:0},
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
  const wristDirection = new THREE.Vector3(), palmTarget = new THREE.Vector3(), gripTarget = new THREE.Vector3(), palmOffset = new THREE.Vector3(), actionTarget = new THREE.Vector3();
  const chargeGrip = new THREE.Vector3(-.076,.019,.044);
  leftArm.matrixAutoUpdate = false;

  function poseReload(loadout, classId, support, phase, amount, charging, throwPhase=0, gadgetPhase=0, pistol=null) {
    const feed = pistol?.magazine ?? (support ? beltBox : magazine);
    const keys = pistol ? pistolReloadKeys : reloadKeys;
    let next = 1;
    while (next < keys.length - 1 && phase > keys[next].time) next++;
    const from = keys[next - 1], to = keys[next];
    const blend = THREE.MathUtils.smoothstep(phase,from.time,to.time);
    const value = channel => THREE.MathUtils.lerp(from[channel],to[channel],blend) * amount;
    const feedDepth = support ? 1.08 : 1;
    feed.position.set(value('x'),value('y')*feedDepth,value('z'));
    if(pistol)feed.position.add(pistol.magazineHome);
    feed.rotation.set(value('pitch'),0,value('roll'));
    const grip = THREE.MathUtils.smoothstep(phase,.015,.17) * (1-THREE.MathUtils.smoothstep(phase,.82,.99)) * amount;
    feedCover.rotation.x = support ? -1.07 * THREE.MathUtils.smoothstep(phase,.04,.19) * (1-THREE.MathUtils.smoothstep(phase,.73,.9)) * amount : 0;

    gripTarget.set(...(pistol ? [-.026,.018,.012] : loadout.grasp)).applyQuaternion(feed.quaternion).add(feed.position);
    if(pistol)palmTarget.copy(pistol.supportGrip);
    else palmTarget.set(-.035*loadout.width,-.08,loadout.handZ);
    palmTarget.lerp(gripTarget,grip);
    if(pistol)palmTarget.lerp(actionTarget.set(-.038,.033,.063+pistol.slide.position.z),charging);
    else palmTarget.lerp(chargeGrip,charging);
    let rotX = (pistol ? -.56 : -.92)*grip+feed.rotation.x*grip+charging*.7;
    let rotY = (pistol ? .24 : .42)*grip+charging*.3;
    let rotZ = (pistol ? .17 : .27)*grip+feed.rotation.z*grip;
    let open = pistol ? Math.max(Math.sin(grip*Math.PI)*.8,charging*.65) : 0;

    heldGrenade.visible = false;
    heldStim.visible = false;
    heldMedkit.visible = false;
    heldAmmo.visible = false;
    heldScanner.visible = false;

    if (throwPhase > 0 && throwPhase < 1) {
      const windup = THREE.MathUtils.smoothstep(throwPhase, 0, .34);
      const release = THREE.MathUtils.smoothstep(throwPhase, .34, .68);
      const recover = THREE.MathUtils.smoothstep(throwPhase, .68, 1);
      const weight = windup * (1 - recover);
      open=Math.max(open,weight);
      const throwArc = Math.sin(release * Math.PI);
      actionTarget.set(
        -.235 + release * .155,
        .225 + throwArc * .075 - release * .055,
        -.145 - release * .325
      );
      palmTarget.lerp(actionTarget, weight);
      rotX = THREE.MathUtils.lerp(rotX, .82 - release * 1.45, weight);
      rotY = THREE.MathUtils.lerp(rotY, -.42 + release * .56, weight);
      rotZ = THREE.MathUtils.lerp(rotZ, -.48 + release * .68, weight);
      heldGrenade.visible = throwPhase < .58;
    } else if (gadgetPhase > 0 && gadgetPhase < 1) {
      const raise = THREE.MathUtils.smoothstep(gadgetPhase, 0, .32);
      const act = THREE.MathUtils.smoothstep(gadgetPhase, .32, .68);
      const recover = THREE.MathUtils.smoothstep(gadgetPhase, .68, 1);
      const weight = raise * (1 - recover);
      open=Math.max(open,weight);
      if (classId === 'assault') {
        const inject = Math.sin(act * Math.PI);
        actionTarget.set(-.21 + inject * .065, .195 - inject * .09, -.18 + inject * .06);
        rotX = THREE.MathUtils.lerp(rotX, .68 + inject * .45, weight);
        rotY = THREE.MathUtils.lerp(rotY, -.38, weight);
        rotZ = THREE.MathUtils.lerp(rotZ, -.52 - inject * .25, weight);
        heldStim.visible = gadgetPhase < .86;
      } else {
        const toss = Math.sin(act * Math.PI);
        actionTarget.set(-.21 + act * .11, .19 + toss * .06 - act * .05, -.18 - act * .26);
        rotX = THREE.MathUtils.lerp(rotX, .58 - act * 1.05, weight);
        rotY = THREE.MathUtils.lerp(rotY, -.32 + act * .38, weight);
        rotZ = THREE.MathUtils.lerp(rotZ, -.35 + act * .45, weight);
        if (classId === 'medic') heldMedkit.visible = gadgetPhase < .64;
        else if (classId === 'support') heldAmmo.visible = gadgetPhase < .64;
        else if (classId === 'recon') heldScanner.visible = gadgetPhase < .64;
      }
      palmTarget.lerp(actionTarget, weight);
    }

    if(pistol){
      for(const [index,digit] of supportFingers.entries()){
        digit.rotation.y=open*(.42+index*.04);
        digit.rotation.z=-open*(index-1.5)*.07;
      }
      supportThumb.rotation.z=-open*.28;
    }
    leftHand.rotation.set(rotX, rotY, rotZ);
    palmOffset.copy(palmLocal);
    if(!pistol)palmOffset.multiply(rifleGlove.scale);
    palmOffset.applyQuaternion(leftHand.quaternion);
    leftHand.position.copy(palmTarget).sub(palmOffset);

    // Keep the shoulder anchored while the cuff follows the rotating wrist.
    wristDirection.copy(wristLocal);
    if(!pistol)wristDirection.multiply(rifleGlove.scale);
    wristDirection.applyQuaternion(leftHand.quaternion).add(leftHand.position).sub(shoulder);
    // Extend the cloth cuff into the glove so it stays joined at every wrist angle.
    armScale.z = (wristDirection.length()+(pistol ? .020 : .012))/armLength;
    armRotation.setFromUnitVectors(armAxis,wristDirection.normalize());
    leftArm.matrix.compose(shoulder,armRotation,armScale).multiply(restArmInverse);
    leftArm.matrixWorldNeedsUpdate = true;
  }

  const defaultByClass = { assault: 'ar416', medic: 'mcx9', support: 'mg36', recon: 'dmr12' };
  let previousKey = '';
  let previousTeam = -1;
  let visiblePistol = null;
  function update({classId='assault',weaponId='',team=0,aim=0,reloadPhase,reloadMotion=0,reloadEmpty=true,kick=0,clock=0,throwPhase=0,gadgetPhase=0}={}){
    team = team ? 1 : 0;
    if(team !== previousTeam){
      previousTeam = team;
      for(const [material, color] of [[cloth,team?0xc1ab85:0x849783],[glove,team?0x6b6256:0x51544d],
        [glovePanel,team?0xa4987e:0x8d8979],[bakedGloveMat,team?0xb7a18a:0x999989],[cuff,team?0x605942:0x384638]]){
        material.color.setHex(color);
        material._lowMaterial?.color.setHex(color);
        material._highMaterial?.color.setHex(color);
      }
    }
    if (!Object.hasOwn(defaultByClass,classId)) classId = 'assault';
    const pistol = Object.hasOwn(pistols,weaponId) ? pistols[weaponId] : null;
    const key = pistol || Object.hasOwn(loadouts,weaponId) ? weaponId : defaultByClass[classId];
    const loadout = loadouts[key] ?? loadouts[classId];
    const support = !pistol && classId === 'support', recon = !pistol && classId === 'recon';
    const isAk = key === 'ak12', isVk = key === 'vk45', isPkp = key === 'pkp', isSv = key === 'sv98';
    if (key !== previousKey) {
      previousKey = key;
      visiblePistol = pistol;
      rifleAssembly.visible = !pistol;
      rifleGlove.visible = !pistol;
      rifleGlove.scale.x = loadout.width;
      pistolGlove.visible = Boolean(pistol);
      rightHand.visible = !pistol;
      pistolRight.visible = Boolean(pistol);
      pistolRight.position.x = pistol?.heavy ? .003 : 0;
      for(const model of Object.values(pistols))model.root.visible=model===pistol;
      const end = -.225-loadout.guard-loadout.barrel;
      const coreRear=-.205,coreFront=-.225-loadout.guard-.012;
      barrelCore.position.set(0,.015,(coreRear+coreFront)/2);
      barrelCore.scale.set(support?1.14:1,support?1.14:1,(coreRear-coreFront)/.4);
      handguard.scale.set(loadout.width,1,loadout.guard/hgLength);
      anodized.color.setHex(loadout.finish);
      barrel.position.set(0,.015,end+loadout.barrel/2);
      barrel.scale.z = loadout.barrel/.25;
      barrelSleeve.position.set(0,.015,-.225-loadout.guard+.015);
      muzzle.position.set(0,.015,end);
      suppressor.position.set(0,.015,end-.035);
      muzzle.visible = !recon && !isVk;
      supportAttachment.visible = support;
      for(const [id,group] of Object.entries(variantDetails))group.visible=id===key;
      akVariant.visible = isAk;
      vkVariant.visible = isVk;
      pkpVariant.visible = isPkp;
      svVariant.visible = isSv;
      boltHandleKnob.visible = isSv;
      magazine.visible = !support;
      rifleFeed.visible = classId === 'assault' && !isAk;
      akFeed.visible = isAk;
      compactFeed.visible = classId === 'medic' && !isVk;
      vkFeed.visible = isVk;
      marksmanFeed.visible = recon;
      reflex.visible = classId === 'assault';
      compactOptic.visible = classId === 'medic';
      ironSights.visible = support;
      for (const [name, stamp] of Object.entries(weaponLabels)) stamp.visible = name === key;
      frontSight.position.z = -.225-loadout.guard+.035;
      weapon.userData.muzzleZ = end-(recon||isVk?.215:.084);
      for (const feed of [magazine,beltBox]) { feed.position.set(0,0,0);feed.rotation.set(0,0,0); }
    }
    scope.visible = recon && aim < .92;
    suppressor.visible = recon || isVk;
    muzzleFlash.position.set(0,pistol ? .012 : .015,pistol ? pistol.front : weapon.userData.muzzleZ);
    flashLight.position.copy(muzzleFlash.position);
    const hasPhase = Number.isFinite(reloadPhase);
    const phase = hasPhase ? THREE.MathUtils.clamp(reloadPhase,0,1) : reloadMotion > 0 ? .64 : 1;
    const amount = hasPhase ? 1 : THREE.MathUtils.clamp(reloadMotion,0,1);
    const chargeStart=support?.89:.82, chargePeak=support?.93:.875, chargeEnd=support?.98:.94;
    const charging=support||reloadEmpty
      ? THREE.MathUtils.smoothstep(phase,chargeStart,chargePeak)*(1-THREE.MathUtils.smoothstep(phase,chargePeak,chargeEnd))
      : 0;
    bolt.position.z = -.02+kick*.036+charging*.045;
    triggerFinger.rotation.y=kick*.12;
    if(pistol){
      const travel=pistol.heavy ? .041 : .027;
      pistol.slide.position.z=Math.max(kick*travel,reloadEmpty?travel*.85:0,charging*travel);
      pistolIndex.rotation.y=kick*.16;
    }
    poseReload(loadout,classId,support,phase,amount,charging,throwPhase,gadgetPhase,pistol);
    muzzleFlash.visible = kick > .65;
    muzzleFlash.rotation.z = clock*43;
    muzzleFlash.scale.setScalar((pistol?(pistol.heavy?.85:.57):1)*(.78+kick*.22));
    flashLight.intensity = kick > .65 ? 1.8 : 0;
  }
  function dispose(){
    for(const geometry of ownedGeometries)geometry.dispose();
    for(const material of ownedMaterials)material.dispose();
    for(const texture of ownedTextures)texture.dispose();
  }
  update();weapon.position.set(.26,-.23,-.42);
  return {weapon,handguard,bolt,get ejection(){return visiblePistol?.ejection??bolt;},
    get sightType(){return visiblePistol?'iron':reflex.visible?'reflex':compactOptic.visible?'compact':scope.visible?'scope':'iron';},
    barrel,barrelSleeve,muzzle,suppressor,supportAttachment,scope,magazine,leftHand,leftArm,heldGrenade,heldStim,heldMedkit,heldAmmo,heldScanner,muzzleFlash,flashLight,flashMaterial,update,dispose};
}
