# Firearm recordings

Source — [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library), Prepared SFX Library.

Recorded by Ben Jaszczak, Brian Nelson, Kevin Heras, and Matthew Nanney. Released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

The bundled files are individual close-microphone reports extracted from these recordings. Each report uses the channel with fewer saturated samples, avoiding cancellation between the microphones. Saturated runs are interpolated before anti-alias filtering and conversion from 96 kHz PCM24 to 48 kHz mono PCM16. Processing removes DC and rumble and includes edge fades. Output peaks stay at -2.6 dBFS.

| Game files | Source recording | Report positions in seconds |
| --- | --- | --- |
| rifle-light | AR-15/D_32P.wav | 0.704, 5.648 |
| rifle-heavy | AK-47/C_28P.wav | 0.610, 3.256 |
| smg | Carl Gustav M45/G_31P.wav | 0.310, 3.500 |
| marksman | SKS/U_14P.wav | 3.576, 6.754 |
| sniper | Tikka/W_29P.wav | 0.578, 5.666 |
| pistol | Walther PPQ/X_39P.wav | 1.406, 6.444 |
| pistol-heavy | 1911/A_42P.wav | 0.942, 5.002 |

Weapon profiles adapt playback rate, gain, and filtering for the fictional game weapons. The original archive stays outside the shipped game.
