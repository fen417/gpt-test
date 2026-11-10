import Peer from 'peerjs';
import { Simulation } from '../shared/simulation.js';
import { MAP, PROTOCOL_VERSION } from '../shared/world.js';

const ROOM_PREFIX = 'gpt-test-';
const MAX_HUMANS = 16;
const STEP = 1 / 60;
const CONNECT_TIMEOUT = 18000;
const PULSE_ACTIONS = ['jump', 'fire', 'reload', 'gadget', 'grenade'];
const noOp = () => {};

export function normalizeRoomCode(value) {
  const code = String(value ?? '').trim().replace(/^gpt-test-/i, '').toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Код комнаты должен содержать 6 букв или цифр.');
  return code;
}

export function sanitizeInput(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  const number = (key, min, max) => typeof input[key] === 'number' && Number.isFinite(input[key])
    ? Math.max(min, Math.min(max, input[key])) : 0;
  return {
    forward: number('forward', -1, 1), strafe: number('strafe', -1, 1),
    yaw: number('yaw', -Math.PI * 1000, Math.PI * 1000),
    pitch: number('pitch', -1.5, 1.5),
    sprint: input.sprint === true, crouch: input.crouch === true,
    jump: input.jump === true, fire: input.fire === true, aim: input.aim === true,
    reload: input.reload === true, gadget: input.gadget === true, grenade: input.grenade === true,
  };
}

function playerName(value) {
  return String(value || 'Боец').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) || 'Боец';
}

function playerClass(value) {
  return ['assault', 'medic', 'support', 'recon'].includes(value) ? value : 'assault';
}

function roomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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
  }

  get mode() { return this._mode; }

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
    if (expendable && (connection.bufferSize > 2 || connection.dataChannel?.bufferedAmount > 192000)) return false;
    try { connection.send(message); return true; } catch (error) {
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

  async host({ name = 'Боец', classId = 'assault', bots = 23, difficulty = 'regular' } = {}) {
    const generation = this._begin('host');
    const code = roomCode();
    this.onStatus('Создаём сетевую комнату…');
    try {
      const peer = await this._openPeer(ROOM_PREFIX + code.toLowerCase(), generation);
      if (!this._active(generation)) throw new Error('Подключение отменено.');
      const botCount = Math.max(0, Math.min(31, Math.floor(Number(bots) || 0)));
      const botDifficulty = ['recruit','regular','veteran'].includes(difficulty) ? difficulty : 'regular';
      this._simulation = new Simulation({ bots: botCount, difficulty: botDifficulty });
      this._localId = 'host';
      this._simulation.addPlayer(this._localId, playerName(name), 0, playerClass(classId));
      this.onIdentity(this._localId);
      peer.on('connection', connection => this._acceptGuest(connection, generation));
      let previous = performance.now();
      let accumulator = 0;
      let steps = 0;
      let roundResetAt = 0;
      this._tickTimer = setInterval(() => {
        if (!this._active(generation)) return;
        const now = performance.now();
        accumulator += Math.min((now - previous) / 1000, 0.2);
        previous = now;
        while (accumulator >= STEP) {
          this._flushHostInput();
          for (const guest of this._connections.values()) {
            if (!guest.joined) continue;
            const controls = { ...guest.lastControls };
            if (now - guest.lastInput > 350) Object.assign(controls, { forward: 0, strafe: 0, sprint: false, jump: false, fire: false, reload: false, grenade: false, gadget: false });
            else for (const action of guest.actions) controls[action] = true;
            this._simulation.setInput(guest.id, controls);
            guest.actions.clear();
          }
          this._simulation.step(STEP);
          accumulator -= STEP;
          steps++;
          if (this._simulation.winner !== null) {
            if (!roundResetAt) roundResetAt = now + 12000;
            if (now >= roundResetAt) {
              const humans = this._simulation.snapshot().players.filter(player => !player.bot);
              this._simulation = new Simulation({ bots: botCount, difficulty: botDifficulty });
              for (const player of humans) this._simulation.addPlayer(player.id, player.name, player.team, player.classId);
              roundResetAt = 0;
              this.onStatus(`Комната ${code} · новый раунд`);
            }
          }
          if (steps % 3 === 0) {
            const state = this._simulation.snapshot();
            this.onState(state);
            for (const guest of this._connections.values()) {
              if (guest.joined) this._safeSend(guest.connection, { type: 'snapshot', state }, true);
            }
          }
        }
      }, 1000 / 60);
      this.onState(this._simulation.snapshot());
      this.onStatus(`Комната ${code} · вы — хозяин`);
      return code;
    } catch (error) {
      if (this._active(generation)) this.close();
      throw error;
    }
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
      if (message.type === 'join' && !guest.joined) {
        if (message.protocol !== PROTOCOL_VERSION) {
          this._safeSend(connection,{type:'error',message:'Версии карты различаются. Всем игрокам нужно обновить страницу и создать новую комнату.'});
          this._timeout(()=>connection.close(),150);return;
        }
        guest.joined = true;
        this._clearTimeout(joinTimer);
        this._simulation.addPlayer(guest.id, playerName(message.name), undefined, playerClass(message.classId));
        this._safeSend(connection, { type: 'welcome', id: guest.id, protocol: PROTOCOL_VERSION });
        this._safeSend(connection, { type: 'snapshot', state: this._simulation.snapshot() });
        this.onStatus(`Комната открыта · игроков: ${1 + [...this._connections.values()].filter(g => g.joined).length}`);
      } else if (guest.joined && message.type === 'input') {
        guest.lastInput = performance.now();
        guest.lastControls = sanitizeInput(message.input);
        for (const action of PULSE_ACTIONS) if (guest.lastControls[action]) guest.actions.add(action);
      } else if (guest.joined && message.type === 'respawn') {
        if (this._simulation.respawn(guest.id, playerClass(message.classId), MAP.points.some(p=>p.id===message.pointId) ? message.pointId : undefined)) {
          const state = this._simulation.snapshot();
          const player = state.players.find(p => p.id === guest.id);
          guest.lastControls = sanitizeInput({ yaw: player?.yaw, pitch: player?.pitch });
          guest.actions.clear();
          this._safeSend(connection, { type: 'snapshot', state });
        }
      }
    });
    const remove = () => {
      this._clearTimeout(joinTimer);
      if (this._connections.get(connection.peer) !== guest) return;
      this._connections.delete(connection.peer);
      if (this._active(generation) && guest.joined) this._simulation.removePlayer(guest.id);
    };
    connection.on('close', remove);
    connection.on('error', error => {
      if (this._active(generation)) this._diagnose('guest-channel-error', connection, error);
      remove();
      connection.close();
    });
  }

  async join({ code, name = 'Боец', classId = 'assault' } = {}) {
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
      await new Promise((resolve, reject) => {
        let welcomed = false;
        let settled = false;
        const cancel = reason => finish(new Error(reason || 'Подключение отменено.'));
        const timer = this._timeout(() => {
          this._diagnose('host-handshake-timeout', connection);
          finish(new Error('Не удалось подключиться к хозяину комнаты. Проверьте код; сеть может блокировать WebRTC. Попробуйте другую сеть или выделенный сервер.'));
        }, CONNECT_TIMEOUT);
        const finish = error => {
          if (settled) return;
          settled = true;
          this._clearTimeout(timer);
          this._pending.delete(cancel);
          if (error) reject(error); else resolve();
        };
        this._pending.add(cancel);
        connection.on('open', () => this._safeSend(connection, { type: 'join', name: playerName(name), classId: playerClass(classId), protocol: PROTOCOL_VERSION }));
        connection.on('data', message => {
          if (!this._active(generation) || !message || typeof message !== 'object') return;
          if (message.type === 'welcome' && typeof message.id === 'string') {
            if(message.protocol!==PROTOCOL_VERSION){finish(new Error('У хозяина старая версия карты. Обновите страницы и создайте новую комнату.'));return;}
            welcomed = true;
            this._localId = message.id;
            this.onIdentity(message.id);
            this.onStatus(`В комнате ${normalizedCode}`);
            finish();
          } else if (message.type === 'snapshot' && welcomed && this._isSnapshot(message.state)) {
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

  async connect({ url, name = 'Боец', classId = 'assault' } = {}) {
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
        socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'join', name: playerName(name), classId: playerClass(classId), protocol: PROTOCOL_VERSION })));
        socket.addEventListener('message', event => {
          if (!this._active(generation) || typeof event.data !== 'string' || event.data.length > 2000000) return;
          let message;
          try { message = JSON.parse(event.data); } catch { return; }
          if (!message || typeof message !== 'object') return;
          if (message.type === 'welcome' && typeof message.id === 'string') {
            if(message.protocol!==PROTOCOL_VERSION){finish(new Error('Сервер использует старую версию карты. Обновите сервер до версии 0.2.'));return;}
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
    return state && Array.isArray(state.players) && Array.isArray(state.points) && Array.isArray(state.tickets);
  }

  _startInputPump(generation) {
    this._inputTimer = setInterval(() => {
      if (!this._active(generation) || !this._nextInput) return;
      const input = this._nextInput;
      this._nextInput = null;
      this._send({ type: 'input', input });
    }, 1000 / 30);
  }

  _send(message) {
    if (this._mode === 'peer') return this._safeSend(this._connection, message);
    if (this._mode === 'server' && this._socket?.readyState === WebSocket.OPEN && this._socket.bufferedAmount < 192000) {
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
    const input = stale ? sanitizeInput({yaw:this._hostControls.yaw,pitch:this._hostControls.pitch}) : { ...this._hostControls };
    if(!stale)for (const action of this._hostActions) input[action] = true;
    this._hostActions.clear();
    this._simulation.setInput(this._localId, input);
  }

  clearInput({yaw=0,pitch=0}={}) {
    const input=sanitizeInput({yaw,pitch});this._nextInput=null;this._hostControls=input;this._hostActions.clear();this._lastHostInput=performance.now();
    if(this._mode==='host'&&this._simulation)this._simulation.setInput(this._localId,input);
    else this._send({type:'input',input});
  }

  respawn(classId = 'assault', pointId) {
    const selectedClass = playerClass(classId);
    const selectedPoint = MAP.points.some(p=>p.id===pointId) ? pointId : undefined;
    if (this._mode === 'host' && this._simulation) {
      const accepted = this._simulation.respawn(this._localId, selectedClass, selectedPoint);
      if (accepted) {
        const state = this._simulation.snapshot();
        const player = state.players.find(p => p.id === this._localId);
        this._hostControls = sanitizeInput({ yaw: player?.yaw, pitch: player?.pitch });
        this._hostActions.clear();
        this.onState(state);
      }
      return accepted;
    }
    return this._send({ type: 'respawn', classId: selectedClass, pointId: selectedPoint });
  }

  close(reason) {
    const wasHost = this._mode === 'host';
    this._mode = 'offline';
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
