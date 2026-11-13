# Movement and explosion audio

## Footsteps

Fantozzi, [Fantozzi's Footsteps — Grass/Sand and Stone](https://opengameart.org/content/fantozzis-footsteps-grasssand-stone), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

The twelve bundled Ogg files are the original sliced recordings. Playback alternates feet and takes, matches travelled distance, and changes gain with stance and listener distance. Decoded buffers receive peak normalization and edge fades.

## Engine

Iwan Gabovitch (qubodup), [Car Engine Loop 96 kHz, 4 s](https://opengameart.org/content/car-engine-loop-96khz-4s), used under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

The normalized WAV was converted to mono PCM16 at 44.1 kHz, crossfaded at the loop seam, shortened to 3.92 seconds and peak-normalized. In-game rate, gain and filtering follow vehicle type, speed, gear and distance.

## Explosions (0.15)

[florianreichelt, Explosion](https://freesound.org/people/florianreichelt/sounds/563010/) supplies the heavy/rocket explosion. [SamsterBirdies, Explosion / Gun](https://freesound.org/people/SamsterBirdies/sounds/587445/) supplies the grenade explosion. Both are CC0, obtained from hamsunqiu's Modern Military Weapons Sound Pack v0.2, curated files fx_exp_single_near_01/02.wav.

Trimmed silence, high-pass filtered at 35 Hz, loudness mastered with true-peak headroom, faded tails, encoded as 44.1 kHz Vorbis quality 6. Previous EZduzziteh explosion assets were replaced.

## PT-90 launch and flight (0.15)

Rocket Launch Pack by **dklon**, https://opengameart.org/content/rocket-launch-pack, licensed under **CC BY 3.0**, https://creativecommons.org/licenses/by/3.0/ . Source rocket_launch_1.wav and rocket_launch_2.wav. Changes: trimmed leading silence, EQ, loudness mastering, tail fades, Vorbis encoding. The flight loop extracts the sustained jet of rocket_launch_2.wav and crossfades its seam; playback position and Doppler pitch follow the rocket. Credit is also displayed on the game's credits page. No endorsement by the original author is implied.

Reproduce with scripts/prepare-combat-audio.mjs (staging directory and ffmpeg path arguments).

The flight loop uses a moving 3D sound source with distance attenuation and Doppler pitch. Launch/snapshot tracking keeps it alive until the corresponding explosion or the rocket's four-second lifetime, including between snapshots and outside snapshot interest range. The authored crossfade is preserved rather than adding a dip at each loop seam.
