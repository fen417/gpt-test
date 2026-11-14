import {timingSafeEqual} from 'node:crypto';

// A loopback peer can be an Internet-facing reverse proxy. Never infer trust
// from its address alone; local access without a token requires explicit opt-in.
export function canReadMetrics(req,env){
  const expected=String(env.METRICS_TOKEN??'');
  if(expected){
    const authorization=String(req.headers.authorization??'');
    if(!authorization.startsWith('Bearer '))return false;
    const a=Buffer.from(expected),b=Buffer.from(authorization.slice(7));
    return a.length===b.length&&timingSafeEqual(a,b);
  }
  if(env.METRICS_ALLOW_LOCAL!=='1')return false;
  if(['forwarded','x-forwarded-for','x-real-ip'].some(name=>req.headers[name]!==undefined))return false;
  return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
}
