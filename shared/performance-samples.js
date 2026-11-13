export class PerformanceSamples {
  constructor(capacity=300){this.values=new Float32Array(capacity);this.count=0;this.cursor=0;}
  add(value){this.values[this.cursor++%this.values.length]=value;this.count=Math.min(this.count+1,this.values.length);}
  summary(){
    if(!this.count)return {p95:0,p99:0,max:0,over50:0,over100:0};
    const sorted=Array.from(this.values.subarray(0,this.count)).sort((a,b)=>a-b);
    const round=v=>Math.round(v*100)/100;
    return {p95:round(sorted[Math.ceil(this.count*.95)-1]),p99:round(sorted[Math.ceil(this.count*.99)-1]),max:round(sorted.at(-1)),over50:sorted.filter(v=>v>50).length,over100:sorted.filter(v=>v>100).length};
  }
}
