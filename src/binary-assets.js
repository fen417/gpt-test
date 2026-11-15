const RETRYABLE_HTTP_STATUSES=new Set([408,425,429,500,502,503,504]);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Static hosting and CDNs can return transient 503 errors while Pages is
// deploying. Retry temporary failures, bypassing any cached error response.
export async function fetchBinary(url,{attempts=4,retryDelayMs=300}={}){
  let response;
  for(let attempt=0;attempt<attempts;attempt++){
    try{
      response=await fetch(url,attempt?{cache:'reload'}:undefined);
    }catch(error){
      if(attempt===attempts-1)throw error;
      await pause(retryDelayMs*2**attempt);
      continue;
    }
    if(response.ok)break;
    if(!RETRYABLE_HTTP_STATUSES.has(response.status)||attempt===attempts-1)
      throw Error(`Не удалось загрузить ресурс: ${response.status}`);
    await pause(retryDelayMs*2**attempt);
  }
  const buffer=await response.arrayBuffer(),bytes=new Uint8Array(buffer);
  if(bytes[0]!==31||bytes[1]!==139)return buffer; // Some servers already decompress.
  if(globalThis.DecompressionStream)
    return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const {gunzipSync}=await import('fflate');
  return gunzipSync(bytes).buffer;
}
