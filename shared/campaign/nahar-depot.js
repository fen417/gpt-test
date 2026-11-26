const steel={surface:'metal'},concrete={surface:'concrete'},wood={surface:'wood'};
const trim=(surface='metal')=>({surface,noCollision:true,detail:1});
const dark='#505a56',paint='#71827a',ivory='#b9b098';

export function addNaharDepot(part,paving,wall,structures){
  for(const hall of [
    {id:'shed-west',x:-104,z:23,w:30,d:19,roof:'#375d70',side:-1},
    {id:'shed-east',x:-68,z:25,w:25,d:17,roof:'#80796b',side:1},
  ]){
    const {id,x,z,w,d,roof,side}=hall;
    const add=(name,dx,dz,...values)=>part(id+'-'+name,x+dx,z+dz,...values);
    structures.push({id,kind:'city-block',x,z,w,d,h:5.1,baseY:0,enterable:true,assetMapId:'nahar'});
    for(const sign of [-1,1]){
      wall(id+'-side-'+sign,x+sign*w/2,z,d,.27,4.8,ivory,{axis:'z',gap:5});
      wall(id+'-front-'+sign,x,z+sign*d/2,w,.27,4.8,ivory,{gap:7});
      for(const offset of [-1,1]){
        const zp=offset*(d/4+1.25),xp=offset*(w/4+1.75);
        add(`side-plinth-${sign}-${offset}`,sign*(w/2-.142),zp,.055,(d-5)/2,.89,0,paint,{...concrete,noCollision:true});
        add(`end-plinth-${sign}-${offset}`,xp,sign*(d/2-.142),(w-7)/2,.055,.89,0,paint,{...concrete,noCollision:true});
      }
      for(const dx of [-3.63,3.63]){
        add(`portal-jamb-${sign}-${dx}`,dx,sign*(d/2-.14),.22,.34,3.1,0,dark,steel);
        add(`portal-guard-${sign}-${dx}`,dx,sign*(d/2-.53),.19,.19,1.02,0,'#a48a50',{...steel,shape:'cylinder'});
      }
      add('portal-header-'+sign,0,sign*(d/2-.13),7.4,.29,.28,2.6,dark,steel);
      add('portal-sign-'+sign,0,sign*(d/2-.32),1.35,.13,.42,3.12,'#516962',{...steel,noCollision:true});
    }
    add('roof',0,0,w+.8,d+.86,.26,4.8,roof,steel);
    paving(id+'-floor',x,z,w-.28,d-.28,'#858078','concrete',4);
    for(const dz of [-d/2+3,d/2-3])
      paving(id+'-expansion-'+dz,x,z+dz,w-.45,.055,'#665f55','concrete',5);

    // The transverse steelwork sits above the original door and aisle envelope.
    for(const dz of [-d*.33,-d*.14,d*.14,d*.33]){
      const half=w/2-.17;
      add('tie-'+dz,0,dz,w-.26,.19,.235,3.37,dark,steel);
      for(const sx of [-1,1]){
        add('upright-'+dz+'-'+sx,sx*(half-.15),dz,.24,.26,4.8,0,dark,steel);
        beam(part,`${id}-rafter-${dz}-${sx}`,
          [x+sx*half,3.60,z+dz],[x,4.74,z+dz],.16,dark);
        beam(part,`${id}-brace-${dz}-${sx}`,
          [x+sx*(half*.69),3.59,z+dz],[x+sx*(half*.41),4.26,z+dz],.105,paint);
        beam(part,`${id}-web-${dz}-${sx}`,
          [x+sx*(half*.30),3.60,z+dz],[x+sx*(half*.4),4.26,z+dz],.081,dark);
      }
      add('lamp-body-'+dz,0,dz,2.25,.26,.13,3.30,dark,{...steel,noCollision:true});
      add('lamp-lens-'+dz,0,dz,1.97,.17,.033,3.274,'#e0d8ab',{surface:'unlit',noCollision:true});
    }
    for(const dx of [-w*.28,-w*.16,w*.16,w*.28]){
      add('ceiling-purlin-'+dx,dx,0,.17,d-.3,.17,4.63,paint,{...steel,noCollision:true});
      add('cable-carrier-'+dx,dx,0,.17,d-.34,.10,3.56,dark,{...steel,noCollision:true});
    }
    for(const sign of [-1,1]){
      const face=sign*(w/2-.148);
      for(const dz of [-d*.35,-d*.19,d*.19,d*.35]){
        add('intake-'+sign+'-'+dz,face,dz,.12,1.71,.58,3.78,'#626f67',{...steel,noCollision:true});
        for(let n=0;n<4;n++)add('intake-louver-'+sign+'-'+dz+'-'+n,face-sign*.07,dz,.055,1.62,.041,3.83+n*.12,ivory,trim());
      }
    }

    const bay=side*w*.245;
    for(const rail of [-.73,.73]){
      paving(id+'-rail-channel-'+rail,x+bay+rail,z,.26,d-.35,'#666159','concrete',6);
      add('repair-rail-'+rail,bay+rail,0,.086,d-.25,.046,.008,'#6e7370',{...steel,noCollision:true});
    }
    for(const border of [-1,1]){
      paving(id+'-safety-line-'+border,x+bay+border*1.8,z,.105,d-1.1,'#b4a166','concrete',6);
      for(let i=0;i<6;i++){
        add('hazard-'+border+'-'+i,bay+border*1.8,-d/2+.8+i*.23,.108,.122,.009,.006,'#595549',trim('concrete'));
      }
    }
    if(side<0)inspectionCar(add,bay,-2.2);
    else bogieStand(add,bay,3.15);
    workArea(add,-side*w*.30,-d*.29);
    workArea(add,-side*w*.31,d*.33);
    stockRack(add,side*w*.375,d*.365);
    add('air-manifold',side*(w/2-.23),d*.22,.18,.18,2.89,.65,'#5c7066',{...steel,shape:'cylinder',noCollision:true});
    add('air-pipe',side*(w/2-.22),0,.13,d-.44,.12,3.52,'#697e71',{...steel,noCollision:true});
    add('breaker',side*(w/2-.42),-d*.29,.61,.83,1.18,.84,'#67716a',{...steel,shape:'beveled'});
    add('breaker-face',side*(w/2-.78),-d*.29,.14,.63,.85,1,'#555f5b',trim());
  }
}

