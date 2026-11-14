# Binary protocol 26

All integers use little-endian byte order. Dynamic packets are `Uint8Array`/`ArrayBuffer`, encoded with bounds-checked `DataView`. WebSocket compression is disabled. Maximum client payload: 8192 bytes. JSON is reserved for control messages; each client control carries protocol + map layout revision.

| ID | Direction | Contents |
|---:|---|---|
| 1 SNAPSHOT | server → client | flags, sequence u32, acknowledged baseline u32, time f32, processed input u32, tick u32, tickets u16×2, winner i8, max tickets/duration u16, dictionary definitions, entity deltas |
| 2 EVENTS | server → client | dictionary definitions, delivered-through event u32, count u16, events |
| 3 INPUT | client → server | round epoch u32, snapshot ACK u32, event ACK u32, dictionary ACK u16, viewed server time f32, interpolation ms u8, frame count u8, command frames |
| 4 ACK | client → server | round epoch u32, snapshot u32, event u32, dictionary u16 |
| 5 PING | client → server | monotonic client timestamp f64 |
| 6 PONG | server → client | echoed timestamp f64 |
| 7 RESYNC | client → server | no body; next snapshot is full |

Old-round commands and ACKs are ignored using the epoch, preventing late input from corrupting a freshly initialized round.

Input frame: sequence u32, elapsed microseconds u16, forward/strafe i8, yaw/pitch i16, flags u16, weapon/tool slots packed in u8. Commands are flushed at up to 60 Hz; delayed frames are batched (maximum eight). The server bounds command duration and grants movement time using its own clock; it never accepts client position/HP/damage. Queues and sequence gaps are bounded.

Dictionary entries: count u16, then (ID u16, UTF-8 byte length u16, bytes). ID 0 is null; stable string IDs replace player names, weapon IDs, entity IDs and event labels. Unacknowledged entries are repeated; confirmation is a contiguous received dictionary watermark. A reconnect/round initialization resets both dictionaries.

Entity collections in fixed order: players, vehicles, deployables, grenades, rockets, points. Each has update count u16. Update: entity dictionary ID u16, operation u8 (0 remove, 1 patch). Patch: fixed-size bit mask determined by `SCHEMAS[kind]`, then values for set bits only. See `shared/snapshot-codec.js` for the authoritative field/type order. Missing or unchanged fields are inherited from the acknowledged baseline. No structural object serialization or JSON snapshot path remains.

The encoder stores 96 sent states per connection, the decoder 96 received states. Delta bases are **acknowledged decoded snapshots**, not merely sent packets. Every five seconds and on missing baseline a full packet resets entity state. Dictionaries retain their independent IDs throughout the round. ACK references absent from the server history cannot become a base. Sequence/dictionary/event watermarks are validated; reconnect starts from full authoritative state.

Coordinates x/z for players/vehicles/points/deployables use u16 over map bounds plus a 32 m margin, giving resolution `(map.size + 64) / 65535` metres. Height is signed16 at 1/128 m. Yaw/pitch use signed16 over ±π. Velocity uses signed16 at 1/16 m/s. Flags pack alive/reloading/crouch/slide/sprint/aim/grounded/bot/protection/spotted. Health is whole units; server HP retains its original precision. Projectile/impact coordinates use float32. Simulation coordinates, raycasts, weapon ballistics and hitboxes are unchanged.

Cooldowns, reloads, respawn and equipment gestures are represented as absolute simulation end times. They are materialized into the existing client API locally. Private velocity/jump/slide prediction state is sent only for the owning player. Static map geometry/textures are not part of the protocol.

`motionAt` timestamps are updated on motion and the final stopping sample. An unchanged stationary entity does not produce timestamp-only traffic. Every entity has its own bounded interpolation history. All player and vehicle poses are eligible for every configured snapshot (up to 30 Hz by default), without a second per-entity movement deadline. Client histories include stationary confirmations at the snapshot timestamp, avoiding interpolation across a long stationary gap. Dynamic distant grenades/rockets are omitted, with own projectiles and scoped relevance retained. All players remain available to the roster, score table, map and game UI.

