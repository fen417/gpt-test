import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Multiplayer, normalizeRoomCode, sanitizeInput } from '../src/network.js';
import { Simulation } from '../shared/simulation.js';
import { MAP } from '../shared/world.js';

test('room codes accept copied PeerJS IDs and reject invalid destinations', () => {
  assert.equal(normalizeRoomCode(' gpt-test-ab12cd '), 'AB12CD');
  assert.equal(normalizeRoomCode('ABC234'), 'ABC234');
  for (const invalid of ['', 'ABCDE', 'ABCDEFG', '../ABC', 'AB C12', 'https://example.com']) {
    assert.throws(() => normalizeRoomCode(invalid), /6/);
  }
});

test('untrusted controls cannot carry teleportation, non-finite angles or truthy strings', () => {
  const input = sanitizeInput({
    forward: 999, strafe: -999, yaw: Infinity, pitch: NaN,
    fire: 'true', grenade: 1, reload: true, x: 3000, hp: 999,
  });
  assert.equal(input.forward, 1);
  assert.equal(input.strafe, -1);
  assert.equal(input.yaw, 0);
  assert.equal(input.pitch, 0);
  assert.equal(input.fire, false);
  assert.equal(input.grenade, false);
  assert.equal(input.reload, true);
  assert.ok(!('x' in input));
  assert.ok(!('hp' in input));
  assert.deepEqual(sanitizeInput(null), sanitizeInput({}));
});

test('short button presses survive until next network update while movement releases immediately', () => {
  const session = new Multiplayer();
  session._mode = 'peer';
  session.sendInput({ forward: 1, fire: true, grenade: true, yaw: 0.5 });
  session.sendInput({ forward: 0, fire: false, grenade: false, yaw: 0.6 });
  assert.equal(session._nextInput.forward, 0);
  assert.equal(session._nextInput.fire, true);
  assert.equal(session._nextInput.grenade, true);
  assert.equal(session._nextInput.yaw, 0.6);
  session.close();
});

test('host action pulses survive render frames before an authoritative step and release afterwards', () => {
  const session = new Multiplayer();
  session._mode = 'host';
  session._simulation = new Simulation({ bots: 0 });
  session._localId = 'host';
  const player = session._simulation.addPlayer('host', 'Host', 0, 'medic');
  player.hp = 40;
  player.ammo -= 5;
  session.sendInput({ forward: 1, grenade: true, gadget: true, reload: true, jump: true });
  session.sendInput({ forward: 0, grenade: false, gadget: false, reload: false, jump: false });
  session._flushHostInput();
  session._simulation.step(1 / 60);
  assert.equal(player.grenades, 1);
  assert.equal(player.reloading, true);
  assert.ok(player.gadgetTime > 0);
  assert.ok(player.hp > 40);
  assert.ok(player.y > 0);
  assert.equal(player.input.forward, 0);
  session._flushHostInput();
  session._simulation.step(1 / 60);
  assert.equal(player.input.grenade, false);
  assert.equal(player.input.gadget, false);
  assert.equal(player.input.reload, false);
  assert.equal(player.input.jump, false);
  assert.equal(player.grenades, 1);
  session.close();
});

test('host respawn emits authoritative acknowledgement synchronously and clears pending actions', () => {
  let acknowledged;
  const session = new Multiplayer({ onState: state => { acknowledged = state; } });
  session._mode = 'host';
  session._simulation = new Simulation({ bots: 0 });
  session._localId = 'host';
  const player = session._simulation.addPlayer('host', 'Host', 0, 'assault');
  player.alive = false;
  player.hp = 0;
  player.respawnIn = 0;
  session.sendInput({ grenade: true });
  assert.equal(session.respawn('medic'), true);
  assert.equal(acknowledged.players.find(p => p.id === 'host').alive, true);
  assert.equal(acknowledged.players.find(p => p.id === 'host').classId, 'medic');
  assert.equal(session._hostActions.size, 0);
  session.close();
});

test('backgrounded host controls expire and explicit release cannot replay queued actions',()=>{
  const session=new Multiplayer();session._mode='host';session._localId='host';session._simulation=new Simulation({bots:0});
  const player=session._simulation.addPlayer('host','Host',0);session.sendInput({forward:1,fire:true,grenade:true,yaw:.7});
  session._lastHostInput=performance.now()-500;session._flushHostInput();
  assert.equal(player.input.forward,0);assert.equal(player.input.fire,false);assert.equal(player.input.grenade,false);assert.equal(player.input.yaw,.7);
  session.sendInput({forward:1,grenade:true});session.clearInput({yaw:.9});session._flushHostInput();
  assert.equal(player.input.forward,0);assert.equal(player.input.grenade,false);assert.equal(player.input.yaw,.9);session.close();
});

