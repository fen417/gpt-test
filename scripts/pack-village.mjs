import { packMap } from './pack-map.mjs';

await packMap(process.argv[2] ?? '.perf-local/village-bake', 'src/assets/village');