function beam(part,id,a,b,width,color){
  const position=a.map((start,i)=>(start+b[i])/2);
  const item=part(id,position[0],position[2],Math.abs(a[0]-b[0])+width,width,Math.abs(a[1]-b[1])+width,
    Math.min(a[1],b[1])-width/2,color,{...steel,shape:'beam',noCollision:true});
  item.ends=[a,b];item.beamWidth=width;
}

function inspectionCar(add,x,z){
  const cream='#b4a88a',green='#587973',black='#414b47',d=7.7;
  add('car-chassis',x,z,2.23,d,.25,.34,black,steel);
  add('car-body',x,z,2.25,d-.11,1.97,.55,green,{...steel,shape:'beveled'});
  add('car-roof',x,z,2.29,d-.18,.29,2.50,cream,{...steel,shape:'beveled'});
  add('car-roof-ridge',x,z,1.84,d-.40,.11,2.74,'#a99d85',{...steel,shape:'beveled',noCollision:true});
  for(const side of [-1,1]){
    add('car-waist-'+side,x+side*1.137,z,.062,d-.33,.16,1.31,cream,{...steel,noCollision:true});
    for(const n of [-2.55,-1.31,0,1.31,2.55]){
      add('car-window-frame-'+side+'-'+n,x+side*1.132,z+n,.08,1.04,.68,1.67,'#a8a18c',{...steel,noCollision:true});
      add('car-window-'+side+'-'+n,x+side*1.180,z+n,.044,.90,.54,1.74,'#465960',{...steel,noCollision:true});
      add('car-mullion-'+side+'-'+n,x+side*1.207,z+n,.045,.048,.55,1.74,cream,trim());
    }
    for(const n of [-2.77,-1.91,1.91,2.77]){
      add('car-wheel-'+side+'-'+n,x+side*.80,z+n,.27,.66,.66,.047,black,{...steel,shape:'cylinder-x',noCollision:true});
      add('car-hub-'+side+'-'+n,x+side*.947,z+n,.037,.39,.39,.182,'#777970',{...trim(),shape:'cylinder-x'});
    }
    add('car-cab-'+side,x,z+side*(d/2-.018),1.64,.13,.69,1.71,'#526360',{...steel,noCollision:true});
    add('car-cab-frame-'+side,x,z+side*(d/2+.055),.081,.059,.66,1.725,cream,trim());
    add('car-coupler-'+side,x,z+side*(d/2+.16),.34,.41,.16,.40,black,{...steel,shape:'beveled',noCollision:true});
    for(const dx of [-.67,.67])add('car-lamp-'+side+'-'+dx,x+dx,z+side*(d/2+.05),.28,.14,.24,1.03,'#bdb990',
      {...steel,shape:'beveled',noCollision:true});
  }
}