test('peer rooms select chunked binary transport for firefight snapshots larger than the JSON channel limit', async () => {
  const simulation = new Simulation({ bots: 14 });
  simulation.addPlayer('host', 'Host', 0);
  simulation.addPlayer('guest', 'Guest', 1);
  for (let n = 0; n < 100; n++) simulation.event('shot', {
    playerId: 'host', x: 12.123456, y: 1.65, z: 10.123456,
    tx: 50.123456, ty: 1.65, tz: 30.123456, hit: false,
  });
  const largeState = simulation.snapshot();
  assert.ok(new TextEncoder().encode(JSON.stringify({ type: 'snapshot', state: largeState })).byteLength > 16300);
  let options;
  let received;
  const connection = new EventEmitter();
  connection.open = true;
  connection.send = message => {
    if (message.type === 'join') {
      assert.equal(message.protocol,2);
      connection.emit('data', { type: 'welcome', id: 'guest', protocol:2 });
      connection.emit('data', { type: 'snapshot', state: largeState });
    }
  };
  connection.close = () => { connection.open = false; connection.emit('close'); };
  const peer = new EventEmitter();
  peer.connect = (id, selectedOptions) => {
    assert.equal(id, 'gpt-test-abc234');
    options = selectedOptions;
    queueMicrotask(() => connection.emit('open'));
    return connection;
  };
  peer.destroy = () => {};
  const session = new Multiplayer({ onState: state => { received = state; } });
  session._openPeer = async () => { session._peer = peer; return peer; };
  try {
    await session.join({ code: 'ABC234', name: 'Guest' });
    assert.equal(options.serialization, 'binary');
    assert.equal(options.reliable, true);
    assert.equal(received.events.length, largeState.events.length);
    assert.equal(session.mode, 'peer');
  } finally { session.close(); }
});

test('closing a session invalidates asynchronous callbacks and cleans transports', () => {
  const session = new Multiplayer();
  const generation = session._begin('peer');
  const cleaned = [];
  session._connection = { close() { cleaned.push('data'); } };
  session._peer = { destroy() { cleaned.push('peer'); } };
  session._socket = { close() { cleaned.push('socket'); } };
  session._pending.add(reason => cleaned.push(reason));
  session.close('test cancellation');
  assert.equal(session.mode, 'offline');
  assert.equal(session._active(generation), false);
  assert.deepEqual(cleaned, ['test cancellation', 'data', 'peer', 'socket']);
  assert.equal(session._pending.size, 0);
  assert.equal(session._nextInput, null);
  session.close();
});

test('respawn requests support every capture point on the expanded map',()=>{
  const session=new Multiplayer();session._mode='peer';const sent=[];session._send=message=>sent.push(message);
  for(const point of MAP.points)session.respawn('medic',point.id);
  assert.deepEqual(sent.map(message=>message.pointId),MAP.points.map(point=>point.id));
  session.respawn('medic','INVALID');assert.equal(sent.at(-1).pointId,undefined);session.close();
});

test('dedicated transport rejects HTTP and insecure remote servers on an HTTPS page', async () => {
  const session = new Multiplayer();
  await assert.rejects(session.connect({ url: 'https://example.com' }), /ws:\/\//);
  const oldLocation = globalThis.location;
  try {
    globalThis.location = { protocol: 'https:' };
    await assert.rejects(session.connect({ url: 'ws://example.com' }), /wss:\/\//);
    assert.equal(session.mode, 'offline');
  } finally {
    if (oldLocation === undefined) delete globalThis.location;
    else globalThis.location = oldLocation;
  }
});

test('two real WebSocket sessions receive a shared authoritative match and player movement', { timeout: 15000 }, async () => {
  const port = 22000 + Math.floor(Math.random() * 30000);
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), BOTS: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let firstState;
  let secondState;
  let firstId;
  let secondId;
  const first = new Multiplayer({ onState: state => { firstState = state; }, onIdentity: id => { firstId = id; } });
  const second = new Multiplayer({ onState: state => { secondState = state; }, onIdentity: id => { secondId = id; } });
  const waitFor = predicate => new Promise((resolve, reject) => {
    const start = performance.now();
    const poll = setInterval(() => {
      if (predicate()) { clearInterval(poll); resolve(); }
      else if (performance.now() - start > 4000) { clearInterval(poll); reject(new Error('Network condition timed out')); }
    }, 20);
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Test server did not start')), 4000);
      server.stdout.once('data', () => { clearTimeout(timer); resolve(); });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', code => { clearTimeout(timer); reject(new Error(`Test server exited ${code}`)); });
    });
    await first.connect({ url: `ws://127.0.0.1:${port}`, name: 'Net Alpha', classId: 'assault' });
    await second.connect({ url: `ws://127.0.0.1:${port}`, name: 'Net Bravo', classId: 'medic' });
    await waitFor(() => firstState?.players.length === 2 && secondState?.players.length === 2);
    assert.notEqual(firstId, secondId);
    assert.ok(secondState.players.some(player => player.id === firstId && player.name === 'Net Alpha'));
    const before = firstState.players.find(player => player.id === firstId);
    first.sendInput({ forward: 1, yaw: 0, pitch: 0 });
    await waitFor(() => {
      const player = secondState.players.find(p => p.id === firstId);
      return player && Math.hypot(player.x - before.x, player.z - before.z) > 0.3;
    });
    first.close();
    await waitFor(() => secondState.players.length === 1);
    assert.equal(secondState.players[0].id, secondId);
  } finally {
    first.close();
    second.close();
    server.kill();
  }
});
