import {BLACK_HAWK,BLACK_HAWK_GUN,vehiclePartPose} from '../vehicles.js';

export const M03_EXTRACTION={boardingShot:8.2,wingShot:13.4,departureShot:17.5,fadeAt:24.5,end:26};

// Open ground past the east end of the village. The rotors have room to
// clear each other and the houses while both groups board from the right.
const landingZones=[{x:237,z:-15},{x:251,z:13}];
const arrivalYaw=Math.PI/2;
const progress=(time,start,duration)=>Math.max(0,Math.min(1,(time-start)/duration));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);

export class Mission3Extraction{
  constructor(sim,infantry){
    this.sim=sim;
    this.at=sim.time;
    this.flights=landingZones.map(({x,z},index)=>{
      const id=`m03-extraction-${index+1}`;
      const pad={x,z,yaw:arrivalYaw};
      const aircraft=sim.createMapVehicle({id,type:BLACK_HAWK,team:0,...pad,noRespawn:true});
      pad.y=aircraft.y;
      const pilot=sim.addPlayer(`${id}-pilot`,'Пилот',0,'assault','ar416','p19',true);
      this.seat(pilot,aircraft,0);
      sim.vehicles.push(aircraft);
      const landAt=8+index*.85;
      const passengers=infantry.filter((_,i)=>i%landingZones.length===index).map((actor,row)=>{
        const start={x:x-7.4-(row%2)*1.5,z:z-6-(row>>1)*1.6};
        const foot=vehiclePartPose(aircraft,2.05,0,.35);
        const step=vehiclePartPose(aircraft,1.53,1.04,.35);
        const cabin=vehiclePartPose(aircraft,.95,1.5,.35);
        const walk=Math.hypot(start.x-foot.x,start.z-foot.z)/3.65;
        const boardAt=landAt+.45+row*.71;
        if(actor.vehicleId)sim.dismountVehicle(actor,true);
        Object.assign(actor,{prone:false,crouching:false,grounded:true,vy:0,reloading:false,reloadTime:0,
          moveSpeed:0,input:{...actor.input,aim:false,sprint:false,fire:false}});
        return {actor,start,foot,step,cabin,walk,boardAt,seat:row<2?row+3:null,boarded:false};
      });
      return {aircraft,pilot,pad,landAt,departAt:M03_EXTRACTION.departureShot+index*.95,passengers};
    });
    this.update();
  }
  get elapsed(){return this.sim.time-this.at;}
  seat(actor,aircraft,seat){
    aircraft.seats[seat]=actor.id;
    Object.assign(actor,{vehicleId:aircraft.id,vehicleSeat:seat,crouching:false,yaw:aircraft.yaw,pitch:0});
    this.sim.syncVehicleSeat(actor,aircraft);
  }
  update(){
    const t=this.elapsed,sim=this.sim;
    for(const {aircraft,pilot,pad,landAt,departAt,passengers} of this.flights){
      const arrival=progress(t,0,landAt),remaining=1-arrival;
      const liftoff=smooth(progress(t,departAt,3.5));
      const departure=progress(t,departAt+1.25,7.25);
      Object.assign(aircraft,{
        x:pad.x+145*remaining**2+150*departure**2,
        y:pad.y+47*(1-smooth(arrival))+7*liftoff+51*smooth(departure),
        z:pad.z-19*remaining**2+17*departure**2,
        yaw:arrivalYaw+.13*remaining-Math.PI*smooth(progress(t,departAt+.35,2.65)),
        bodyPitch:-.13*Math.sin(Math.PI*arrival)+.16*Math.sin(Math.PI*departure),
        bodyRoll:-.16*Math.sin(Math.PI*liftoff),
        speed:290*remaining/landAt+300*departure/7.25,
      });
      aircraft.aimYaw=aircraft.yaw+BLACK_HAWK_GUN.restYaw;
      this.seat(pilot,aircraft,0);
      for(const passenger of passengers){
        const {actor,start,foot,step,cabin,walk,boardAt,seat}=passenger;
        if(!passenger.boarded&&t>=boardAt+walk+1.05){
          passenger.boarded=true;
          if(seat===null)actor.inExtractionCabin=true;
        }
        if(passenger.boarded){
          if(seat!==null)this.seat(actor,aircraft,seat);
          else Object.assign(actor,{x:aircraft.x,y:aircraft.y+1.5,z:aircraft.z,moveSpeed:0});
          continue;
        }
        const walking=progress(t,boardAt,walk),climbing=progress(t,boardAt+walk,1.05);
        const onStep=climbing>.54;
        const from=climbing>0?(onStep?step:foot):start;
        const to=climbing>0?(onStep?cabin:step):foot;
        const phase=climbing>0?smooth(onStep?(climbing-.54)/.46:climbing/.54):walking;
        const x=mix(from.x,to.x,phase),z=mix(from.z,to.z,phase),ground=sim.groundAt(x,z);
        const speed=climbing>0?1.3:walking>0?3.65:0;
        Object.assign(actor,{x,y:climbing>0?mix(onStep?step.y:ground,to.y,phase):ground,z,
          yaw:Math.atan2(from.x-to.x,from.z-to.z),pitch:0,crouching:climbing>0,grounded:climbing===0,
          moveSpeed:speed,velocityX:0,velocityZ:0});
      }
    }
  }
}
