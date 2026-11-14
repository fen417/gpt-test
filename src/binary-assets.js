export async function fetchBinary(url){
  const response=await fetch(url);if(!response.ok)throw Error(`Не удалось загрузить ресурс: ${response.status}`);
  const buffer=await response.arrayBuffer(),bytes=new Uint8Array(buffer);
  if(bytes[0]!==31||bytes[1]!==139)return buffer; // Servers may already decompress.
  if(globalThis.DecompressionStream)return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const {gunzipSync}=await import('fflate');return gunzipSync(bytes).buffer;
}
