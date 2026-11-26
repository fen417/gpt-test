export const NAHAR_DISTRICT_ROADS=[
  ['workshop-street',232,184,8.8,65],
  ['repair-street',197,214,79,8.6],
  ['tunnel-service-lane',166,201,7,27],
];
export const NAHAR_TUNNEL={start:178,end:226,z:194,lampX:[183,191,199,207,215,223]};

export function addNaharGroundDistrict(part,paving,outline){
  const concrete={surface:'concrete'},metal={surface:'metal'},wood={surface:'wood'};
  const detail=(surface='metal')=>({surface,detail:1,noCollision:true});
  const cylinder=(surface='metal',noCollision=false)=>({surface,shape:'cylinder',noCollision});

  function bollard(id,x,z){
    part(id+'-foot',x,z,.41,.41,.12,0,'#72695d',cylinder('concrete',true));
    part(id+'-post',x,z,.19,.19,.91,.1,'#636d63',cylinder());
    part(id+'-band',x,z,.202,.202,.14,.68,'#b29652',{...cylinder('metal',true),detail:1});
  }

  function barrier(id,x,z,alongX=true,length=3.1){
    const w=alongX?length:.64,d=alongX?.64:length;
    part(id,x,z,w,d,1.05,0,'#928675',{...concrete,shape:'beveled'});
    for(const sign of [-1,1]){
      const a=x+(alongX?sign*length*.37:0),b=z+(alongX?0:sign*length*.37);
      part(id+'-foot-'+sign,a,b,alongX?.44:.83,alongX?.83:.44,.16,0,'#7d7569',{...concrete,shape:'beveled'});
    }
    for(const offset of [-.27,0,.27]){
      const a=x+(alongX?offset*length:0),b=z+(alongX?0:offset*length);
      for(const side of [-1,1])part(id+'-paint-'+offset+'-'+side,
        a+(alongX?0:side*.324),b+(alongX?side*.324:0),alongX?.32:.016,alongX?.016:.32,
        .13,.77,'#ba9d58',detail('concrete'));
    }
  }

  function lamp(id,x,z,direction=1){
    part(id+'-pedestal',x,z,.47,.47,.31,0,'#928575',concrete);
    part(id+'-pole',x,z,.15,.15,5.6,.31,'#646b62',cylinder());
    part(id+'-arm',x,z+direction*.68,.11,1.44,.1,5.72,'#646b62',detail());
    part(id+'-head',x,z+direction*1.33,.4,.61,.14,5.66,'#65736c',{...detail(),shape:'beveled'});
    part(id+'-lens',x,z+direction*1.33,.31,.45,.035,5.635,'#cbd0b7',detail('concrete'));
  }

  function streetCart(id,x,z,tone){
    part(id+'-chassis',x,z,1.86,3.85,.23,.31,'#474a43',metal);
    part(id+'-cab',x,z-1.1,1.78,1.45,1.33,.49,tone,{...metal,shape:'beveled'});
    part(id+'-bed',x,z+.71,1.86,2.28,.18,.52,tone,metal);
    for(const side of [-1,1]){
      part(id+'-bed-wall-'+side,x+side*.87,z+.72,.12,2.2,.53,.63,tone,metal);
      part(id+'-cab-window-'+side,x+side*.898,z-1.10,.026,.70,.41,1.29,'#364548',detail());
      for(const axle of [-1.25,1.18]){
        part(id+'-tire-'+side+'-'+axle,x+side*.87,z+axle,.27,.66,.66,.012,'#333632',
          {...metal,shape:'cylinder-x',noCollision:true});
        part(id+'-hub-'+side+'-'+axle,x+side*1.014,z+axle,.026,.31,.31,.19,'#797b6c',
          {...detail(),shape:'cylinder-x'});
      }
    }
    part(id+'-windshield',x,z-1.835,1.4,.027,.49,1.22,'#435354',detail());
    part(id+'-tailgate',x,z+1.8,1.84,.11,.54,.64,tone,metal);
    part(id+'-grille',x,z-1.85,.93,.05,.23,.67,'#3c4543',detail());
    for(const side of [-1,1]){
      part(id+'-headlight-'+side,x+side*.65,z-1.86,.28,.075,.18,.77,'#c4bfa3',detail());
      part(id+'-taillight-'+side,x+side*.65,z+1.88,.18,.045,.12,.77,'#974e38',detail());
    }
    part(id+'-bumper',x,z-1.99,1.88,.18,.16,.36,'#676955',{...detail(),shape:'beveled'});
    part(id+'-cargo',x,z+.65,1.55,1.1,.57,.71,'#827354',wood);
  }

  function frontage(id,x,z,w,d,h,tone,side,flank=0){
    outline(part(id,x,z,w,d,h,0,tone));
    part(id+'-plinth',x,z,w+.12,d+.12,.43,0,'#887e6f',concrete);
    part(id+'-coping',x,z,w+.45,d+.45,.34,h-.19,'#a79e88',concrete);
    const face=z+side*(d/2+.028),doors=Math.floor(w/5);
    for(let i=0;i<doors;i++){
      const px=x+(i-(doors-1)/2)*4.6,shade=i%3===1?'#7e715c':'#687775';
      part(id+'-reveal-'+i,px,face,3.24,.10,2.94,.12,'#57574e',{...detail('concrete'),detail:0});
      part(id+'-shutter-'+i,px,face+side*.065,2.89,.047,2.67,.16,shade,{...detail(),detail:0});
      for(let y=.34;y<2.7;y+=.15)part(id+'-slat-'+i+'-'+y,px,face+side*.096,2.84,.033,.026,y,'#505e5c',detail());
      part(id+'-lintel-'+i,px,face+side*.08,3.44,.19,.18,2.99,'#b3a78e',detail('concrete'));
      part(id+'-canopy-'+i,px,face+side*.73,3.29,1.55,.16,3.29,i%2?'#7f6956':'#5b7673',
        {...detail(),shape:'beveled'});
      part(id+'-drip-'+i,px,face+side*1.47,3.24,.12,.19,3.21,'#595d52',detail());
    }
    for(const dx of [-w*.31,w*.30]){
      part(id+'-upper-window-'+dx,x+dx,face,1.92,.11,.71,h-.98,'#515b56',detail());
      part(id+'-sill-'+dx,x+dx,face+side*.13,2.13,.34,.12,h-1.04,'#a89b82',detail('concrete'));
    }
    if(!flank)return;
    const end=x+flank*(w/2+.035);
    part(id+'-flank-strip',end,z,.09,d,.17,1.01,'#7e8c82',{...concrete,noCollision:true});
    for(const offset of [-.31,0,.31]){
      const pz=z+offset*d;
      part(id+'-flank-recess-'+offset,end,pz,.15,2.35,1.04,3.52,'#555953',{...metal,noCollision:true});
      for(const bar of [-.71,0,.71])
        part(id+'-flank-frame-'+offset+'-'+bar,end+flank*.09,pz+bar,.063,.07,1.02,3.53,'#989681',detail());
      part(id+'-flank-sill-'+offset,end+flank*.11,pz,.42,2.55,.13,3.45,'#aa9f8c',detail('concrete'));
    }
    for(const offset of [-.42,.42]){
      const pz=z+offset*d;
      part(id+'-downspout-'+offset,end+flank*.16,pz,.118,.118,h-.71,.25,'#686e66',
        {...cylinder('metal',true),detail:1});
      part(id+'-downspout-foot-'+offset,end+flank*.21,pz,.21,.15,.18,.16,'#818279',detail());
    }
    part(id+'-side-door',end+flank*.08,z+.22*d,.23,1.45,2.31,.10,'#687b73',
      {...metal,noCollision:true});
    part(id+'-side-awning',end+flank*.72,z+.22*d,1.45,2.55,.15,2.68,'#75877c',
      {...detail(),shape:'beveled'});
    part(id+'-side-awning-rim',end+flank*1.41,z+.22*d,.085,2.54,.22,2.58,'#586961',detail());
    part(id+'-side-grille',end,z-.21*d,.18,2.01,.67,1.72,'#716e60',{...metal,noCollision:true});
    for(let i=0;i<5;i++)part(id+'-side-grille-slat-'+i,end+flank*.10,z-.21*d,.045,1.81,.033,1.8+i*.114,
      '#4d5752',detail());
  }

  function directionSign(id,x,z,side){
    part(id+'-pole',x,z,.09,.09,2.37,0,'#6c7063',cylinder());
    part(id+'-plate',x,z,1.07,.08,.37,1.91,'#596b62',{...metal,shape:'beveled',noCollision:true});
    part(id+'-arrow-bar',x-side*.10,z-.046,.47,.017,.058,2.05,'#d8ca98',detail('unlit'));
    part(id+'-arrow-head',x+side*.28,z-.045,.24,.018,.19,1.98,'#d8ca98',
      {...detail('unlit'),shape:'arrow',facing:side});
  }

  // Keep the station exits, landing pads and carriage crossings clear.
  for(const [id,x,z,side] of [
    ['depot-north',-70,-7,-1],['depot-east',-29,-7,-1],['station-court',40,56,1],
    ['freight-east',82,70,-1],['quay',146,143,1],['waterworks',182,146,1],
    ['workshop-north',239,156,1],['workshop-south',239,205,-1],['repair-yard',200,219,-1],
    ['tunnel-forecourt',169,184,1],
  ])lamp(id,x,z,side);
  for(const [id,x,z,tone] of [
    ['depot-delivery',-62,-21,'#6f8178'],['freight-service',55,74,'#86745a'],
    ['utility-truck',197,147,'#7f8d76'],['workshop-pickup',237.5,183,'#8a6c52'],
    ['repair-pickup',184.5,207.4,'#677e79'],
  ])streetCart(id,x,z,tone);
  for(const [id,x,z,alongX,length] of [
    ['freight-island',72,72,true,3.7],['quay-island',150,162,true,3.8],
    ['workshop-layby',227,169,false,4.4],['workshop-junction',236,208,false,3.2],
    ['repair-island',199,211.3,true,4.5],['repair-alcove',213,217.1,true,3.6],
    ['tunnel-layby',169.7,198.2,false,3.7],
  ])barrier(id,x,z,alongX,length);

  frontage('workshops-north',198.5,173,31,22,6.55,'#b6a58a',-1,1);
  frontage('workshops-east',256,174,29,20,6.3,'#b7a892',-1,-1);
  frontage('workshops-corner',253,199,25,19,5.3,'#a69780',1,-1);
  frontage('repair-west',181,225,22,11,5.45,'#a8977d',-1);
  frontage('repair-east',219,226,24,10,5.8,'#b4a68e',-1);

  for(const [id,x,z] of [['depot-pallets',-72,-9.2],['freight-pallets',87.5,70.8],
    ['workshops-pallets',220,178.4],['corner-pallets',241.2,198],['repair-pallets',181,219.5]]){
    part(id+'-base',x,z,1.86,1.24,.14,0,'#827256',wood);
    for(const offset of [-.55,0,.55])part(id+'-foot-'+offset,x+offset,z,.19,1.20,.12,.015,'#6b604d',detail('wood'));
    part(id+'-case',x-.39,z,1.02,.91,.78,.15,'#9a8664',{...wood,shape:'beveled'});
    part(id+'-case-top',x-.39,z,1.08,.98,.073,.918,'#ad9772',wood);
    part(id+'-spare-tire',x+.62,z+.18,.68,.68,.26,.14,'#44463e',cylinder('metal',true));
    part(id+'-side-bin',x+.62,z-.35,.68,.56,.47,.15,'#657168',{...metal,shape:'beveled'});
  }

  for(const [id,x,z,w,d] of [
    ['workshops-apron',198.5,159.2,31,4.4],['corner-apron',253,210.1,25,3.1],
    ['repair-apron-west',181,218.9,22,1.2],['repair-apron-east',219,220.4,24,1.2],
    ['tunnel-apron',170,194,16.1,10.8],
  ])paving(id,x,z,w,d,'#a89880','concrete',2);
  for(const [id,x,z,w,d] of [
    ['workshops-walk',224,171,1.5,22],['east-walk',239.4,173.8,1.45,23],
    ['east-walk-south',239.4,198.9,1.45,13.5],['repair-walk-1',183,220.3,21,1.24],
    ['repair-walk-2',219,220.3,23,1.24],['quay-walk',185,146,25,1.2],
  ])part(id,x,z,w,d,.135,0,'#a79a83',{...concrete,shape:'beveled'});
  for(const [x,z] of [[174,188.8],[174,199.2],[226.4,163],[226.4,183],[239,162],[240,205],[240,214],[195,218.5],[205,218.5]])
    bollard('street-bollard-'+x+'-'+z,x,z);
  directionSign('workshops-direction',236.8,156.5,1);
  directionSign('repair-direction',229.4,211.5,-1);
  directionSign('tunnel-direction',163.4,198.2,1);

  // A pump-yard retaining wall hides the mouth from the relay courtyard.
  for(const [id,x,z,w,d] of [
    ['pump-yard-screen',154,187,14,1.04],['west-portal-wall',174.2,186.1,26,.85],
    ['loading-yard-screen',213.7,185.7,13.5,1.02],['service-ramp-wall',222.8,205,1.05,10],
  ]){
    part(id,x,z,w,d,3.1,0,'#a29784',concrete);
    part(id+'-cap',x,z,w+.2,d+.2,.16,3.08,'#b3a792',{...concrete,shape:'beveled'});
  }

  addTunnel(part,paving,barrier,outline);
}

