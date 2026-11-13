import Peer from 'peerjs';
import { Simulation, sanitizeInput, sanitizeSpawnPoint } from '../shared/simulation.js';
import { DEFAULT_MAP_ID, getMap, PROTOCOL_VERSION, MAP_LAYOUT_REVISION, getPrimaryWeapon, getSidearm } from '../shared/world.js';
import { packSnapshot, unpackSnapshot } from '../shared/snapshot-codec.js';

const ROOM_PREFIX = 'gpt-test-';
const MAX_HUMANS = 16;
const STEP = 1 / 60;
const CONNECT_TIMEOUT = 18000;
const PULSE_ACTIONS = ['jump', 'fire', 'reload', 'gadget', 'secondaryGadget', 'grenade', 'interact', 'switchSeat', 'horn', 'orderAttack', 'orderDefend', 'orderFollow'];
const noOp = () => {};

export function normalizeRoomCode(value) {
  const code = String(value ?? '').trim().replace(/^gpt-test-/i, '');
  if (!/^\d{6}$/.test(code)) throw new Error('Код комнаты должен содержать 6 цифр.');
  return code;
}

export { sanitizeInput };

function playerName(value) {
  return String(value || 'Боец').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || 'Боец';
}

function playerClass(value) {
  return ['assault', 'medic', 'support', 'recon'].includes(value) ? value : 'assault';
}

function playerWeapon(classId, weaponId) {
  return getPrimaryWeapon(playerClass(classId), weaponId).id;
}

function roomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const alphabet = '0123456789';
  return Array.from(bytes, n => alphabet[n % alphabet.length]).join('');
}

function peerMessage(error) {
  const type = error?.type;
  if (type === 'unavailable-id') return 'Этот код комнаты уже занят. Создайте комнату ещё раз.';
  if (type === 'peer-unavailable') return 'Комната не найдена. Проверьте код и убедитесь, что хозяин оставил игру открытой.';
  if (type === 'browser-incompatible') return 'Браузер не поддерживает WebRTC. Откройте игру в актуальном Chrome, Edge или Firefox.';
  if (type === 'webrtc') return 'Не удалось установить прямое соединение. Ваша сеть может блокировать WebRTC; попробуйте другую сеть или выделенный сервер.';
  return 'Сетевая связь недоступна. Проверьте интернет и доступ к PeerJS; можно подключиться к выделенному серверу.';
}

/**
 * Peer rooms run the same authoritative Simulation as the dedicated server.
 * PeerJS Cloud is used only to introduce browsers. A room disappears with its host.
 */
export class Multiplayer {
  constructor({ onState = noOp, onStatus = noOp, onIdentity = noOp, onError = noOp } = {}) {
    this.onState = onState;
    this.onStatus = onStatus;
    this.onIdentity = onIdentity;
    this.onError = onError;
    this._mode = 'offline';
    this._generation = 0;
    this._pending = new Set();
    this._timeouts = new Set();
    this._connections = new Map();
    this._peer = null;
    this._socket = null;
    this._connection = null;
    this._simulation = null;
    this._tickTimer = null;
    this._inputTimer = null;
    this._nextInput = null;
    this._hostControls = sanitizeInput();
    this._hostActions = new Set();
    this._lastHostInput = 0;
    this._localId = null;
    this._phase = 'battle';
    this._roomCode = '';
    this._botCount = 23;
    this._mapId = DEFAULT_MAP_ID;
    this._remoteMapId = DEFAULT_MAP_ID;
    this._difficulty = 'regular';
    this._wireCache = new WeakMap();
  }

  get mode() { return this._mode; }
  get phase() { return this._phase; }
  get roomCode() { return this._roomCode; }

  _buildSnapshot() {
    if (!this._simulation) return null;
    const state = this._simulation.snapshot();
    state.lobby = this._phase === 'lobby';
    state.roomCode = this._roomCode;
    state.hostId = 'host';
    state.botCount = this._botCount;
    state.difficulty = this._difficulty;
    return state;
  }

