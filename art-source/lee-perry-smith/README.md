# Infinite head scan attribution

Infinite, 3D Head Scan by **Lee Perry-Smith**, based on work at
https://www.triplegangers.com/, is used under **CC BY 3.0 Unported**.
https://creativecommons.org/licenses/by/3.0/

Pinned source: Three.js r181 examples/models/gltf/LeePerrySmith
https://github.com/mrdoob/three.js/tree/r181/examples/models/gltf/LeePerrySmith
The author's license is preserved verbatim in LICENSE.txt.

Adaptations: bust cropped to a head/neck, neck fitted to the uniform collar,
rotated and scaled into the existing soldier head bone, simplified into two
levels, quantized/encoded for synchronous geometry construction. Colour and
normal images are integrated into the shared soldier atlas. No skeletal/network
or hit-volume data is taken from this asset.

Regenerate the derived src/soldier-head-data.js with:
node scripts/build-soldier-head.mjs

The original GLB is head.glb in this directory. Runtime colour and normal maps
are in src/assets/soldier-head. In-game attribution is in credits.html, linked
from the main menu. This license applies to these assets and their adaptations,
not to the entire project.
