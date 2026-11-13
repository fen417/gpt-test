# Bot and vehicle behaviour in 0.13

The authoritative simulation runs this logic in solo play, the browser host,
and the dedicated server. Clients send controls, never target coordinates or
bone poses. Protocol 22 adds horn and squad-order input pulses; all peers must
update together. No extra per-bot messages are sent during ordinary play.

## Controls

- H: driver horn, recruit friendly bots within 26 metres into vacant seats.
- B: order the player's squad to attack the objective closest to the view direction.
- N: defend the nearest objective.
- J: follow the player. Orders expire after 75 seconds or can be replaced.

Controls can be rebound. A horn order holds riders for at least eight seconds
before disembarkation at a different objective. Leaving the driver seat ends
the ride order. Away from objectives, one rider takes the wheel and waits three
seconds. If the player interacts during that pause, the bot yields the driver
seat when another seat is available. Otherwise it continues driving.

## Source ownership

- `shared/bot-ai.js`: finite observations, uncertain sound/radio memory, target
  priority, squad assignments, tactical decisions, cover/peek/recovery, weapon
  profiles, danger response, suppression and spawn preference.
- `shared/bot-navigation.js`: lazy ground cells, explicit stair/floor layers,
  weighted A*, smoothing, slope/clearance checks, nearby-agent avoidance,
  cover candidates, stuck-area penalties, movement steering.
- `shared/gadgets.js`: actual ability validation, placement, healing, revive
  reservations, repair approach and safe opportunity checks.
- `shared/vehicle-ai.js`: seat bookings, horn riders, pickup handover, driving,
  safe drop-off selection, damage response, repair stops and crew firing.
- `shared/vehicle-combat.js`: shared local-space armour and crew hit volumes,
  separate glass panes, transforms respecting vehicle yaw, tilt and scale.
- `src/vehicles.js`: vehicle geometry and replicated broken glass display.
- `src/renderer.js`, `src/soldier.js`: the same detailed skinned soldier rigs
  seated in the vehicle, preserving class/team materials, LODs and weapon aim;
  seated hands reach controls and legs use the existing two-bone solver.

## Decision and information rules

Vision samples are staggered at approximately 4–8 Hz depending on difficulty;
motor/aim control uses simulation dt. Tactical choices run approximately 3–5 Hz,
squad assignments about once per 1.3 seconds. Two path requests per simulation
tick are allowed, with a bounded number of A* expansions and cached static
edges. Dynamic vehicles are checked separately, not baked into static edges.

Bots only lead targets using velocity estimated from consecutive observations.
Sounds have uncertain positions; squad contact reports are delayed and expire.
Lost sight does not reveal the enemy's new position. Last-known positions
expire after eight seconds. Cover candidates and elevated navigation nodes come
from the map geometry, not enemy locations. New maps/edit layouts create a new
simulation and rebuild navigation caches.

Low health, nearby projectiles and visible grenades can override ordinary
tasks. Utility work is interrupted by immediate danger; active short placement
gestures keep their authoritative lifecycle. Overlapping medical kits do not
stack their rate. Revives reserve casualties briefly to avoid simultaneous
medics pursuing the same person. Fire checks both yaw and pitch and avoids
known friendly bodies. Machine gunners can briefly cover a last-seen opening.

Squads contain a human and up to three bots, or up to four bots. Team objective
scoring considers ownership, known contacts, contested points, existing squad
assignments, travel distance and continuity. Personal roles are class-aware;
hunters pursue observed/shared contacts rather than hidden player positions.

## Vehicle projectiles

Movement still uses the original solid footprint. Projectile armour follows
the lower hull, hood, doors, pillars, roof and rotating gun shield. Glass is
transparent to the first projectile, which breaks that pane and continues to
the actual body/armour behind it. The glass bitmask is in ordinary vehicle
snapshots, so late joiners also see missing panes. Crew hit volumes match the
seated head, torso and legs, including tilt and nonuniform model scale.

## Diagnostics and verification limits

Open the game with `?aiDebug=1` in solo mode or on the browser host to display
each bot's current task, role, goal, cover, visible target and memory age.
On a dedicated server, set `AI_DEBUG=1` and use the same client query parameter.
Diagnostics are absent from ordinary snapshots unless enabled on the host.

This patch is reviewed statically and built without running automated tests
or gameplay/performance benchmarks, as requested. There is no measured FPS or
claim of verified human-like play. Tactical timing, navigation clearance and
32-player performance still need observation in actual matches.