function addTunnel(part,paving,barrier,outline){
  const {start,end,z,lampX}=NAHAR_TUNNEL;
  const middle=(start+end)/2,length=end-start,inside=4.64,spring=2.7,crown=4.62;
  const concrete={surface:'concrete'},metal={surface:'metal'};
  const detail=(surface='metal')=>({surface,detail:1,noCollision:true});
  const arch=Array.from({length:17},(_,i)=>{
    const angle=Math.PI*i/16;
    return [spring+Math.sin(angle)*(crown-spring),-Math.cos(angle)*inside];
  });
  outline({id:'service-tunnel',x:middle,z,w:length,d:10.4,h:5.29,baseY:0},true);

  paving('tunnel-roadbed',middle,z,length,inside*2,'#776d5c','concrete',4);
  part('tunnel-end-firewall',end,z,.66,10.23,5.25,0,'#5f615b',concrete);
  for(const side of [-1,1]){
    part('tunnel-side-'+side,middle,z+side*4.9,length, .52,spring,0,'#868277',concrete);
    part('tunnel-side-walk-'+side,middle,z+side*4.06,length,1.12,.16,0,'#9a9282',concrete);
    part('tunnel-drain-'+side,middle,z+side*3.43,length,.20,.025,0,'#514e45',detail());
    part('tunnel-wall-kick-'+side,middle,z+side*4.633,length,.035,.42,.17,'#5d665f',detail('concrete'));
    part('tunnel-guide-stripe-'+side,middle,z+side*4.627,length,.025,.12,1.14,'#b8a165',detail('concrete'));
    part('tunnel-conduit-'+side,middle,z+side*4.53,length,.15,.15,2.3,'#646c66',detail());
  }
  for(let i=0;i<arch.length-1;i++){
    const [a,b]=arch.slice(i,i+2),offset=(a[1]+b[1])/2,span=b[1]-a[1];
    const shell=[a,b,[5.29,b[1]],[5.29,a[1]]];
    part('tunnel-vault-'+i,middle,z,length,10.4,5.29,0,i%2?'#89867c':'#908c80',
      {...concrete,shape:'profile-x',profile:shell,noCollision:true});
    const underside=Math.min(a[0],b[0]);
    part('tunnel-vault-collision-'+i,middle,z+offset,length,span,5.29-underside,underside,'#89867c',
      {...concrete,collisionOnly:true});
    for(const x of [178.0,186.9,195.0,203.0,211.0,219.0]){
      const thick=x===178?.33:.115,wide=x===178?1.55:.29;
      part('vault-rib-'+x+'-'+i,x,z,wide,10.4,5.29,0,x===178?'#b1a998':'#a19b8c',
        {...concrete,shape:'profile-x',profile:[[a[0]-thick,a[1]],[b[0]-thick,b[1]],b,a],noCollision:true});
    }
  }
  for(const side of [-1,1]){
    const pz=z+side*5.06;
    part('portal-jamb-'+side,177.8,pz,1.97,1.31,3.27,0,'#a39a88',{...concrete,shape:'beveled'});
    part('portal-foot-'+side,177.45,pz,2.4,1.6,.46,0,'#847c70',{...concrete,shape:'beveled'});
    part('portal-wing-'+side,180,z+side*6.41,7.6,1.31,3.92,0,'#918778',{...concrete,shape:'beveled'});
  }
  part('portal-head',178.1,z,1.88,11.64,.53,4.99,'#a2947e',concrete);
  part('portal-coping',178.1,z,2.27,12.05,.23,5.48,'#b6a993',{...concrete,shape:'beveled'});
  part('portal-sign',177.116,z,.145,1.6,.48,4.91,'#4d665f',metal);
  for(const [i,digit] of ['abcdef','bcfg'].entries()){
    const center=z+(i-.5)*.31;
    for(const letter of digit){
      const [dz,y,d,h]={
        a:[0,5.254,.172,.035],b:[.084,5.154,.033,.115],c:[.084,5.026,.033,.115],
        d:[0,5.012,.172,.035],e:[-.084,5.026,.033,.115],f:[-.084,5.154,.033,.115],
        g:[0,5.134,.172,.035],
      }[letter];
      part('portal-digit-'+i+'-'+letter,177.031,center+dz,.021,d,h,y,'#e4ce86',detail('unlit'));
    }
  }
  for(const x of lampX){
    const railZ=z-3.77;
    part('tunnel-lamp-bracket-'+x,x,railZ,.26,.72,.13,2.79,'#5f625b',detail());
    part('tunnel-lamp-body-'+x,x,railZ,.98,.40,.19,2.72,'#5d655f',{...detail(),shape:'beveled'});
    part('tunnel-lamp-glass-'+x,x,railZ,.75,.28,.035,2.694,'#edca86',{...detail('unlit'),detail:0});
    part('tunnel-panel-joint-'+x,x,z,.033,6.74,.009,.005,'#625e52',detail('concrete'));
  }
  for(const [x,side,tone] of [[185,1,'#626f66'],[194,-1,'#6d7466'],[205,1,'#716d5c'],[218,-1,'#5e7266']]){
    const pz=z+side*3.93;
    part('tunnel-cabinet-'+x,x,pz,1.38,.79,1.74,.16,tone,{...metal,shape:'beveled'});
    part('tunnel-vent-'+x,x,pz-side*.406,.81,.059,.3,1.19,'#4c554f',detail());
    for(let i=0;i<4;i++)part('tunnel-vent-slat-'+x+'-'+i,x,pz-side*.441,.76,.03,.022,1.22+i*.061,'#879287',detail());
    part('tunnel-panel-handle-'+x,x+.47,pz-side*.43,.085,.10,.22,.92,'#b4a791',detail());
  }
  barrier('tunnel-divider',199.4,z+2.43,true,3.6);
  part('exit-bulkhead',225.59,z,.19,3.68,3.21,0,'#566460',{...metal,noCollision:true});
  for(const side of [-1,1]){
    part('exit-door-jamb-'+side,225.34,z+side*1.9,.43,.16,3.34,0,'#898d7f',concrete);
    part('exit-light-'+side,225.22,z+side*2.18,.17,.14,.42,2.07,'#e7bd75',detail('unlit'));
  }
  part('exit-header',225.28,z,.38,3.97,.24,3.21,'#979789',concrete);
  part('exit-sign',225.046,z,.14,.86,.26,2.82,'#98ad81',{...detail('unlit'),detail:0});
}
