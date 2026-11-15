// Determine an exact Web Audio looping window from authored mission music.
// The intro plays once; after loopEnd we repeat [loopStart, loopEnd).
// Pure helper, also used when resuming after pause or an asynchronous decode.
export function campaignMusicWindow(music={},duration=0,seconds=0){
  const total=Number(duration);
  const start=Number(music.loopStart);
  const end=Number(music.loopEnd);
  const elapsed=Number.isFinite(seconds)?Math.max(0,seconds):0;
  const loop=Number.isFinite(total)&&total>0&&Number.isFinite(start)&&
    Number.isFinite(end)&&start>=0&&end>start+.5&&end<=total;
  const offset=loop&&elapsed>=end
    ?start+(elapsed-end)%(end-start)
    :Math.min(elapsed,Math.max(0,total-.02));
  return {loop,loopStart:loop?start:0,loopEnd:loop?end:0,offset};
}
