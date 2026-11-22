function readConfig(){
  try{
    const config=JSON.parse(import.meta.env.VITE_FIREBASE_CONFIG??'null');
    const keys=['apiKey','authDomain','databaseURL','projectId','appId'];
    if(!keys.every(key=>typeof config?.[key]==='string'&&config[key].trim()))return null;
    return new URL(config.databaseURL).protocol==='https:'?config:null;
  }catch{return null;}
}
export const firebaseWebConfig=readConfig();
