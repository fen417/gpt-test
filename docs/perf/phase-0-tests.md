# P0-2: Node 24 test baseline

Environment: Windows x64, Node v24.22.1. Baseline commit: c13a3d7.

Before: 42/49 passing, 7 failures, 22.93 s. After: 56/56 passing, 25.82 s.
The count increased because the audio file now loads its individual tests and two audio regression checks were added; the old combined bot test was split into autonomous navigation and explicit squad orders.

| Failure | Cause and resolution |
|---|---|
| Audio file import | Removed `ORIGINAL_SCORE` export; tests now check the actual `MENU_MUSIC_TITLE` and streamed menu MP3. Browser audio/media stubs now implement the APIs the game uses. |
| Diagonal movement / walls | Removed factory fixture; select a current ground-level port wall. Speed assertion retained. |
| Bullets / friendly fire | Same obsolete factory fixture; use a current port wall. Damage blocking and ally immunity assertions retained. |
| Medic / support gadget | Obsolete instant heal/ammo behavior. Test actual medkit placement, gradual healing, assault ammo supply and cooldown rejection. Passive regeneration is excluded from the healing interval. |
| Bot capture spread | `nextThink`, `botPath` no longer control current squad AI. Retain autonomous capture check; test formation under a real squad attack order with enemies disabled. |
| Snapshot isolation | Expected old 300-ticket balance; record original tickets before modifying the snapshot and check they remain unchanged. |
| Soldier rig | Canvas stub lacked drawing/pixel APIs and async Image/ImageData. Implement those stubs and await head atlas loading. Keep skinning/animation assertions. |

An actual audio lifecycle bug was exposed: menu → battle → menu while `play()` is pending could leave the menu track paused. A successful pending play now re-evaluates the desired mode and resumes the track. A rejected autoplay request is not retried in a loop.

Added regressions verify that automatic gunfire does not cancel the preceding recording, distance does not queue cosmetic shots, and authority/presentation clocks do not reset sound deduplication. These are API/scheduling tests; they do not establish subjective sound quality or audio-device performance.
