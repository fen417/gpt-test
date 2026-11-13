const reservedKeys=[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(letter=>'Key'+letter).concat(
  Array.from({length:10},(_,n)=>'Digit'+n),['ControlLeft','ControlRight','ShiftLeft','ShiftRight','Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
let keyboardRequest=null;

export async function captureGameKeyboard({fullscreen=false}={}){
  if(fullscreen&&!navigator.keyboard?.lock)throw Error('Keyboard lock is not supported by this browser');
  if(fullscreen&&!document.fullscreenElement&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen({navigationUI:'hide'});
  if(document.fullscreenElement&&navigator.keyboard?.lock){
    keyboardRequest??=navigator.keyboard.lock(reservedKeys).finally(()=>{keyboardRequest=null;});
    await keyboardRequest;
  }
}

document.addEventListener('fullscreenchange',()=>{
  if(!document.fullscreenElement)navigator.keyboard?.unlock?.();
  else if(document.pointerLockElement)captureGameKeyboard().catch(()=>{});
});
