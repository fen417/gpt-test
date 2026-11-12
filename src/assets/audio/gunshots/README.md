# Weapon reports

Selected from [Modern Military Weapons Sound Pack v0.2](https://hamsunqiu.itch.io/modern-military-weapons-sound-pack-38-wav-cc0), curated by hamsunqiu. All selected material is [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

| Files / weapons | Source author and recording | Curated file / report positions |
| --- | --- | --- |
| rifle-light, smg / AR-416, MCX-9 | [SuperPhat, Automatic Assault Rifle](https://freesound.org/people/SuperPhat/sounds/416417/) | ar_full_near_01.wav, reports at 4.74 and 7.265 s |
| rifle-heavy / AK-12M | [seroutonin//deprived, AK variant 1](https://freesound.org/people/ser%C3%B8ut%C5%8Dnin--depriv%C9%99d/sounds/855841/), [variant 2](https://freesound.org/people/ser%C3%B8ut%C5%8Dnin--depriv%C9%99d/sounds/855842/) | ar_single_near_01/02.wav |
| lmg / MG-36, Pecheneg, vehicle turret | [sidohzen, M16 bursts](https://freesound.org/people/sidohzen/sounds/165809/) | mg_single_near_01.wav, reports near 2.06 and 4.0 s |
| smg-suppressed / VK-45 | [Clutvh, silenced pistol shot](https://freesound.org/people/Clutvh/sounds/627087/) | pi_hand_single_near_03.wav |
| marksman, sniper / DMR-12, SV-98 | [LilMati, Sniper Rifle Instant Kill Shots 02](https://freesound.org/people/LilMati/sounds/524738/), [01](https://freesound.org/people/LilMati/sounds/524739/) | sr_single_near_01/02.wav, first and second reports |
| pistol / P-19 | [seroutonin//deprived, Glock reports](https://freesound.org/people/ser%C3%B8ut%C5%8Dnin--depriv%C9%99d/sounds/855652/) | pi_rev_single_near_04.wav, first and second reports |
| pistol-heavy / M-50 | [LeMudCrab, Pistol Shot](https://freesound.org/people/LeMudCrab/sounds/163456/) | pi_hand_single_near_01.wav, two envelope variants |

The game uses stereo PCM16 WAV at 44.1 kHz. Processing preserves the source stereo image, trims reports, removes DC, balances the initial report's RMS with peak headroom, and applies short edge fades. No saturation, hard clipping or peak reconstruction is applied. Weapon profiles adapt playback speed and level; the suppressed weapon has its own recording.

The M16-derived machine-gun reports end at 0.28 seconds, before unrelated broadband noise in the source recording. Their final 70 ms fade smoothly to silence.

To reproduce the assets after extracting the pack outside the repository:

```powershell
node scripts/prepare-gunshot-assets.mjs C:/path/to/extracted/curated
```

The source archive and unused recordings are not shipped with the game.
