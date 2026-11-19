# fy_pool_day / Team Deathmatch — implementation status

This branch is **experimental**. It is not a pixel-, brush- or BSP-exact port
of the original Counter-Strike 1.6 map and must not be described as one.

## References and provenance
- Original overview: https://gamebanana.com/mods/40270
- Screenshot references: https://wargamelite.com/maps/counter-strike-1.6/fy_pool_day
- Additional screenshots: https://cs16forge.com/maps/fy/fy_pool_day/
- Original BSP geometry **not imported or reverse-engineered**. Neither reuse
  of original BSP nor redistribution of original textures has been licensed.
- The geometry in `shared/pool-day.js` was manually authored from reference
  images; `src/pool-day-visuals.js` creates new materials and tile meshes.
- Pool depths, room dimensions, and pickups are **approximations**.
  They have **not been measured against GoldSrc brushes**.

## Implemented (requires further playtesting)
- Standalone `fy_pool_day` map definition with a large and a small recessed
  pool, red/blue areas, walls, water surface and basic pool ladders.
- TDM with server-side team kill counts and configurable kill target.
- Separate empty weapon inventory on spawn and 3-second automatic respawn.
- Server-authoritative auto pickups for primary/secondary slots and drop
  pulse on G; no grenade action or class gadgets while TDM runs.
- Ground and dropped weapon lifecycle, magazine/reserve retention, timed
  respawns, dropped-item cleanup, atomic pickups.
- Shared simulation used by solo worker and Node server.
- Snapshot representation for world weapon items and their IDs; existing
  client rendering reuses actual infantry weapon mesh assets.
- Bot weapon search via existing navigation.
- Focused tests plus optional headless browser startup/overview CI.

## Not implemented / not validated
- **Exact BSP brush geometry, measured heights, portals, spawn coordinates,
  architecture, tiling, lockers, shower/toilet details, diving platforms,
  signage, and original weapon locations.** The map does not meet the user's
  explicit original-map fidelity requirement.
- Real swimming/buoyancy/underwater movement comparable to GoldSrc.
- Accurate physically constrained dropped-weapon rigid bodies (current
  approach uses lightweight world collision and gravity).
- Explicit interact-to-replace occupied weapon slot.
- Optimal multiplayer item delta compression / sustained networking load.
- Bots seeking *better* weapons when already armed; avoidance of every
  room/water edge is not proven.
- Extensive multi-client race/latency/reconnect testing.
- FPS performance validation on Intel HD Graphics 610.
- In-game screenshots from **matching original camera positions**;
  top-down review capture is automated but must be compared manually.
- Licensing confirmation for original CS 1.6 asset redistribution.
- Reliable water stepping and exits and complete third-person unarmed poses
  remain to be inspected visually.

## Testing
Run focused tests: `node --test test/pool-tdm.test.js`
Run build: `npm run build`
Open GitHub Actions `Verify Pool Day TDM branch` to see the actual status
and screenshot artifacts. CI success is *not* proof that the map is a faithful
reproduction or gameplay is production-ready.

Do not merge into `main` or release without resolving the outstanding
fidelity, runtime and performance issues.
