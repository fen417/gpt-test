export const CASE_NAME = 'Полевой резерв';
export const MATCH_CASE_CHANCE = 14;
export const TDM_CASE_CHANCE = 5;
export const TDM_CASE_MIN_KILLS = 50;

export function matchCaseChance(mode,killLimit){
  if(mode==='tdm')return killLimit>=TDM_CASE_MIN_KILLS?TDM_CASE_CHANCE:0;
  return MATCH_CASE_CHANCE;
}

export const CASE_RARITIES = [
  {id:'common',name:'Обычный',chance:48,count:3},
  {id:'uncommon',name:'Необычный',chance:28,count:3},
  {id:'rare',name:'Редкий',chance:16,count:3},
  {id:'legendary',name:'Легендарный',chance:7,count:2},
  {id:'ultra',name:'Ультраредкий',chance:1,count:1},
];

const finishes={
  common:[['Пепел','ar416'],['Насыпь','ak12'],['Мох','p19']],
  uncommon:[['Кварц','mcx9'],['Тальвег','pkp'],['Радиомаяк','mg36']],
  rare:[['Рябь','vk45'],['Суховей','dmr12'],['Контур','ar416']],
  legendary:[['Медный ястреб','ak12'],['Затмение','m50']],
  ultra:[['Леди Наган','sv98']],
};

export const CASE_REWARDS = CASE_RARITIES.flatMap(({id})=>
  finishes[id].map(([name,weaponId],i)=>({id:id+'-'+(i+1),rarity:id,name,weaponId})));
const rewardById=new Map(CASE_REWARDS.map(reward=>[reward.id,reward]));
export const caseReward=id=>rewardById.get(id);

export function campaignCaseReward(missionId,difficulty){
  if(!['m01','m02','m03'].includes(missionId))return 0;
  return difficulty==='veteran'?2:difficulty==='regular'?1:0;
}