  _broadcastSnapshot(expendable = false) {
    const state = this._buildSnapshot();
    if (!state) return null;
    this.onState(state);
    for (const guest of this._connections.values()) {
      if (guest.joined) this._safeSend(guest.connection, { type: 'snapshot', state }, expendable);
    }
    return state;
  }

  _timeout(fn, milliseconds) {
    const timer = setTimeout(() => { this._timeouts.delete(timer); fn(); }, milliseconds);
    this._timeouts.add(timer);
    return timer;
  }

  _clearTimeout(timer) {
    clearTimeout(timer);
    this._timeouts.delete(timer);
  }

  _begin(mode) {
    this.close();
    this._mode = mode;
    return this._generation;
  }

  _active(generation) { return generation === this._generation && this._mode !== 'offline'; }

  _fail(message, generation) {
    if (!this._active(generation)) return;
    this.close(message);
    this.onError(message);
    this.onStatus(message);
  }

  _safeSend(connection, message, expendable = false) {
    if (!connection?.open) return false;
    if ((expendable || message.type === 'input') && (connection.bufferSize > 0 || connection.dataChannel?.bufferedAmount > 32768)) return false;
    let cursor;
    if (message.type === 'snapshot') {
      const state = message.state;
      const after = state.time < (connection._stateTime ?? -1) ? 0 : (connection._eventCursor || 0);
      let cache = this._wireCache.get(state);
      if (!cache) { cache = new Map(); this._wireCache.set(state, cache); }
      // Serialize once for all peers at the same event cursor. PeerJS binary
      // then only frames this string instead of traversing the state per peer.
      if (!cache.has(after)) cache.set(after, JSON.stringify({ type: 'snapshot', state: packSnapshot(state, after) }));
      message = cache.get(after);
      cursor = { time: state.time, event: Math.max(after, state.events?.at(-1)?.id || 0) };
    }
    try {
      connection.send(message);
      if (cursor) { connection._stateTime = cursor.time; connection._eventCursor = cursor.event; }
      return true;
    } catch (error) {
      this._diagnose('send-failed', connection, error);
      return false;
    }
  }

  _diagnose(stage, connection, error) {
    console.warn('[SECTOR 09 network]', stage, {
      mode: this._mode,
      peer: connection?.peer,
      open: connection?.open,
      serialization: connection?.serialization,
      channel: connection?.dataChannel?.readyState,
      ice: connection?.peerConnection?.iceConnectionState,
      type: error?.type,
      message: error?.message,
    });
  }

