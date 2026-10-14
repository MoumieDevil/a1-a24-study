import {STORAGE_KEY,blankState,sanitizeState,mergeState,recordAttempt,stats} from './engine.mjs';

const course=window.COURSE;
const main=document.getElementById('main');
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const p=s=>e(s).replace(/\n/g,'<br>');
if(!course?.units?.length){main.innerHTML='<p class="notice">教材暂未加载，请刷新页面。也可先下载<a href="full-course.pdf">完整PDF</a>。</p>';throw new Error('Course data unavailable');}
const units=course.units;
const unitMap=new Map(units.map(u=>[u.id,u]));
const questions=units.flatMap(u=>[{...u.example,unitId:u.id,kind:'example'},...u.practice.map(q=>({...q,unitId:u.id,kind:'practice'}))]).concat(course.diagnostic.map(q=>({...q,kind:'diagnostic'})),course.quizzes.flatMap((quiz,i)=>quiz.questions.map(q=>({...q,kind:'quiz',quizIndex:i}))));
const questionMap=new Map(questions.map(q=>[q.id,q]));
const unitIds=units.map(u=>u.id),questionIds=questions.map(q=>q.id);
let state=blankState(),storageMessage='',toastTimer;
try{const stored=localStorage.getItem(STORAGE_KEY);if(stored)state=sanitizeState(JSON.parse(stored),unitIds,questionIds);}catch{storageMessage='已有记录无法读取，或浏览器不允许保存。请到备份页下载原始记录；本次学习仍可继续。';}
let pageParams=new URLSearchParams(),currentRoute='home';
const short=u=>u.title.split(/[：:]/)[0];
const label=q=>({example:'精讲例题',practice:'章节练习',diagnostic:'基础诊断',quiz:'小测'}[q.kind]);
const qstate=id=>state.questions[id]||{};
const currentAnswer=(id,r)=>questionMap.get(id)?.grading.fields.every(f=>(r.answers?.[f.key]||'')===(r.lastAnswers?.[f.key]||''));
const now=()=>new Date().toISOString();
const readableDate=d=>d?new Date(d).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric'}):'';
function toast(message){const box=document.getElementById('toast');box.textContent=message;box.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{box.hidden=true;},3500);}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{storageMessage='浏览器无法保存记录，请导出备份，避免关闭页面后丢失。';toast(storageMessage);}}
function font(){document.documentElement.style.setProperty('--reading-size',state.preferences.fontSize+'px');document.getElementById('font-label').textContent=state.preferences.fontSize+'px';}
function nav(url){if(location.hash==='#'+url)render();else location.hash=url;}
function link(url,text,cls='button secondary'){return `<a class="${cls}" href="#${e(url)}">${e(text)}</a>`;}
function intro(title,lead,eyebrow='A1–A24 · 课余学习'){return `<header class="page-intro"><p class="eyebrow">${e(eyebrow)}</p><h1 class="page-title">${e(title)}</h1>${lead?`<p class="lead">${e(lead)}</p>`:''}</header>`;}
function section(title,content){return `<section class="lesson-section"><h2 class="section-heading">${e(title)}</h2>${content}</section>`;}
function empty(title,text,action=''){return `<section class="empty-state"><h2>${e(title)}</h2><p>${e(text)}</p>${action}</section>`;}
function selected(value,match){return value===match?' selected':'';}
function unitOptions(value='',all='全部章节'){return `<option value="">${all}</option>`+units.map(u=>`<option value="${u.id}"${selected(u.id,value)}>${u.id} ${e(short(u))}</option>`).join('');}
function updateSidebar(){
  const filter=document.getElementById('nav-search').value.trim().toLowerCase();
  const groups=[['总量与关系',/^A[1-4]$/],['效率与库存',/^A[5-7]$/],['A8 · 八类行程',/^A8-/],['间隔、周期与时间',/^A(?:9|1[0-3])$/],['百分数、比例与数',/^A1[4-9]$/],['计数、几何与最值',/^A2[0-4]$/]];
  const menu=[['home','学习首页'],['practice','练习中心'],['wrong','错题本'],['quick','考前速查'],['downloads','教材下载'],['settings','学习记录与备份']];
  let html=`<div class="nav-group nav-tools">${menu.map(([route,text])=>`<a class="nav-link ${currentRoute===route?'active':''}" href="#${route}">${e(text)}${route==='wrong'?`<span class="nav-progress">${stats(state).wrong}</span>`:''}</a>`).join('')}</div>`;
  let found=0;
  for(const [name,re] of groups){const list=units.filter(u=>re.test(u.id)&&(!filter||(u.id+' '+u.title+' '+u.recognition).toLowerCase().includes(filter)));if(!list.length)continue;found+=list.length;html+=`<div class="nav-group"><h2>${e(name)}</h2>${list.map(u=>`<a class="nav-link ${location.hash.startsWith('#unit/'+u.id)&&location.hash.split('?')[0]==='#unit/'+u.id?'active':''}" href="#unit/${u.id}" aria-label="${e(u.id+' '+short(u))}"><span class="nav-id">${u.id}</span><span class="nav-title">${e(short(u))}</span><span class="nav-progress" aria-label="${state.units[u.id]?.read?'已学':'未标记'}">${state.units[u.id]?.read?'✓':''}</span></a>`).join('')}</div>`;}
  if(filter&&!found)html+='<p class="muted">没有匹配章节，可用顶部全文查找。</p>';
  document.getElementById('chapter-nav').innerHTML=html;
}
function chapterCard(u){const qs=[u.example,...u.practice];const n=qs.filter(q=>qstate(q.id).lastCorrect===true).length;return `<a class="card chapter-card" href="#unit/${u.id}"><div class="chapter-meta"><span class="eyebrow">${u.id}</span><span class="pill">${state.units[u.id]?.read?'已学':'待学'}</span></div><h3>${e(short(u))}</h3><p>${e(u.goal)}</p><div class="progress-track"><span class="progress-fill" style="width:${n/3*100}%"></span></div><span class="muted">最近答对 ${n} / 3 · 1例2练</span></a>`;}
function countdown(){const target=state.preferences.examDate;const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Shanghai'});const left=Math.round((Date.parse(target+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);return left>=0?`距${target.slice(5).replace('-','月')}日还有${left}天`:'按自己的进度继续复习';}
function home(){
  const s=stats(state),next=unitMap.get(state.lastUnit)||unitMap.get('A9');
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow">A1–A24 · 招聘笔试 · ${e(countdown())}</p><h1 class="page-title">数量关系，<br>一步一步学会。</h1><p class="lead">读懂条件，画清关系，再用答案回代。完整图解、分步例题和独立练习，都放在这里。</p><div class="button-row">${link('unit/'+next.id,'继续学习 '+next.id,'button primary')}${link('practice','开始练习')}</div><p class="muted">每天约45–60分钟，优先重做已有错题。</p></div><div class="hero-aside" aria-label="读条件、画关系、回代三个学习步骤"><span class="hero-step">01 · 读条件</span><span class="hero-line"></span><span class="hero-step">02 · 画关系</span><span class="hero-line"></span><span class="hero-step">03 · 回代检查</span><p>理解方法，再记公式</p></div></section>
  <div class="stat-grid"><div class="stat-card"><span class="stat-value">${s.read}<small> / ${units.length}</small></span><span class="stat-label">标记已学单元</span></div><div class="stat-card"><span class="stat-value">${s.attempted}<small> / ${questions.length}</small></span><span class="stat-label">已尝试题目</span></div><a class="stat-card" href="#wrong"><span class="stat-value">${s.wrong}</span><span class="stat-label">待订正错题</span></a></div>
  <section class="card"><h2>选择今天的学习方式</h2><div class="card-grid">${link('practice','按章节练习')}${link('quiz/0','8题小测 · 回顾A1–A8')}${link('quiz/1','8题小测 · A9–A17')}${link('quiz/2','8题小测 · A18–A24')}${link('quick','只看公式与条件')}${link('diagnostic','按需做基础诊断')}</div><p class="muted">123题＝31道精讲＋62道练习＋6道诊断＋24道小测。诊断可跳过，例题可先读再练。</p><button class="button quiet small" data-action="mark-early">我已学完A1–A8，标记这些单元</button></section>
  <section><div class="section-heading"><h2>完整章节目录</h2><span class="muted">A8分为8个单元</span></div><div class="card-grid">${units.map(chapterCard).join('')}</div></section>`;
}
function steps(q){return `<ol class="steps">${q.steps.map((s,i)=>`<li class="step"><span class="step-number">${i+1}</span><div class="step-copy">${typeof s==='string'?p(s):`<strong>${e(s.label)}</strong><p>${p(s.text)}</p>`}</div></li>`).join('')}</ol>`;}
function solution(q){return `${steps(q)}<div class="solution"><strong>答案：${p(q.answer)}</strong>${q.check?`<p>核验：${p(q.check)}</p>`:''}</div>`;}
function questionHtml(q,{notes=false}={}){
  const r=qstate(q.id),current=currentAnswer(q.id,r),graded=typeof r.lastCorrect==='boolean'&&r.attempts>0&&current;
  const feedback=graded?(r.lastCorrect?'答案正确。可以展开解析，核对你的关系式。':'答案还不正确，已加入错题本。先检查条件和单位，再看解析。'):'';
  return `<article class="question-card" id="question-${q.id}" data-qid="${q.id}"><div class="question-head"><h3>${q.id}</h3><div class="question-meta"><span class="pill">${label(q)}</span>${unitMap.has(q.unitId)?`<a href="#unit/${q.unitId}">${q.unitId} ${e(short(unitMap.get(q.unitId)))}</a>`:''}</div></div><p class="question-stem">${p(q.stem)}</p>
  <form data-question="${q.id}" aria-label="${q.id}答案"><div class="answer-fields">${q.grading.fields.map(f=>`<label class="answer-field" for="answer-${q.id}-${f.key}"><span>${e(f.label)}${f.unit?` <span class="answer-unit">（${e(f.unit)}）</span>`:''}</span><input class="answer-input" id="answer-${q.id}-${f.key}" name="${f.key}" type="text" autocomplete="off" maxlength="100" value="${e(r.answers?.[f.key]||'')}" placeholder="${f.type==='set'?'如1,4,7':f.type==='text'?'填写文字答案':'小数或分数均可'}"></label>`).join('')}</div><div class="answer-actions"><button class="button primary small" type="submit">检查答案</button><button class="button secondary small" type="button" data-action="retry" data-id="${q.id}">重新作答</button><button class="button quiet small" type="button" data-action="star" data-id="${q.id}" aria-pressed="${!!r.starred}">${r.starred?'★ 已收藏':'☆ 收藏'}</button></div><div class="feedback ${graded?(r.lastCorrect?'correct':'incorrect'):'ungraded'}" role="status"${feedback?'':' hidden'}>${e(feedback)}</div></form>
  <details class="answer-details"><summary>查看完整解析</summary>${solution(q)}<p class="muted">先写关系式，再核验每一步。</p></details><div class="button-row question-management"><button class="button quiet small" data-action="add-wrong" data-id="${q.id}"${r.everWrong&&r.wrongActive?' disabled':''}>${r.everWrong&&r.wrongActive?'在待订正错题中':'加入错题本'}</button>${r.everWrong&&r.wrongActive?`<button class="button quiet small" data-action="resolve" data-id="${q.id}">标记已掌握</button>`:''}<span class="muted">尝试${r.attempts||0}次${r.wrongCount?` · 错${r.wrongCount}次`:''}${r.everWrong&&!r.wrongActive?' · 已订正':''}</span></div>${notes?`<label class="wrong-note">错因笔记<textarea data-note="${q.id}" rows="3" maxlength="4000" placeholder="漏了什么条件？正确关系是什么？下次如何检查？">${e(r.note||'')}</textarea></label>`:''}</article>`;
}
function lesson(id){
  const u=unitMap.get(id);if(!u)return notFound();
  const index=units.indexOf(u),read=!!state.units[id]?.read;
  return `<article class="lesson">${intro(u.title,u.goal,u.id+' · 知识图解与练习')}<div class="button-row">${link('practice?unit='+id,'只练这一章','button primary')}<button class="button secondary" data-action="read" data-id="${id}" aria-pressed="${read}">${read?'✓ 已标记学完':'标记本章学完'}</button></div>
  ${section('先识别题型',`<p class="notice">${p(u.recognition)}</p>`)}
  ${section('把知识讲清楚',`<div class="concept-grid">${u.concepts.map(c=>`<section class="concept-card"><h3>${e(c.heading)}</h3><p>${p(c.text)}</p></section>`).join('')}</div>`)}
  <figure class="diagram-card"><div class="diagram">${u.diagram_svg}</div><figcaption class="diagram-caption">${p(u.diagram_caption)}<span class="muted"> 窄屏可左右滑动图解。</span></figcaption><button class="button quiet small" data-action="zoom" data-id="${id}">放大图解</button></figure>
  <div class="formula-card"><h2>核心关系与条件</h2><p>${p(u.formula)}</p></div>
  ${section('跟着一道例题走',`<article class="card"><p class="eyebrow">${u.example.id} · 精讲</p><p class="question-stem">${p(u.example.stem)}</p>${solution(u.example)}<button class="button secondary small" data-action="try-example" data-id="${u.example.id}">遮住解析，独立再练</button></article>`)}
  ${section('独立完成两道练习',`<p class="muted">可输入分数，如1/3。百分数按标签填写，16表示16%。</p>${u.practice.map(q=>questionHtml(questionMap.get(q.id))).join('')}`)}
  ${section('记住易错点',`<ul class="pitfalls">${u.pitfalls.map(s=>`<li>${p(s)}</li>`).join('')}</ul><div class="recap"><strong>30秒回顾</strong><p>${p(u.recap)}</p></div><p class="muted">${p(u.coverage_note)}</p>`)}
  ${u.sources.length?`<details><summary>原理参考资料</summary><ul>${u.sources.map(s=>`<li><a href="${e(s.url)}" target="_blank" rel="noopener noreferrer">${e(s.title)}</a></li>`).join('')}</ul></details>`:''}
  <nav class="chapter-pagination" aria-label="相邻章节">${index>0?link('unit/'+units[index-1].id,'← '+units[index-1].id+' '+short(units[index-1])):link('home','学习首页')}${index<units.length-1?link('unit/'+units[index+1].id,units[index+1].id+' '+short(units[index+1])+' →','button primary'):link('quiz/2','做综合小测 →','button primary')}</nav></article>`;
}
function shuffle(list,seed){let value=seed||1;const random=()=>((value=(value*1664525+1013904223)>>>0)/4294967296);const out=[...list];for(let i=out.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
function practice(){
  const unit=pageParams.get('unit')||'',kind=pageParams.get('kind')||'practice',status=pageParams.get('status')||'all';
  let list=questions.filter(q=>(!unit||q.unitId===unit)&&(kind==='all'||(kind==='core'?['example','practice'].includes(q.kind):q.kind==='practice')));
  list=list.filter(q=>status==='all'||status==='starred'&&qstate(q.id).starred||status==='unanswered'&&!qstate(q.id).attempts||status==='wrong'&&qstate(q.id).everWrong&&qstate(q.id).wrongActive);
  const seed=Number(pageParams.get('random'));if(seed)list=shuffle(list,seed).slice(0,10);
  const total=list.length,page=Math.min(Math.max(1,Number(pageParams.get('page'))||1),Math.max(1,Math.ceil(total/10))),slice=list.slice((page-1)*10,page*10);
  return intro('练习中心','按章节练两题，也可以随机取10题。检查后会自动保存结果，错题进入错题本。')+`<div class="practice-toolbar"><div class="filter-row"><label>章节<select data-filter="unit">${unitOptions(unit)}</select></label><label>题目范围<select data-filter="kind"><option value="practice"${selected('practice',kind)}>章节练习 · 62题</option><option value="core"${selected('core',kind)}>精讲＋练习 · 93题</option><option value="all"${selected('all',kind)}>全部题目 · 123题</option></select></label><label>状态<select data-filter="status"><option value="all"${selected('all',status)}>全部</option><option value="unanswered"${selected('unanswered',status)}>尚未作答</option><option value="wrong"${selected('wrong',status)}>待订正</option><option value="starred"${selected('starred',status)}>已收藏</option></select></label></div><div class="button-row"><button class="button secondary small" data-action="random">随机练10题</button>${seed?link('practice'+(unit?'?unit='+unit:''),'返回顺序练习','button quiet small'):''}<span class="muted">${total?`第${(page-1)*10+1}–${Math.min(page*10,total)}题 / ${total}题`:'当前筛选没有题目'}</span></div><p class="muted">分数可写1/3；百分数按标签填写，16表示16%。</p></div>`+(total?slice.map(q=>questionHtml(q)).join('')+pagination(page,total):empty('没有匹配题目','试试其他章节或状态。',link('practice','查看全部练习')));
}
function pagination(page,total){const url=n=>{const s=new URLSearchParams(pageParams);s.set('page',n);return 'practice?'+s;};return `<nav class="chapter-pagination" aria-label="练习分页">${page>1?link(url(page-1),'← 上一页'):''}<span class="muted">第${page} / ${Math.ceil(total/10)}页</span>${page*10<total?link(url(page+1),'下一页 →'):''}</nav>`;}
function wrong(){
  const status=pageParams.get('status')||'active',unit=pageParams.get('unit')||'';
  const list=questions.filter(q=>{const r=qstate(q.id);return r.everWrong&&(!unit||unit===q.unitId)&&(status==='all'||(status==='resolved'?!r.wrongActive:r.wrongActive));}).sort((a,b)=>(qstate(b.id).updatedAt||'').localeCompare(qstate(a.id).updatedAt||''));
  return intro('错题本','记录错因，比抄一遍答案更有用。重做答对后自动移到“已订正”，记录与笔记仍然保留。')+`<div class="practice-toolbar"><div class="tabs" role="navigation" aria-label="错题状态">${[['active','待订正'],['resolved','已订正'],['all','全部历史']].map(([key,text])=>link('wrong?status='+key+(unit?'&unit='+unit:''),text,'tab '+(status===key?'active':''))).join('')}</div><label>章节<select data-wrong-filter>${unitOptions(unit)}</select></label><p class="muted">共${list.length}题。记录仅存在当前设备浏览器，可从备份页导出到其他设备。</p></div>`+(list.length?list.map(q=>questionHtml(q,{notes:true})).join(''):empty(status==='active'?'暂时没有待订正错题':'这里还没有记录','做错的题会自动收录，也可在题卡中手动加入。',link('practice','去做两道练习','button primary')));
}
function quiz(index){
  const isDiagnostic=index==='diagnostic',quiz=isDiagnostic?{title:'基础诊断 · 按需使用',scope:'已学完A1–A8可跳过。只在基础概念生疏时使用。',questions:course.diagnostic}:course.quizzes[Number(index)];
  if(!quiz)return notFound();
  return intro(quiz.title,quiz.scope,'自测 · 题目与解析可独立展开')+`<div class="notice">先独立作答，再检查。留空或无效输入不会记成错题。<div class="button-row"><button class="button primary small" data-action="grade-all">检查整卷</button><button class="button secondary small" data-action="retry-all">整卷重新作答</button><span class="result-summary" id="quiz-summary" role="status"></span></div></div>`+quiz.questions.map(q=>questionHtml(questionMap.get(q.id))).join('');
}
function updateQuizSummary(){const box=document.getElementById('quiz-summary');if(!box)return;const forms=[...main.querySelectorAll('form[data-question]')];let done=0,correct=0;for(const form of forms){const r=qstate(form.dataset.question);if(r.attempts&&currentAnswer(form.dataset.question,r)){done++;if(r.lastCorrect)correct++;}}box.textContent=`已检查${done}/${forms.length}题，答对${correct}题。`;}
function quick(){return intro('考前速查','先确认题型与公式条件，再代入数字。遇到不熟的模型，点章节回到讲解。')+`<div class="quick-grid">${course.quickReference.map(g=>`<section class="card quick-card"><h2>${e(g.title)}</h2><p>${p(g.text)}</p><div class="button-row">${(g.unitIds||[]).filter(id=>unitMap.has(id)).map(id=>link('unit/'+id,id,'button quiet small')).join('')}</div></section>`).join('')}</div><button class="button secondary" data-action="print">打印速查页</button>`;}
function downloads(){return intro('教材与资料下载','网页版用于随时学习和练习；PDF可保存到手机，也适合打印。')+`<div class="download-grid">${course.downloads.map(d=>`<article class="card"><span class="pill">${e(d.type||'PDF')}</span><h2>${e(d.title)}</h2><p>${e(d.description)}</p><div class="button-row"><a class="button primary small" href="${e(d.href)}" target="_blank" rel="noopener">打开资料</a><a class="button secondary small" href="${e(d.href)}" download>下载</a></div></article>`).join('')}</div>`+section('网页版内容说明',`<p>沿用原教材的核心知识、1例2练和小测。网页补清了少量原题的出发方向、计时起止及情景表述，数学模型保持一致。</p><details><summary>查看本次整合的修订记录</summary><ul>${(course.revisions||[]).map(s=>`<li>${e(s)}</li>`).join('')}</ul></details><p>${link('sources','查看原理参考资料','button quiet small')}</p>`);
}
function settings(){const s=stats(state);return intro('学习记录与备份','把记录导出到文件，再在另一台设备导入。导入会合并已有进度和错因笔记。')+`<div class="settings-grid"><section class="card"><h2>我的进度</h2><p>已学${s.read}/${units.length}单元，已尝试${s.attempted}题，待订正${s.wrong}题。</p><p class="notice">同一设备、同一浏览器会自动记住记录。手机与电脑之间暂不自动同步；清除浏览器数据会删除本机记录，请定期备份。</p><div class="button-row"><button class="button primary" data-action="export">导出学习记录</button><button class="button secondary" data-action="export-raw">下载本机原始记录</button></div><div id="export-copy" hidden></div><label class="file-input">导入备份文件<input id="import-file" type="file" accept=".json,application/json"></label><p class="muted">备份只包含学习进度、答案、收藏、错题与笔记。重复导入同一备份不会重复累计次数。</p><p id="import-result" role="status"></p></section><section class="card"><h2>阅读与考试日期</h2><label class="setting-row">字号<select id="font-select">${[16,18,20,22,24,26,28,30].map(n=>`<option value="${n}"${selected(n,state.preferences.fontSize)}>${n}px</option>`).join('')}</select></label><label class="setting-row">考试日期<input id="exam-date" type="date" value="${e(state.preferences.examDate)}"></label><button class="button secondary small" data-action="font-reset">恢复20px</button><hr><h3>离线学习</h3><p>首次联网打开后，教材页面可缓存供离线阅读与练习。PDF请单独下载保存。手机可使用浏览器的“添加到主屏幕”。</p></section></div><details class="card"><summary>清空当前浏览器记录</summary><p>此操作清空进度、答案、错题、收藏和笔记。请先导出备份；已有备份可重新导入。</p><button class="button danger small" data-action="clear">清空本机学习记录</button></details>`;}
function highlight(text,query){if(!query)return e(text);const escaped=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return String(text).split(new RegExp('('+escaped+')','gi')).map((part,i)=>i%2?'<mark>'+e(part)+'</mark>':e(part)).join('');}
function search(){const query=pageParams.get('q')||'';let result='';if(query.trim()){
    const queryKey=query.toLowerCase();
    const hits=units.map(u=>({u,text:[u.title,u.goal,u.recognition,u.formula,...u.concepts.map(c=>c.heading+' '+c.text),...u.pitfalls,u.recap].join(' ')})).filter(r=>r.text.toLowerCase().includes(queryKey));
    const qs=questions.filter(q=>q.stem.toLowerCase().includes(queryKey));
    const snippet=text=>{const n=text.toLowerCase().indexOf(queryKey);const start=Math.max(0,n-35);return highlight((start?'…':'')+text.slice(start,start+140)+'…',query);};
    result=`<p class="muted">找到${hits.length}个知识单元、${qs.length}道题。仅检索知识正文和题干，不展示题目答案。</p><div class="search-results">${hits.map(({u,text})=>`<a class="card search-result" href="#unit/${u.id}"><span class="eyebrow">${u.id} · 知识讲解</span><h2>${highlight(u.title,query)}</h2><p>${snippet(text)}</p></a>`).join('')}${qs.map(q=>`<a class="card search-result" href="#q/${q.id}"><span class="eyebrow">${q.id} · ${label(q)}</span><p>${snippet(q.stem)}</p></a>`).join('')}</div>`;
    if(!hits.length&&!qs.length)result=empty('没有找到匹配内容','试试“相遇”“浓度”“星期”等题型关键词。');
  }
  return intro('全文查找','查找知识、题型和练习题干，点结果回到对应位置。')+`<form id="full-search" class="practice-toolbar" role="search"><label for="search-query">关键词</label><div class="button-row"><input type="search" id="search-query" name="query" value="${e(query)}" placeholder="如：平均速度、余数、至少" autocomplete="off"><button class="button primary" type="submit">查找</button></div></form>`+result;
}
function sources(){const list=new Map();for(const u of units)for(const s of u.sources){if(!list.has(s.url))list.set(s.url,{title:s.title,ids:[]});list.get(s.url).ids.push(u.id);}return intro('原理参考资料','中文讲解、练习与图示为原创，以下资料用于核对原理。')+`<div class="card-grid">${[...list.entries()].map(([url,s])=>`<article class="card"><h2>${e(s.title)}</h2><p>${e(s.ids.join('、'))}</p><a href="${e(url)}" target="_blank" rel="noopener noreferrer">打开参考资料 →</a></article>`).join('')}</div>`;}
function notFound(){return empty('这个位置不存在','请从目录重新选择章节或练习。',link('home','回学习首页','button primary'));}
function render(trackVisit=false){
  let raw;try{raw=decodeURI(location.hash.slice(1)||'home');}catch{raw='not-found';}const [path,query='']=raw.split('?');pageParams=new URLSearchParams(query);const [route,id]=path.split('/');currentRoute=route;
  document.body.classList.remove('nav-open');document.getElementById('scrim').hidden=true;document.getElementById('menu-toggle').setAttribute('aria-expanded','false');
  if(trackVisit&&route==='unit'&&unitMap.has(id)&&state.lastUnit!==id){state.lastUnit=id;save();}
  const names={home:'学习首页',unit:'章节学习',practice:'练习中心',wrong:'错题本',quick:'考前速查',downloads:'教材下载',settings:'学习记录与备份',search:'全文查找',quiz:'自测小测',diagnostic:'基础诊断',q:'独立练习',sources:'原理参考'};
  document.getElementById('breadcrumbs').textContent=names[route]||'学习首页';
  document.title=(unitMap.has(id)?id+' '+short(unitMap.get(id)):names[route]||'A1–A24')+' · 数量关系学习站';
  let html='';
  switch(route){case'home':html=home();break;case'unit':html=lesson(id);break;case'practice':html=practice();break;case'wrong':html=wrong();break;case'quiz':html=quiz(id);break;case'diagnostic':html=quiz('diagnostic');break;case'quick':html=quick();break;case'downloads':html=downloads();break;case'settings':html=settings();break;case'search':html=search();break;case'sources':html=sources();break;case'q':{const q=questionMap.get(id);html=q?intro('独立练习 · '+id,'先写关系式，再检查答案。')+questionHtml(q,{notes:true}):notFound();break;}default:html=notFound();}
  main.innerHTML=(storageMessage?`<p class="notice">${e(storageMessage)} ${link('settings','备份记录','button quiet small')}</p>`:'')+html;
  font();updateSidebar();updateQuizSummary();window.scrollTo({top:0});main.focus({preventScroll:true});
}
function clearDraft(id){const r=qstate(id);state.questions[id]={...r,answers:{},updatedAt:now()};save();}
function checkForm(form){const q=questionMap.get(form.dataset.question);if(!q)return;const answers=Object.fromEntries(new FormData(form).entries());const result=recordAttempt(state,q,answers);const box=form.querySelector('.feedback');box.hidden=false;box.className='feedback '+(result.valid?(result.correct?'correct':'incorrect'):'ungraded');box.textContent=result.valid?(result.correct?'答案正确。展开解析核对你的关系式。':'答案还不正确，已加入错题本。先检查条件和单位，再看解析。'):result.fields.filter(f=>!f.valid).map(f=>f.label+'：'+f.message).join(' ');if(result.valid){save();updateSidebar();updateQuizSummary();const card=form.closest('.question-card');card.querySelector('.question-management').outerHTML=questionHtml(q).match(/<div class="button-row question-management">.*?<\/div>/s)[0];}}
main.addEventListener('submit',event=>{event.preventDefault();const form=event.target;if(form.id==='full-search'){nav('search?q='+encodeURIComponent(form.elements.query.value.trim()));return;}if(form.dataset.question)checkForm(form);});
main.addEventListener('input',event=>{
  const input=event.target,form=input.closest('form[data-question]');
  if(form){const id=form.dataset.question,r=qstate(id);state.questions[id]={...r,answers:Object.fromEntries(new FormData(form).entries()),updatedAt:now()};const box=form.querySelector('.feedback');box.hidden=true;save();updateQuizSummary();}
  if(input.dataset.note){const id=input.dataset.note;state.questions[id]={...qstate(id),note:input.value,updatedAt:now()};save();}
});
main.addEventListener('change',async event=>{
  const el=event.target;
  if(el.dataset.filter){const params=new URLSearchParams(pageParams);params.set(el.dataset.filter,el.value);params.delete('page');params.delete('random');nav('practice?'+params);}
  if(el.hasAttribute('data-wrong-filter')){const params=new URLSearchParams(pageParams);params.set('unit',el.value);nav('wrong?'+params);}
  if(el.id==='font-select'){state.preferences.fontSize=Number(el.value);font();save();}
  if(el.id==='exam-date'&&el.value){state.preferences.examDate=el.value;save();toast('考试日期已保存。');}
  if(el.id==='import-file'){
    const file=el.files[0];if(!file)return;const box=document.getElementById('import-result');
    try{if(file.size>2*1024*1024)throw new Error('备份文件过大，请选择本站导出的JSON文件。');const backup=JSON.parse(await file.text());const incoming=sanitizeState(backup.state||backup,unitIds,questionIds);state=mergeState(state,incoming);storageMessage='';save();font();updateSidebar();box.textContent='导入成功，已合并学习进度与错题笔记。';toast('学习记录已合并。');}catch(error){box.textContent='导入未完成：'+error.message;}el.value='';
  }
});
function downloadJson(payload,filename){const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
main.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const id=button.dataset.id,action=button.dataset.action;
  if(action==='read'){state.units[id]={read:!state.units[id]?.read,updatedAt:now()};save();button.setAttribute('aria-pressed',state.units[id].read);button.textContent=state.units[id].read?'✓ 已标记学完':'标记本章学完';updateSidebar();}
  if(action==='mark-early'){for(const id of unitIds.filter(id=>/^A[1-8](?:-\d+)?$/.test(id)))state.units[id]={read:true,updatedAt:now()};state.lastUnit='A9';save();render();toast('A1–A8已标记学完，从A9继续。');}
  if(action==='retry'){clearDraft(id);const old=button.closest('.question-card');old.outerHTML=questionHtml(questionMap.get(id),{notes:currentRoute==='wrong'||currentRoute==='q'});document.getElementById('question-'+id)?.querySelector('input')?.focus({preventScroll:true});updateQuizSummary();}
  if(action==='try-example'){clearDraft(id);nav('q/'+id);}
  if(action==='star'){const r=qstate(id);state.questions[id]={...r,starred:!r.starred,updatedAt:now()};save();button.setAttribute('aria-pressed',!r.starred);button.textContent=!r.starred?'★ 已收藏':'☆ 收藏';}
  if(action==='add-wrong'||action==='resolve'){state.questions[id]={...qstate(id),everWrong:true,wrongActive:action==='add-wrong',updatedAt:now()};save();const card=button.closest('.question-card');card.outerHTML=questionHtml(questionMap.get(id),{notes:currentRoute==='wrong'||currentRoute==='q'});updateSidebar();toast(action==='resolve'?'已移到“已订正”，历史和笔记保留。':'已加入待订正错题。');}
  if(action==='random'){const params=new URLSearchParams(pageParams);params.delete('page');params.set('random',String(Date.now()%4294967295));nav('practice?'+params);}
  if(action==='grade-all'){for(const form of main.querySelectorAll('form[data-question]')){const values=[...new FormData(form).values()];if(values.some(v=>String(v).trim()))checkForm(form);}updateQuizSummary();}
  if(action==='retry-all'){for(const form of main.querySelectorAll('form[data-question]'))clearDraft(form.dataset.question);render();toast('已清空本卷当前输入，历史尝试次数保留。');}
  if(action==='zoom'){const u=unitMap.get(id);document.getElementById('diagram-dialog-title').textContent=id+' '+short(u);document.getElementById('diagram-dialog-body').innerHTML=u.diagram_svg+'<p>'+p(u.diagram_caption)+'</p>';document.getElementById('diagram-dialog').showModal();}
  if(action==='print')window.print();
  if(action==='font-reset'){state.preferences.fontSize=20;save();render();}
  if(action==='export'){const payload={application:'a1a24-study',exportedAt:now(),courseVersion:course.version,state};downloadJson(payload,'A1-A24-learning-'+new Date().toISOString().slice(0,10)+'.json');const box=document.getElementById('export-copy');if(box){box.hidden=false;box.innerHTML='<details><summary>下载不便时，复制备份内容保存</summary><label class="wrong-note">备份内容<textarea id="backup-content" rows="5" readonly>'+e(JSON.stringify(payload,null,2))+'</textarea></label><button class="button secondary small" data-action="select-backup">全选备份内容</button></details>';}toast('已生成备份，请保存浏览器下载的文件。');}
  if(action==='select-backup'){document.getElementById('backup-content')?.select();toast('已全选，可复制到文本文件保存为.json。');}
  if(action==='export-raw'){try{const raw=localStorage.getItem(STORAGE_KEY);downloadJson(raw?JSON.parse(raw):state,'A1-A24-raw-backup.json');}catch{toast('本机原始记录不可读取，请导出本次学习记录。');}}
  if(action==='clear'&&confirm('确定清空当前浏览器的全部学习记录？请先导出备份。其他设备和已下载的备份不会受影响。')){state=blankState();storageMessage='';save();render();toast('本机学习记录已清空。');}
});
document.getElementById('nav-search').addEventListener('input',updateSidebar);
document.getElementById('font-minus').addEventListener('click',()=>{state.preferences.fontSize=Math.max(16,state.preferences.fontSize-2);font();save();});
document.getElementById('font-plus').addEventListener('click',()=>{state.preferences.fontSize=Math.min(30,state.preferences.fontSize+2);font();save();});
function toggleNav(){const open=document.body.classList.toggle('nav-open');document.getElementById('menu-toggle').setAttribute('aria-expanded',open);document.getElementById('scrim').hidden=!open;}
document.getElementById('menu-toggle').addEventListener('click',toggleNav);document.getElementById('scrim').addEventListener('click',toggleNav);
document.getElementById('close-diagram').addEventListener('click',()=>document.getElementById('diagram-dialog').close());
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('nav-open'))toggleNav();if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();nav('search');setTimeout(()=>document.getElementById('search-query')?.focus(),0);}});
window.addEventListener('hashchange',()=>render(true));
window.addEventListener('storage',event=>{if(event.key!==STORAGE_KEY)return;try{state=event.newValue?sanitizeState(JSON.parse(event.newValue),unitIds,questionIds):blankState();font();updateSidebar();updateQuizSummary();}catch{toast('另一标签页的记录无法读取，请检查备份。');}});
render(true);
if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='127.0.0.1'||location.hostname==='localhost'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
