# User supplied sniper recordings

The repository owner uploaded `marksman-1.ogg` and `marksman-2.ogg` in commit
`3d5e250` and explicitly requested their use for DMR-12 and SV-98M respectively.
The original uploaded bytes are preserved here:

| Original upload | Preserved source | Git blob |
| --- | --- | --- |
| marksman-1.ogg | user-dmr12.ogg | 77888d0e7544b02eb62826fbece9ecc49a2bd100 |
| marksman-2.ogg | user-sv98.ogg | 11ea039b0cdd4fe79a23b640d4c1b695fc900eef |

These are user supplied assets; no external author or public licence is inferred.
`node scripts/prepare-sniper-audio.mjs` derives aligned Opus/OGG and AAC/M4A
runtime files and records attack measurements in `docs/perf/sniper-recordings.json`.
Each weapon uses its own single sample. `npm run assets:audio` regenerates both
from the preserved user recordings.