  _openPeer(id, generation) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const peer = id ? new Peer(id, { secure: true, debug: 0 }) : new Peer({ secure: true, debug: 0 });
      this._peer = peer;
      const cancel = reason => finish(new Error(reason || 'Подключение отменено.'));
      const timer = this._timeout(() => finish(new Error('Сервер поиска комнат не отвечает. Проверьте интернет или используйте выделенный сервер.')), CONNECT_TIMEOUT);
      const finish = (error) => {
        if (settled) return;
        settled = true;
        this._clearTimeout(timer);
        this._pending.delete(cancel);
        if (error) reject(error); else resolve(peer);
      };
      this._pending.add(cancel);
      peer.on('open', () => {
        if (!this._active(generation)) return finish(new Error('Подключение отменено.'));
        finish();
      });
      peer.on('error', error => {
        if (!this._active(generation)) return;
        this._diagnose('peer-error', this._connection, error);
        if (!settled) finish(new Error(peerMessage(error)));
        else if (this._mode === 'host' && ['peer-unavailable', 'webrtc'].includes(error?.type)) {
          // An individual guest failing must not destroy the host's running match.
          this.onStatus('Один из игроков не смог установить прямое соединение. Матч продолжается.');
        } else if (['network', 'server-error', 'socket-error', 'socket-closed', 'disconnected', 'webrtc', 'peer-unavailable'].includes(error?.type)
          && (this._mode === 'host' || this._connection?.open)) {
          // Signaling-server hiccups must not kick players out of a live match.
          this.onStatus('Связь с поиском комнат нестабильна. Матч продолжается.');
          this._timeout(() => {
            if (this._active(generation) && !peer.destroyed && peer.disconnected) {
              try { peer.reconnect(); } catch { /* Data channels remain usable. */ }
            }
          }, 2000);
        } else this._fail(peerMessage(error), generation);
      });
      peer.on('disconnected', () => {
        if (!this._active(generation)) return;
        this.onStatus('Связь с поиском комнат потеряна. Уже подключённые игроки могут продолжать матч.');
        this._timeout(() => {
          if (this._active(generation) && !peer.destroyed && peer.disconnected) {
            try { peer.reconnect(); } catch { /* Active data channels remain usable. */ }
          }
        }, 2000);
      });
    });
  }

  async host({ name = 'Боец', classId = 'assault', weaponId, sidearmId, bots = 23, difficulty = 'regular', mapId, lobby = false } = {}) {
    const generation = this._begin('host');
    const code = roomCode();
    this._roomCode = code;
    this._phase = lobby ? 'lobby' : 'battle';
    this.onStatus('Создаём сетевую комнату…');
    try {
      const peer = await this._openPeer(ROOM_PREFIX + code.toLowerCase(), generation);
      if (!this._active(generation)) throw new Error('Подключение отменено.');
      this._botCount = Math.max(0, Math.min(31, Math.floor(Number(bots) || 0)));
      this._difficulty = ['recruit','regular','veteran'].includes(difficulty) ? difficulty : 'regular';
      this._mapId = getMap(mapId).id;
      this._simulation = new Simulation({ bots: this._botCount, difficulty: this._difficulty, mapId: this._mapId, debugBots:new URLSearchParams(location.search).has('aiDebug') });
      this._localId = 'host';
      const cls = playerClass(classId);
      this._simulation.addPlayer(this._localId, playerName(name), 0, cls, playerWeapon(cls, weaponId), sidearmId);
      this.onIdentity(this._localId);
      peer.on('connection', connection => this._acceptGuest(connection, generation));
      let previous = performance.now();
      let accumulator = 0;
      let steps = 0;
      let roundResetAt = 0;
      this._tickTimer = setInterval(() => {
        if (!this._active(generation)) return;
        const now = performance.now();
        // Discard excessive debt: a busy render frame must not cause a spiral
        // of simulation work and several obsolete snapshots in the same turn.
        accumulator = Math.min(accumulator + (now - previous) / 1000, STEP * 3);
        previous = now;
        let broadcast = false;
        while (accumulator >= STEP) {
          accumulator -= STEP;
          steps++;
          if (this._phase === 'lobby') {
            if (steps % 15 === 0) broadcast = true;
            continue;
          }
          this._flushHostInput();
          for (const guest of this._connections.values()) {
            if (!guest.joined) continue;
            const controls = { ...guest.lastControls, interact: false, switchSeat: false, horn: false, orderAttack: false, orderDefend: false, orderFollow: false };
            if (now - guest.lastInput > 350) Object.assign(controls, { forward: 0, strafe: 0, sprint: false, jump: false, fire: false, reload: false, grenade: false, gadget: false, secondaryGadget: false });
            else for (const action of guest.actions) controls[action] = true;
            this._simulation.setInput(guest.id, controls);
            guest.actions.clear();
          }
          this._simulation.step(STEP);
          if (this._simulation.winner !== null) {
            if (!roundResetAt) roundResetAt = now + 12000;
            if (now >= roundResetAt) {
              const humans = this._simulation.snapshot().players.filter(player => !player.bot);
              this._simulation = new Simulation({ bots: this._botCount, difficulty: this._difficulty, mapId: this._mapId, debugBots:new URLSearchParams(location.search).has('aiDebug') });
              for (const player of humans) this._simulation.addPlayer(player.id, player.name, player.team, player.classId, player.primaryWeaponId, player.sidearmId);
              roundResetAt = 0;
              this.onStatus(`Комната ${code} · новый раунд`);
            }
          }
          if (steps % 3 === 0) {
            broadcast = true;
          }
        }
        if (broadcast) this._broadcastSnapshot(true);
      }, 1000 / 60);
      this._broadcastSnapshot();
      this.onStatus(lobby ? `Лобби ${code} · ожидание игроков` : `Комната ${code} · вы — хозяин`);
      return code;
    } catch (error) {
      if (this._active(generation)) this.close();
      throw error;
    }
  }

  _applyPlayerLoadout(id, { classId, weaponId, sidearmId, team } = {}) {
    if (!this._simulation) return false;
    const player = this._simulation.players.get(id);
    if (!player) return false;
    const nextClass = classId !== undefined ? playerClass(classId) : player.classId;
    const nextWeapon = playerWeapon(nextClass, weaponId ?? player.primaryWeaponId);
    const teamChanged = (team === 0 || team === 1) && player.team !== team;
    if (team === 0 || team === 1) player.team = team;
    player.classId = nextClass;
    player.primaryWeaponId = nextWeapon;
    player.sidearmId = getSidearm(sidearmId ?? player.sidearmId).id;
    if (teamChanged || this._phase === 'lobby') {
      player.alive = false;
      player.respawnIn = 0;
      this._simulation.respawn(id, nextClass, undefined, nextWeapon, player.sidearmId);
      if (teamChanged) this._simulation.balanceTeams?.();
    }
    return true;
  }

  setLobbyLoadout({ classId, weaponId, sidearmId, team } = {}) {
    if (this._mode === 'host' && this._simulation) {
      if (this._applyPlayerLoadout(this._localId, { classId, weaponId, sidearmId, team })) {
        this._broadcastSnapshot();
        return true;
      }
      return false;
    }
    if (this._mode === 'peer') {
      const nextClass = classId !== undefined ? playerClass(classId) : undefined;
      return this._send({
        type: 'lobbyLoadout',
        classId: nextClass,
        weaponId: weaponId !== undefined ? playerWeapon(nextClass || 'assault', weaponId) : undefined,
        sidearmId: sidearmId === undefined ? undefined : getSidearm(sidearmId).id,
        team: (team === 0 || team === 1) ? team : undefined,
      });
    }
    return false;
  }

  updateLobbySettings({ bots, difficulty, mapId } = {}) {
    if (this._mode !== 'host' || !this._simulation || this._phase !== 'lobby') return false;
    if (bots !== undefined) this._botCount = Math.max(0, Math.min(31, Math.floor(Number(bots) || 0)));
    if (difficulty !== undefined && ['recruit','regular','veteran'].includes(difficulty)) this._difficulty = difficulty;
    if (mapId !== undefined) this._mapId = getMap(mapId).id;
    const humans = this._simulation.snapshot().players.filter(player => !player.bot);
    this._simulation = new Simulation({ bots: this._botCount, difficulty: this._difficulty, mapId: this._mapId, debugBots:new URLSearchParams(location.search).has('aiDebug') });
    for (const player of humans) {
      this._simulation.addPlayer(player.id, player.name, player.team, player.classId, player.primaryWeaponId, player.sidearmId);
    }
    this._broadcastSnapshot();
    return true;
  }

  startMatch({ bots, difficulty, mapId } = {}) {
    if (this._mode !== 'host' || !this._simulation) return false;
    if (bots !== undefined) this._botCount = Math.max(0, Math.min(31, Math.floor(Number(bots) || 0)));
    if (difficulty !== undefined && ['recruit','regular','veteran'].includes(difficulty)) this._difficulty = difficulty;
    if (mapId !== undefined) this._mapId = getMap(mapId).id;
    const humans = this._simulation.snapshot().players.filter(player => !player.bot);
    this._simulation = new Simulation({ bots: this._botCount, difficulty: this._difficulty, mapId: this._mapId, debugBots:new URLSearchParams(location.search).has('aiDebug') });
    for (const player of humans) {
      this._simulation.addPlayer(player.id, player.name, player.team, player.classId, player.primaryWeaponId, player.sidearmId);
    }
    const hostPlayer = this._simulation.players.get(this._localId);
    this._hostControls = sanitizeInput({ yaw: hostPlayer?.yaw ?? 0, pitch: hostPlayer?.pitch ?? 0 });
    this._hostActions.clear();
    for (const guest of this._connections.values()) {
      if (!guest.joined) continue;
      const gp = this._simulation.players.get(guest.id);
      guest.lastControls = sanitizeInput({ yaw: gp?.yaw ?? 0, pitch: gp?.pitch ?? 0 });
      guest.actions.clear();
    }
    this._phase = 'battle';
    this._broadcastSnapshot();
    this.onStatus(`Комната ${this._roomCode} · бой начался`);
    return true;
  }

  _acceptGuest(connection, generation) {
    if (!this._active(generation) || this._connections.size >= MAX_HUMANS - 1 || this._connections.has(connection.peer)) {
      connection.on('open', () => {
        this._safeSend(connection, { type: 'error', message: 'Комната заполнена (максимум 16 игроков).' });
        setTimeout(() => connection.close(), 150);
      });
      return;
    }
    const guest = { connection, id: `peer-${connection.peer}`, joined: false, count: 0, second: 0, lastInput: 0, lastControls: {}, actions: new Set() };
    this._connections.set(connection.peer, guest);
    const joinTimer = this._timeout(() => {
      if (!guest.joined) {
        this._diagnose('guest-handshake-timeout', connection);
        connection.close();
      }
    }, CONNECT_TIMEOUT);
    connection.on('data', message => {
      if (!this._active(generation) || !message || typeof message !== 'object') return;
      const second = Math.floor(performance.now() / 1000);
      if (second !== guest.second) { guest.second = second; guest.count = 0; }
      if (++guest.count > 120) { connection.close(); return; }
      if (message.type === 'join') {
        if (message.protocol !== PROTOCOL_VERSION || (message.layout ?? '') !== MAP_LAYOUT_REVISION) {
          this._safeSend(connection,{type:'error',message:'Версии карты различаются. Всем игрокам нужно обновить страницу и создать новую комнату.'});
          this._timeout(()=>connection.close(),150);return;
        }
        if (!guest.joined) {
          guest.joined = true;
          this._clearTimeout(joinTimer);
          const cls = playerClass(message.classId);
          const added = this._simulation.addPlayer(guest.id, playerName(message.name), undefined, cls, playerWeapon(cls, message.weaponId), message.sidearmId);
          guest.lastControls = sanitizeInput({ yaw: added?.yaw ?? 0, pitch: added?.pitch ?? 0 });
        }
        this._safeSend(connection, { type: 'welcome', id: guest.id, protocol: PROTOCOL_VERSION, layout: MAP_LAYOUT_REVISION, lobby: this._phase === 'lobby' });
        this._broadcastSnapshot();
        this.onStatus(`Комната открыта · игроков: ${1 + [...this._connections.values()].filter(g => g.joined).length}`);
      } else if (guest.joined && message.type === 'lobbyLoadout') {
        if (this._applyPlayerLoadout(guest.id, { classId: message.classId, weaponId: message.weaponId, sidearmId: message.sidearmId, team: message.team })) {
          const gp = this._simulation.players.get(guest.id);
          guest.lastControls = sanitizeInput({ yaw: gp?.yaw ?? 0, pitch: gp?.pitch ?? 0 });
          this._broadcastSnapshot();
        }
      } else if (guest.joined && message.type === 'input') {
        guest.lastInput = performance.now();
        guest.lastControls = sanitizeInput(message.input);
        for (const action of PULSE_ACTIONS) if (guest.lastControls[action]) guest.actions.add(action);
      } else if (guest.joined && message.type === 'respawn') {
        const cls = playerClass(message.classId);
        if (this._simulation.respawn(guest.id, cls, sanitizeSpawnPoint(this._simulation.map,message.pointId), message.weaponId, message.sidearmId)) {
          const state = this._buildSnapshot();
          const player = state.players.find(p => p.id === guest.id);
          guest.lastControls = sanitizeInput({ yaw: player?.yaw, pitch: player?.pitch });
          guest.actions.clear();
          this.onState(state);
          for (const g of this._connections.values()) {
            if (g.joined) this._safeSend(g.connection, { type: 'snapshot', state });
          }
        }
      }
    });
    const remove = () => {
      this._clearTimeout(joinTimer);
      if (this._connections.get(connection.peer) !== guest) return;
      this._connections.delete(connection.peer);
      if (this._active(generation) && guest.joined) {
        this._simulation.removePlayer(guest.id);
        if (this._phase === 'lobby') this._broadcastSnapshot();
      }
    };
    connection.on('close', remove);
    connection.on('error', error => {
      if (this._active(generation)) this._diagnose('guest-channel-error', connection, error);
      remove();
      connection.close();
    });
  }

  async join({ code, name = 'Боец', classId = 'assault', weaponId, sidearmId } = {}) {
    const normalizedCode = normalizeRoomCode(code);
    const generation = this._begin('peer');
    this.onStatus(`Подключаемся к комнате ${normalizedCode}…`);
    try {
      const peer = await this._openPeer(undefined, generation);
      if (!this._active(generation)) throw new Error('Подключение отменено.');
      // Guests cannot receive arbitrary incoming channels.
      peer.on('connection', connection => connection.close());
      // PeerJS JSON channels reject packets >= 16.3 KB. Combat snapshots exceed
      // that during sustained firefights; the binary serializer chunks them.
      const connection = peer.connect(ROOM_PREFIX + normalizedCode.toLowerCase(), { serialization: 'binary', reliable: true });
      this._connection = connection;
      this._roomCode = normalizedCode;
      const cls = playerClass(classId);
      const wep = playerWeapon(cls, weaponId);
      await new Promise((resolve, reject) => {
        let welcomed = false;
        let settled = false;
      const sendJoin = () => this._safeSend(connection, { type: 'join', name: playerName(name), classId: cls, weaponId: wep, sidearmId:getSidearm(sidearmId).id, protocol: PROTOCOL_VERSION, layout: MAP_LAYOUT_REVISION });
        const retryTimer = setInterval(() => {
          if (!settled && !welcomed && connection.open) sendJoin();
        }, 800);
        const cancel = reason => finish(new Error(reason || 'Подключение отменено.'));
        const timer = this._timeout(() => {
          this._diagnose('host-handshake-timeout', connection);
          finish(new Error('Не удалось подключиться к хозяину комнаты. Проверьте код; сеть может блокировать WebRTC. Попробуйте другую сеть или выделенный сервер.'));
        }, CONNECT_TIMEOUT);
        const finish = error => {
          if (settled) return;
          settled = true;
          clearInterval(retryTimer);
          this._clearTimeout(timer);
          this._pending.delete(cancel);
          if (error) reject(error); else resolve();
        };
        this._pending.add(cancel);
        connection.on('open', sendJoin);
        connection.on('data', message => {
          if (typeof message === 'string') {
            if (message.length > 512000) return;
            try { message = JSON.parse(message); } catch { return; }
          }
          if (!this._active(generation) || !message || typeof message !== 'object') return;
          if (message.type === 'snapshot') message.state = unpackSnapshot(message.state);
          if (message.type === 'welcome' && typeof message.id === 'string') {
            if(message.protocol!==PROTOCOL_VERSION||(message.layout??'')!==MAP_LAYOUT_REVISION){finish(new Error('Версии карты различаются. Обновите страницы и создайте новую комнату.'));return;}
            welcomed = true;
            this._localId = message.id;
            this._phase = message.lobby ? 'lobby' : 'battle';
            this.onIdentity(message.id);
            this.onStatus(`В комнате ${normalizedCode}`);
            finish();
          } else if (message.type === 'snapshot' && welcomed && this._isSnapshot(message.state)) {
            this._phase = message.state.lobby ? 'lobby' : 'battle';
            this.onState(message.state);
          } else if (message.type === 'error' || message.type === 'shutdown') {
            const text = typeof message.message === 'string' ? message.message.slice(0, 300) : 'Хозяин завершил матч.';
            if (!settled) finish(new Error(text)); else this._fail(text, generation);
          }
        });
        connection.on('close', () => {
          if (this._active(generation)) this._diagnose('host-channel-closed', connection);
          const text = 'Связь с хозяином комнаты потеряна. Хозяин должен держать вкладку игры открытой.';
          if (!settled) finish(new Error(text)); else this._fail(text, generation);
        });
        connection.on('error', error => {
          if (this._active(generation)) this._diagnose('host-channel-error', connection, error);
          if (!settled) finish(new Error(peerMessage(error))); else this._fail(peerMessage(error), generation);
        });
      });
      if (!this._active(generation)) throw new Error('Подключение отменено.');
      this._startInputPump(generation);
    } catch (error) {
      if (this._active(generation)) this.close();
      throw error;
    }
  }

  async connect({ url, name = 'Боец', classId = 'assault', weaponId, sidearmId } = {}) {
    let address;
    try { address = new URL(url); } catch { throw new Error('Введите адрес сервера вида wss://example.com или ws://localhost:8080.'); }
    if (!['ws:', 'wss:'].includes(address.protocol)) throw new Error('Адрес сервера должен начинаться с ws:// или wss://.');
    if (globalThis.location?.protocol === 'https:' && address.protocol === 'ws:' && !['localhost', '127.0.0.1', '[::1]'].includes(address.hostname)) {
      throw new Error('Для игры через HTTPS используйте защищённый сервер wss://.');
    }
    const generation = this._begin('server');
    this.onStatus('Подключаемся к выделенному серверу…');
    try {
      const socket = new WebSocket(address.href);
      this._socket = socket;
      await new Promise((resolve, reject) => {
        let settled = false;
        let welcomed = false;
        const cancel = reason => finish(new Error(reason || 'Подключение отменено.'));
        const timer = this._timeout(() => finish(new Error('Выделенный сервер не отвечает. Проверьте адрес и доступность сервера.')), CONNECT_TIMEOUT);
        const finish = error => {
          if (settled) return;
          settled = true;
          this._clearTimeout(timer);
          this._pending.delete(cancel);
          if (error) reject(error); else resolve();
        };
        this._pending.add(cancel);
        socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'join', name: playerName(name), classId: playerClass(classId), weaponId: playerWeapon(classId,weaponId), sidearmId:getSidearm(sidearmId).id, protocol: PROTOCOL_VERSION, layout: MAP_LAYOUT_REVISION })));
        socket.addEventListener('message', event => {
          if (!this._active(generation) || typeof event.data !== 'string' || event.data.length > 2000000) return;
          let message;
          try { message = JSON.parse(event.data); } catch { return; }
          if (!message || typeof message !== 'object') return;
          if (message.type === 'snapshot') message.state = unpackSnapshot(message.state);
          if (message.type === 'welcome' && typeof message.id === 'string') {
            if(message.protocol!==PROTOCOL_VERSION||(message.layout??'')!==MAP_LAYOUT_REVISION){finish(new Error('Версии карты различаются. Обновите сервер и клиент до одной версии.'));return;}
            welcomed = true;
            this._localId = message.id;
            this.onIdentity(message.id);
            this.onStatus('Выделенный сервер · подключено');
            finish();
          } else if (message.type === 'snapshot' && welcomed && this._isSnapshot(message.state)) this.onState(message.state);
          else if (message.type === 'error') {
            const text = typeof message.message === 'string' ? message.message.slice(0, 300) : 'Сервер отклонил подключение.';
            if (!settled) finish(new Error(text)); else this._fail(text, generation);
          }
        });
        socket.addEventListener('error', () => {
          const text = 'Не удалось подключиться к серверу. Проверьте адрес, сертификат HTTPS и настройки сети.';
          if (!settled) finish(new Error(text)); else this._fail(text, generation);
        });
        socket.addEventListener('close', () => {
          const text = 'Соединение с выделенным сервером закрыто.';
          if (!settled) finish(new Error(text)); else this._fail(text, generation);
        });
      });
      if (!this._active(generation)) throw new Error('Подключение отменено.');
      this._startInputPump(generation);
    } catch (error) {
      if (this._active(generation)) this.close();
      throw error;
    }
  }

  _isSnapshot(state) {
    if (!state || !Array.isArray(state.players) || !Array.isArray(state.points) || !Array.isArray(state.tickets)) return false;
    this._remoteMapId = getMap(state.mapId).id;
    return true;
  }

  _startInputPump(generation) {
    this._inputTimer = setInterval(() => {
      if (!this._active(generation) || !this._nextInput) return;
      const input = this._nextInput;
      if (this._send({ type: 'input', input })) this._nextInput = null;
    }, 1000 / 30);
  }

  _send(message) {
    if (this._mode === 'peer') return this._safeSend(this._connection, message);
    if (this._mode === 'server' && this._socket?.readyState === WebSocket.OPEN && this._socket.bufferedAmount < 32768) {
      this._socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  sendInput(rawInput) {
    const input = sanitizeInput(rawInput);
    if (this._mode === 'host' && this._simulation) {
      this._hostControls = input;
      this._lastHostInput = performance.now();
      for (const action of PULSE_ACTIONS) if (input[action]) this._hostActions.add(action);
      return;
    }
    if (!['peer', 'server'].includes(this._mode)) return;
    // Keep single-frame action presses until the next network update.
    if (this._nextInput) {
      for (const action of PULSE_ACTIONS) input[action] ||= this._nextInput[action];
    }
    this._nextInput = input;
  }

  _flushHostInput() {
    if (!this._simulation || !this._localId) return;
    const stale = performance.now()-this._lastHostInput>350;
    const input = stale ? sanitizeInput({yaw:this._hostControls.yaw,pitch:this._hostControls.pitch}) : { ...this._hostControls, interact: false, switchSeat: false, horn: false, orderAttack: false, orderDefend: false, orderFollow: false };
    if(!stale)for (const action of this._hostActions) input[action] = true;
    this._hostActions.clear();
    this._simulation.setInput(this._localId, input);
  }

  clearInput({yaw=0,pitch=0}={}) {
    const input=sanitizeInput({yaw,pitch});this._nextInput=null;this._hostControls=input;this._hostActions.clear();this._lastHostInput=performance.now();
    if(this._mode==='host'&&this._simulation)this._simulation.setInput(this._localId,input);
    else this._send({type:'input',input});
  }

  respawn(classId = 'assault', pointId, weaponId, sidearmId) {
    const selectedClass = playerClass(classId);
    const selectedWeapon = weaponId === undefined ? undefined : playerWeapon(selectedClass, weaponId);
    const selectedSidearm = sidearmId === undefined ? undefined : getSidearm(sidearmId).id;
    const selectedPoint = sanitizeSpawnPoint(this._simulation?.map??getMap(this._remoteMapId),pointId);
    if (this._mode === 'host' && this._simulation) {
      const accepted = this._simulation.respawn(this._localId, selectedClass, selectedPoint, selectedWeapon, selectedSidearm);
      if (accepted) {
        const state = this._buildSnapshot();
        const player = state.players.find(p => p.id === this._localId);
        this._hostControls = sanitizeInput({ yaw: player?.yaw, pitch: player?.pitch });
        this._hostActions.clear();
        this.onState(state);
        for (const guest of this._connections.values()) {
          if (guest.joined) this._safeSend(guest.connection, { type: 'snapshot', state });
        }
      }
      return accepted;
    }
    return this._send({ type: 'respawn', classId: selectedClass, pointId: selectedPoint, weaponId: selectedWeapon, sidearmId:selectedSidearm });
  }

  close(reason) {
    const wasHost = this._mode === 'host';
    this._mode = 'offline';
    this._phase = 'battle';
    this._roomCode = '';
    this._generation++;
    clearInterval(this._tickTimer);
    clearInterval(this._inputTimer);
    this._tickTimer = this._inputTimer = null;
    for (const cancel of [...this._pending]) cancel(reason);
    this._pending.clear();
    for (const timer of this._timeouts) clearTimeout(timer);
    this._timeouts.clear();
    for (const { connection } of this._connections.values()) {
      if (wasHost) this._safeSend(connection, { type: 'shutdown', message: 'Хозяин завершил матч.' });
      try { connection.close(); } catch { /* Already closed. */ }
    }
    this._connections.clear();
    try { this._connection?.close(); } catch { /* Already closed. */ }
    try { this._peer?.destroy(); } catch { /* Already destroyed. */ }
    try { this._socket?.close(); } catch { /* Already closed. */ }
    this._connection = this._peer = this._socket = this._simulation = null;
    this._nextInput = this._localId = null;
    this._hostControls = sanitizeInput();
    this._hostActions.clear();
  }
}
