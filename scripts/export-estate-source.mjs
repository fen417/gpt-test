import {writeFile} from 'node:fs/promises';
import {ESTATE_WIDTH_SCALE,LINDEN_ESTATE_MAP as map} from '../shared/linden-estate.js';

const {boxes,furnishings,pool,menuView}=map;
await writeFile(process.argv[2],JSON.stringify({boxes,furnishings,pool,menuView,widthScale:ESTATE_WIDTH_SCALE}));
