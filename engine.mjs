export const STORAGE_KEY = 'a1a24-study:v1';
export const blankState = () => ({schemaVersion:1,preferences:{fontSize:20,examDate:'2026-10-25'},units:{},questions:{},lastUnit:'A9'});
const nf = s => String(s ?? '').normalize('NFKC').trim();
const textKey = s => nf(s).toLowerCase().replace(/[\s。.!！?？、，,;；:：]/g,'');

export function parseNumber(input,unit='') {
  let s = nf(input).replace(/[−–]/g,'-').replace(/，/g,',');
  const percent=s.endsWith('%') && unit!=='%';
  if(unit && s.endsWith(nf(unit))) s=s.slice(0,-nf(unit).length).trim();
  s=s.replace(/[%°]$/,'').replace(/,/g,'').trim();
  let match=s.match(/^(-?\d+)\s*(?:又|\s)\s*(\d+)\s*\/\s*(\d+)$/);
  if(match){const den=Number(match[3]);return den ? (Math.abs(Number(match[1]))+Number(match[2])/den)*(match[1].startsWith('-')?-1:1)/(percent?100:1) : NaN;}
  match=s.match(/^([-+]?\d+(?:\.\d+)?)\s*\/\s*([-+]?\d+(?:\.\d+)?)$/);
  if(match)return Number(match[2]) ? Number(match[1])/Number(match[2])/(percent?100:1) : NaN;
  return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(s) ? Number(s)/(percent?100:1) : NaN;
}

export function gradeField(field,input) {
  if(!nf(input))return {valid:false,correct:false,message:'请先填写答案。'};
  if((field.aliases||[]).some(a=>textKey(a)===textKey(input)))return {valid:true,correct:true};
  if(field.type==='text')return {valid:true,correct:textKey(input)===textKey(field.expected)};
  if(nf(input).endsWith('%') && field.unit!=='%' && !/概率/.test(field.label))return {valid:false,correct:false,message:'请按标签中的单位填写。'};
  if(nf(input).endsWith('°') && !['度','°'].includes(field.unit))return {valid:false,correct:false,message:'请按标签中的单位填写。'};
  if(field.type==='set') {
    const parts=nf(input).replace(/[{}【】\[\]]/g,'').split(/[,，、;；\s]+/).filter(Boolean);
    const parsed=parts.map(p=>parseNumber(p,field.unit));
    if(!parsed.length || parsed.some(v=>!Number.isFinite(v)))return {valid:false,correct:false,message:'用逗号或空格分隔各个数字。'};
    const key=a=>[...new Set(a)].sort((x,y)=>x-y).join(',');
    return {valid:true,correct:key(parsed)===key(field.expected)};
  }
  const value=parseNumber(input,field.unit);
  if(!Number.isFinite(value))return {valid:false,correct:false,message:'请输入数字、小数或分数，例如1/3。'};
  const epsilon=field.tolerance ?? 1e-6;
  return {valid:true,correct:Math.abs(value-Number(field.expected))<=epsilon*Math.max(1,Math.abs(Number(field.expected)))};
}

export function gradeQuestion(q,answers) {
  const fields=q.grading.fields.map(f=>({key:f.key,label:f.label,...gradeField(f,answers[f.key])}));
  return {valid:fields.every(f=>f.valid),correct:fields.every(f=>f.correct),fields};
}

export function recordAttempt(state,q,answers,now=new Date().toISOString()) {
  const verdict=gradeQuestion(q,answers);
  if(!verdict.valid)return verdict;
  const old=state.questions[q.id] || {};
  state.questions[q.id]={...old,answers:{...answers},lastAnswers:{...answers},attempts:(old.attempts||0)+1,correctCount:(old.correctCount||0)+(verdict.correct?1:0),wrongCount:(old.wrongCount||0)+(verdict.correct?0:1),lastCorrect:verdict.correct,everWrong:!!old.everWrong||!verdict.correct,wrongActive:!verdict.correct,lastAttemptAt:now,updatedAt:now};
  return verdict;
}

export function sanitizeState(raw,unitIds,questionIds) {
  if(!raw || raw.schemaVersion!==1 || typeof raw!=='object' || Array.isArray(raw))throw new Error('这不是本学习站支持的备份文件。');
  const result=blankState();
  const pref=raw.preferences||{};
  if(Number.isInteger(pref.fontSize))result.preferences.fontSize=Math.min(30,Math.max(16,pref.fontSize));
  if(typeof pref.examDate==='string' && /^\d{4}-\d{2}-\d{2}$/.test(pref.examDate) && Number.isFinite(Date.parse(pref.examDate)))result.preferences.examDate=pref.examDate;
  if(unitIds.includes(raw.lastUnit))result.lastUnit=raw.lastUnit;
  const cleanString=(s,max=300)=>typeof s==='string'?s.slice(0,max):'';
  const date=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))?s:'';
  for(const id of unitIds){const u=raw.units?.[id];if(u&&typeof u==='object')result.units[id]={read:!!u.read,updatedAt:date(u.updatedAt)};}
  for(const id of questionIds){
    const q=raw.questions?.[id];if(!q||typeof q!=='object')continue;
    const cleanAnswers=a=>Object.fromEntries(Object.entries(a||{}).filter(([k,v])=>/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(k)&&typeof v==='string').slice(0,10).map(([k,v])=>[k,cleanString(v)]));
    const count=n=>Number.isInteger(n)&&n>=0?Math.min(n,100000):0;
    result.questions[id]={answers:cleanAnswers(q.answers),lastAnswers:cleanAnswers(q.lastAnswers),attempts:count(q.attempts),correctCount:count(q.correctCount),wrongCount:count(q.wrongCount),lastCorrect:typeof q.lastCorrect==='boolean'?q.lastCorrect:null,everWrong:!!q.everWrong,wrongActive:!!q.wrongActive,starred:!!q.starred,note:cleanString(q.note,4000),lastAttemptAt:date(q.lastAttemptAt),updatedAt:date(q.updatedAt)};
  }
  return result;
}

export function mergeState(current,incoming) {
  const merged=JSON.parse(JSON.stringify(current));
  for(const [id,u] of Object.entries(incoming.units))merged.units[id]={...(merged.units[id]||{}),read:!!u.read||!!merged.units[id]?.read,updatedAt:u.updatedAt};
  for(const [id,next] of Object.entries(incoming.questions)){
    const prev=merged.questions[id];if(!prev){merged.questions[id]=next;continue;}
    const latest=(next.updatedAt||'')>(prev.updatedAt||'')?next:prev;
    const a=prev.note||'',b=next.note||'';
    const note=a.includes(b)?a:b.includes(a)?b:(a+'\n'+b).slice(0,4000);
    merged.questions[id]={...latest,attempts:Math.max(prev.attempts||0,next.attempts||0),correctCount:Math.max(prev.correctCount||0,next.correctCount||0),wrongCount:Math.max(prev.wrongCount||0,next.wrongCount||0),everWrong:!!prev.everWrong||!!next.everWrong,starred:!!prev.starred||!!next.starred,note};
  }
  return merged;
}

export const stats = state => ({read:Object.values(state.units).filter(u=>u.read).length,attempted:Object.values(state.questions).filter(q=>q.attempts>0).length,correct:Object.values(state.questions).filter(q=>q.lastCorrect===true).length,wrong:Object.values(state.questions).filter(q=>q.everWrong&&q.wrongActive).length});
