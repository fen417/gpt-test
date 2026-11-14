import test from 'node:test';
import assert from 'node:assert/strict';
import {canReadMetrics} from '../server/metrics-access.js';
const request=(address,headers={})=>({headers,socket:{remoteAddress:address}});
test('metrics require explicit credentials behind a proxy and ignore spoofed local addresses',()=>{
  assert.equal(canReadMetrics(request('127.0.0.1'),{}),false);
  assert.equal(canReadMetrics(request('203.0.113.1',{'x-forwarded-for':'127.0.0.1'}),{}),false);
  const local={METRICS_ALLOW_LOCAL:'1'};
  assert.equal(canReadMetrics(request('::1'),local),true);
  assert.equal(canReadMetrics(request('::1',{'x-forwarded-for':'203.0.113.1'}),local),false);
  assert.equal(canReadMetrics(request('203.0.113.1'),local),false);
  const protectedEnv={METRICS_TOKEN:'private-value',...local};
  assert.equal(canReadMetrics(request('::1'),protectedEnv),false);
  assert.equal(canReadMetrics(request('203.0.113.1',{authorization:'Bearer wrong'}),protectedEnv),false);
  assert.equal(canReadMetrics(request('203.0.113.1',{authorization:'Bearer private-value'}),protectedEnv),true);
});
