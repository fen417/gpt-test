# Materials for the graphics remaster

The photographic source textures are distributed under [Poly Haven's CC0 license](https://polyhaven.com/license). The 1K JPG inputs use the diffuse, OpenGL normal and packed AO/roughness/metallic channels. The WebP variants are sized for in-game use.

- Concrete deck, stairs and walls use [Concrete Floor Worn 001](https://polyhaven.com/a/concrete_floor_worn_001).
- Dry rock uses [Rock Boulder Dry](https://polyhaven.com/a/rock_boulder_dry).
- Sandy terrain uses [Gravelly Sand](https://polyhaven.com/a/gravelly_sand).
- Asphalt uses [Asphalt 02](https://polyhaven.com/a/asphalt_02).
- Laguna ceramic uses an original ambient-occlusion bake from Blender. It contains shadows from the bevelled tile edges onto the grout. The tile pitch follows the existing ceramic texture.

Run `blender -b --python art-source/graphics-remaster/bake-ceramic-ao.py -- .perf-local/remaster-source/ceramic-ao.png` for the AO source. Run `node art-source/graphics-remaster/pack-surfaces.mjs .perf-local/remaster-source` from the project root with the input files named `<concrete|rock|sand|asphalt>-<diff|nor_gl|arm>.jpg`.

Для параллакса используются карты Displacement из тех же CC0-наборов. Имена файлов для сборки — `concrete-disp.jpg` и `rock-disp.jpg`.
