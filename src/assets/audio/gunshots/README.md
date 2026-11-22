# Weapon reports

## Curated recordings

Selected from [Modern Military Weapons Sound Pack v0.2](https://hamsunqiu.itch.io/modern-military-weapons-sound-pack-38-wav-cc0), curated by hamsunqiu. The following recordings are [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

| Files / weapons | Source author and recording | Curated file |
| --- | --- | --- |
| rifle-light, smg / AR-416, MCX-9 | [SuperPhat, Automatic Assault Rifle](https://freesound.org/people/SuperPhat/sounds/416417/) | ar_full_near_01.wav |
| rifle-heavy / AK-12M | [serøutōnin--deprivəd, AK variant 1](https://freesound.org/people/ser%C3%B8ut%C5%8Dnin--depriv%C9%99d/sounds/855841/), [variant 2](https://freesound.org/people/ser%C3%B8ut%C5%8Dnin--depriv%C9%99d/sounds/855842/) | ar_single_near_01/02.wav |
| smg-suppressed / VK-45 | [Clutvh, silenced pistol shot](https://freesound.org/people/Clutvh/sounds/627087/) | pi_hand_single_near_03.wav |
| pistol / P-19 | [serøutōnin--deprivəd, Glock reports](https://freesound.org/people/ser%C3%B8ut%C5%8Dnin--depriv%C9%99d/sounds/855652/) | pi_rev_single_near_04.wav |
| pistol-heavy / M-50 | [LeMudCrab, Pistol Shot](https://freesound.org/people/LeMudCrab/sounds/163456/) | pi_hand_single_near_01.wav |

`node scripts/prepare-gunshot-assets.mjs <curated-directory>` cuts and levels these recordings. `npm run assets:audio` encodes the masters as Opus with an AAC fallback.

## Recordings supplied by the project owner

- MG-36, PKP and vehicle-mounted machine guns use two single shots cut from `art-source/audio/gunshots/machinegun.ogg`. Regenerate with `node scripts/trim-machinegun-audio.mjs` and FFmpeg on PATH.
- DMR-12 and SV-98M use the separate [user-supplied recordings](../../../../art-source/audio/gunshots/USER-RECORDINGS.md). Regenerate with `node scripts/prepare-sniper-audio.mjs`.

The active user-supplied recordings have their own provenance, separate from the CC0 pack.