Events have numeric type, event ID u32, simulation time f32, presence mask and typed values. There are 23 event types; see `EVENT_TYPES`/`EVENT_KEYS`. Shot, impact, damage, kill, reload, equip, gadget, spawn, vehicle, capture and round events preserve the existing gameplay/render API. They are delivered separately on simulation ticks, not delayed to the next snapshot. Client event ACK advances through the filtered authoritative stream; duplicate events are ignored. Personal scores/damage are routed to relevant players; distant cosmetic effects are culled. Critical events remain in the bounded server log until ACK or resynchronization by reconnect; an expired baseline is never silently accepted.

Before snapshot encoding, bufferedAmount over 8 KiB skips an obsolete optional snapshot. Event sending pauses over 8 KiB while events remain in the log. A queue above 256 KiB or congestion longer than five seconds causes reconnect instead of unbounded latency. Slow clients cannot block the room. The dictionary and snapshot history are per connection; prepared quantized world rows are shared across recipients for each snapshot cadence.

JSON control types also have numeric wire IDs: hello=16, rooms=17, list=18, create=19, join=20, resume=21, welcome=22, lobby=23, settings=24, loadout=25, start=26, init=27, respawn=28, leave=29, left=30, error=31, stats=32, squad=33. Human-readable names are used only inside code. Room listing is pushed only when room composition/settings/match status change. Requests use requestId. A requested lobby loadout/team change is acknowledged with loadout + requestId + confirmed team; invalid phases/teams return an error. Legacy fire-and-forget class/weapon controls remain supported. An opaque internal room ID is selected by clicking the listing, never typed as a join code. Resume tokens are random 192-bit secrets stored per tab, sent only over the same secure connection, and never included in public room lists/metrics.

Metrics count actual transmitted application bytes plus WS framing, and include every recipient. They exclude TCP/TLS/IP overhead. No bandwidth/FPS claim follows from the format alone: measure the real room on the actual Northflank resource.

Client presentation uses a monotonic shared playback clock, with a slowly adapted 40–140 ms buffer (approximately 43 ms at steady 30 Hz, 60 ms at 20 Hz). RTT is measured separately and is not added again to the playback buffer. Per-entity histories share that clock; bounded entity extrapolation lasts at most 120 ms (the shared playback clock is capped at 80 ms beyond the latest snapshot). Multiple snapshots received before a frame are all decoded for delta baselines, but only the latest authority is replayed. Event sent/ACK cursors are separate: reliable WebSocket delivery does not resend in-flight events when new shots arrive. Old cosmetic shot/impact/horn events may be omitted after 500 ms; damage, kills and match outcomes remain reliable.

Protocol 24 adds public player squadId/squadLeader fields and deployable squadId. The squad control request changes the authenticated player's squad during a match; the server checks team membership and the four-person capacity before accepting it. Client and server must be updated together.

Protocol 25 adds the contextual order input flag, player orderKind/orderPointId, reviveSeq, jumpFatigue and jumpCooldownAt. Local movement prediction shares jump fatigue/cooldown with authority. Motion updates use 20 Hz at all distances; projectile events and sound follow presentation time.

Protocol 26 adds private bloom/shot-ready/last-shot state for cosmetic firearm replay and fire-held bit 3 in the owning control flags. Local personal firearm prediction shares cadence and deterministic spread with authority; no client damage or hit result is accepted. Shot confirmations suppress already-played cosmetics by weapon and shot sequence.

Input presentation metadata is bounded against a snapshot actually sent to the session. The server records a 24-frame pose history (approximately 400 ms at 60 Hz), rewinds target player/vehicle poses by at most 200 ms for projectile collision, and keeps static geometry/current damage authority. Teleport/revive/team/seat discontinuities are not interpolated. Set LAG_COMPENSATION=0 to disable rewind. The selected view time already accounts for the client's interpolation; server code does not blindly add RTT a second time.

Default maximum snapshot frequency is 30 Hz (SNAPSHOT_HZ accepts 10–30). A five-second mean simulation step above 4 ms lowers it to 20 Hz; below 3 ms permits recovery. Stats report the effective frequency. Prediction queue overflow asks for RESYNC, clears obsolete input and receives an immediate full snapshot instead of closing the WebSocket. The socket uses TCP_NODELAY.
