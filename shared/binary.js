const encoder=new TextEncoder(),decoder=new TextDecoder();
export class Writer{
  constructor(size=2048){this.bytes=new Uint8Array(size);this.view=new DataView(this.bytes.buffer);this.offset=0;}
  need(n){if(this.offset+n<=this.bytes.length)return;const next=new Uint8Array(Math.max(this.bytes.length*2,this.offset+n));next.set(this.bytes);this.bytes=next;this.view=new DataView(next.buffer);}
  u8(v){this.need(1);this.view.setUint8(this.offset,v);this.offset++;}
  i8(v){this.need(1);this.view.setInt8(this.offset,v);this.offset++;}
  u16(v){this.need(2);this.view.setUint16(this.offset,v,true);this.offset+=2;}
  i16(v){this.need(2);this.view.setInt16(this.offset,v,true);this.offset+=2;}
  u32(v){this.need(4);this.view.setUint32(this.offset,v,true);this.offset+=4;}
  f32(v){this.need(4);this.view.setFloat32(this.offset,v,true);this.offset+=4;}
  f64(v){this.need(8);this.view.setFloat64(this.offset,v,true);this.offset+=8;}
  raw(bytes){this.need(bytes.length);this.bytes.set(bytes,this.offset);this.offset+=bytes.length;}
  text(value){const bytes=encoder.encode(value);if(bytes.length>2048)throw Error('String too long');this.u16(bytes.length);this.raw(bytes);}
  finish(){return this.bytes.slice(0,this.offset);}
}
export class Reader{
  constructor(value){this.bytes=value instanceof ArrayBuffer?new Uint8Array(value):new Uint8Array(value.buffer,value.byteOffset,value.byteLength);this.view=new DataView(this.bytes.buffer,this.bytes.byteOffset,this.bytes.byteLength);this.offset=0;}
  need(n){if(this.offset+n>this.bytes.length)throw Error('Truncated packet');}
  u8(){this.need(1);return this.view.getUint8(this.offset++);}
  i8(){this.need(1);return this.view.getInt8(this.offset++);}
  u16(){this.need(2);const n=this.view.getUint16(this.offset,true);this.offset+=2;return n;}
  i16(){this.need(2);const n=this.view.getInt16(this.offset,true);this.offset+=2;return n;}
  u32(){this.need(4);const n=this.view.getUint32(this.offset,true);this.offset+=4;return n;}
  f32(){this.need(4);const n=this.view.getFloat32(this.offset,true);this.offset+=4;if(!Number.isFinite(n))throw Error('Invalid float');return n;}
  f64(){this.need(8);const n=this.view.getFloat64(this.offset,true);this.offset+=8;if(!Number.isFinite(n))throw Error('Invalid float');return n;}
  text(){const n=this.u16();if(n>2048)throw Error('String too long');this.need(n);const value=decoder.decode(this.bytes.subarray(this.offset,this.offset+n));this.offset+=n;return value;}
  done(){if(this.offset!==this.bytes.length)throw Error('Trailing packet data');}
}