function bogieStand(add,x,z){
  add('bogie-base',x,z,2.5,2.86,.17,0,'#69685d',{...steel,shape:'beveled'});
  for(const dz of [-.78,.78]){
    add('bogie-axle-'+dz,x,z+dz,1.75,.21,.23,.53,dark,{...steel,noCollision:true});
    for(const dx of [-.72,.72]){
      add('bogie-wheel-'+dx+'-'+dz,x+dx,z+dz,.22,.91,.91,.18,'#5b635c',{...steel,shape:'cylinder-x'});
      add('bogie-hub-'+dx+'-'+dz,x+dx*1.15,z+dz,.065,.36,.36,.46,'#8b8c7e',{...trim(),shape:'cylinder-x'});
    }
  }
  for(const dx of [-.88,.88]){
    add('bogie-frame-'+dx,x+dx,z,.23,2.22,.24,.75,'#6e756a',steel);
    for(const dz of [-.42,.42])add('bogie-spring-'+dx+'-'+dz,x+dx,z+dz,.23,.23,.37,.93,'#4a514d',{...steel,shape:'cylinder'});
  }
}

function workArea(add,x,z){
  const prefix='bench-'+z;
  for(const dx of [-1.16,1.16])
    add(prefix+'-leg-'+dx,x+dx,z,.15,.74,.86,0,dark,steel);
  add(prefix+'-shelf',x,z,2.37,.70,.10,.31,paint,steel);
  add(prefix+'-top',x,z,2.64,.88,.13,.85,'#9b8161',{...wood,shape:'beveled'});
  add(prefix+'-vise',x-.86,z-.08,.36,.34,.29,.98,'#607c73',{...steel,shape:'beveled'});
  add(prefix+'-toolbox',x+.69,z-.02,.62,.40,.31,.98,'#886752',{...steel,shape:'beveled'});
  add(prefix+'-drawer',x+1.81,z, .81,.72,.94,0,'#687970',{...steel,shape:'beveled'});
  for(const y of [.23,.45,.69])add(prefix+'-drawer-pull-'+y,x+1.81,z-.385,.42,.075,.042,y,'#a09e89',trim());
  const back=z+Math.sign(z)*.38;
  add(prefix+'-tool-panel',x,back,2.44,.083,.81,.99,'#82725c',{...wood,noCollision:true});
  for(const dx of [-.82,-.33,.25,.78]){
    add(prefix+'-hook-'+dx,x+dx,back-Math.sign(z)*.067,.058,.062,.42,1.23,'#666d61',trim());
    add(prefix+'-wrench-'+dx,x+dx,back-Math.sign(z)*.084,.16,.037,.090,1.58,'#8b8b78',trim());
  }
}

function stockRack(add,x,z){
  for(const dx of [-1.21,1.21])for(const dz of [-.34,.34])
    add('rack-upright-'+dx+'-'+dz,x+dx,z+dz,.083,.09,2.12,0,dark,steel);
  for(const y of [.24,.88,1.55,2.06])
    add('rack-shelf-'+y,x,z,2.51,.76,.077,y,paint,steel);
  for(const [i,y] of [.317,.957,1.627].entries())for(const dx of [-.79,0,.81])
    add('rack-stock-'+i+'-'+dx,x+dx,z,.55,.56,.27+i*.05,y,dx===0?'#7d897a':'#a08866',
      {surface:dx===0?'metal':'wood',shape:'beveled'});
}
