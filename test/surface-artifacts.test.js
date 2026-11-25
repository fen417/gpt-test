import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherArtProfile,weatherParameters} from '../src/map-weathering.js';
import {foliagePixels} from '../src/vegetation-art.js';
test('desert masonry uses subdued runoff and no grass weathering',()=>{
  for(const map of ['village','alhadra','alhadra-desert','tel-mazin','safra']){
    for(const mat of ['stucco','concrete','brick']){
      const a=weatherArtProfile(map,mat,'high'),p=weatherParameters(map,mat,'high');
      assert.ok(a[0]<.25);assert.ok(p[1]<.16);assert.ok(a[7]>.85);
    }
    assert.equal(weatherParameters(map,'grass','high'),null);
  }
});
test('grass keeps opaque blades without repeating diagonal brightness modulation',()=>{
  const size=128,p=foliagePixels('grass',size);let real=0,correlation=0,weight=0;
  // Match the exact frequency of the removed stripe. Per-blade colour
  // variations are allowed, but a common sinusoidal ripple is not.
  let a=0,b=0,c=0,n=0;
  for(let y=1;y<size-1;y++)for(let x=1;x<size-1;x++){
    const i=(y*size+x)*4;if(p[i+3]<245||p[i-4+3]<245||p[i+4+3]<245)continue;
    const residual=p[i]-(p[i-4]+p[i+4])*.5,s=Math.sin((x+.5)/size*159+(y+.5)/size*113);
    a+=residual*s;b+=residual*residual;c+=s*s;n++;
  }
  assert.ok(n>100);assert.ok(Math.abs(a)/Math.max(1,Math.sqrt(b*c))<.3);
});
