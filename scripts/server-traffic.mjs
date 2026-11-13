// A single read of server counters, not a load generator.
const [address,active='60',runtime='720']=process.argv.slice(2);
if(!address){console.error('Usage: node scripts/server-traffic.mjs https://your-service.code.run [activeHours=60] [runtimeHours=720]');process.exit(1);}
const activeHours=Number(active),runtimeHours=Number(runtime);
if(!Number.isFinite(activeHours)||!Number.isFinite(runtimeHours)||activeHours<0||runtimeHours<0||activeHours>runtimeHours)throw Error('Invalid monthly hours');
const url=new URL('/metrics',address),headers=process.env.METRICS_TOKEN?{Authorization:'Bearer '+process.env.METRICS_TOKEN}:{};
const response=await fetch(url,{headers,signal:AbortSignal.timeout(10000)});
if(!response.ok)throw Error('Metrics returned HTTP '+response.status+'; set METRICS_TOKEN in your environment.');
const stats=await response.json(),bps=stats.bytesPerSecond??0,egressGB=bps*activeHours*3600/1e9,compute=runtimeHours*.01667;
console.log(JSON.stringify({room:stats.room,bytesPerSecond:bps,megabitsPerSecond:+(bps*8/1e6).toFixed(3),totalBytes:stats.totalBytes,averageSnapshotBytes:stats.averageSnapshotBytes,
  messagesPerSecond:stats.messagesPerSecond,tickAverageMs:stats.tickAverageMs,tickMaximumMs:stats.tickMaximumMs,cpuCorePercent:stats.cpuCorePercent,rssBytes:stats.rssBytes,players:stats.players,
  measured:{uptimeSeconds:stats.uptimeSeconds,egressGB:+(stats.totalBytes/1e9).toFixed(6),egressUSD:+(stats.totalBytes/1e9*.06).toFixed(6),runtimeUSD:+(stats.uptimeSeconds/3600*.01667).toFixed(6)},
  projection:{activeHours,runtimeHours,egressGB:+egressGB.toFixed(3),computeUSD:+compute.toFixed(2),egressUSD:+(egressGB*.06).toFixed(2),totalUSD:+(compute+egressGB*.06).toFixed(2)},
  note:'Estimate uses the last 5-second traffic window. Excludes TLS/TCP/IP, retries, builds and other platform charges. Northflank Billing is authoritative.'},null,2));
