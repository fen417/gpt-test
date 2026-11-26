export const validEditorMapId=id=>typeof id==='string'&&/^editor-[a-f0-9]{16}$/.test(id);
export function validEditorMapConfig(config){return config&&typeof config.name==='string'&&config.name.trim().length>0&&config.name.length<=100&&Number.isInteger(config.size)&&config.size>=128&&config.size<=1024&&config.size%32===0;}
