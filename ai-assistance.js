(()=>{
'use strict';
function loadCore(done){
 const script=document.createElement('script');
 script.src='ai-assistance-core.js';
 script.async=false;
 script.onload=done;
 script.onerror=()=>console.error('Nutrition Tracker AI core failed to load.');
 document.head.appendChild(script);
}
function installAnalyzeMenu(){
 if(document.getElementById('aiAnalyzeMenuMenuBtn'))return;
 const grid=document.querySelector('#aiAssistanceScreen .moduleGrid');
 const main=document.querySelector('main');
 if(!grid||!main)return;
 const button=document.createElement('button');
 button.className='moduleBtn';
 button.id='aiAnalyzeMenuMenuBtn';
 button.type='button';
 button.innerHTML='Analyze Menu<span>Copy a date range from Today\'s Menu to ChatGPT and ask questions about it.</span>';
 grid.appendChild(button);
 const screen=document.createElement('section');
 screen.className='screen aiAssist';
 screen.id='aiAnalyzeMenuScreen';
 screen.innerHTML=`<div class="card"><p class="breadcrumb"><button class="secondary" id="aiAnalyzeMenuBackBtn" type="button">← AI Assistance</button></p><h2>Analyze Menu with ChatGPT</h2><p class="aiPrivacy">Choose a range from Today’s Menu and ask any question about the copied menu data. Nutrition Tracker uses your own ChatGPT account and does not send the data through an OpenAI API.</p><div class="dateRow"><div><label for="aiAnalyzeMenuStart">Start date</label><input id="aiAnalyzeMenuStart" type="date"/></div><div><label for="aiAnalyzeMenuEnd">End date</label><input id="aiAnalyzeMenuEnd" type="date"/></div></div><label for="aiAnalyzeMenuQuestion">What do you want to ask AI about this menu?</label><textarea id="aiAnalyzeMenuQuestion" placeholder="Examples: Am I meeting my protein and fiber targets? What nutrients are consistently low? How could I lower saturated fat without reducing protein?"></textarea><div class="actions"><button id="aiAnalyzeMenuCopyBtn" type="button">Copy ChatGPT Instructions</button><button id="aiAnalyzeMenuOpenBtn" type="button">Open ChatGPT</button></div><div class="aiStatus" id="aiAnalyzeMenuStatus" role="status" aria-live="polite"></div><div id="aiAnalyzeMenuPromptPanel" class="hide"><label for="aiAnalyzeMenuPrompt">Generated ChatGPT Instructions</label><textarea id="aiAnalyzeMenuPrompt" readonly spellcheck="false" autocapitalize="off" autocomplete="off"></textarea><div class="actions"><button class="secondary" id="aiAnalyzeMenuSelectBtn" type="button">Select Instructions</button></div></div></div>`;
 main.appendChild(screen);
 const byId=id=>document.getElementById(id);
 const dateParts=value=>{const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),dt=new Date(y,mo-1,d);return dt.getFullYear()===y&&dt.getMonth()===mo-1&&dt.getDate()===d?{y,mo,d}:null;};
 const ordinal=value=>{const p=dateParts(value);return p?new Date(p.y,p.mo-1,p.d).getTime():null;};
 const dates=(start,end)=>{const a=dateParts(start),b=dateParts(end);if(!a||!b)return [];const cur=new Date(a.y,a.mo-1,a.d),last=new Date(b.y,b.mo-1,b.d),out=[];while(cur<=last){out.push(`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`);cur.setDate(cur.getDate()+1);}return out;};
 const numberOrZero=v=>{const x=Number(v);return Number.isFinite(x)?x:0;};
 const status=(message,error=false)=>{const el=byId('aiAnalyzeMenuStatus');if(el){el.textContent=message;el.classList.toggle('error',error);}return false;};
 const currentDate=()=>typeof selectedDate==='function'&&document.getElementById('date')?selectedDate():(typeof today==='function'?today():new Date().toISOString().slice(0,10));
 const start=byId('aiAnalyzeMenuStart'),end=byId('aiAnalyzeMenuEnd');
 start.value=currentDate();end.value=start.value;
 function menuSnapshot(startDate,endDate){
  const selected=dates(startDate,endDate),keyList=typeof KEYS!=='undefined'?KEYS:['calories','protein','collagenProtein','carbs','fat','fiber','sugar','glycemicLoad','sodium','potassium','calcium','iron','magnesium','phosphorus','zinc','copper','manganese','selenium','vitaminA','vitaminC','vitaminD','vitaminE','vitaminK','thiamin','riboflavin','niacin','pantothenicAcid','vitaminB6','biotin','folate','vitaminB12','choline','iodine','omega3','omega6','cholesterol','saturatedFat','monounsaturatedFat','polyunsaturatedFat'];
  return selected.map(date=>{
   const entries=(state.entries||[]).filter(e=>e&&e.date===date).sort((a,b)=>numberOrZero(a.order)-numberOrZero(b.order));
   const totals=Object.fromEntries(keyList.map(k=>[k,0]));
   const items=entries.map(e=>{
    const food=e.food||{},servings=numberOrZero(e.servings)||1,nutrients={};
    keyList.forEach(k=>{const perServing=numberOrZero(food[k]);nutrients[k]=perServing*servings;totals[k]+=nutrients[k];});
    return {group:String(e.group||''),name:String(food.name||''),serving:String(food.serving||''),servings,eaten:e.eaten===true,nutrients};
   });
   return {date,items,totals};
  });
 }
 function buildPrompt(){
  const startDate=start.value,endDate=end.value,question=String(byId('aiAnalyzeMenuQuestion').value||'').trim();
  if(!dateParts(startDate))throw new Error('Choose a valid start date.');
  if(!dateParts(endDate))throw new Error('Choose a valid end date.');
  if(ordinal(endDate)<ordinal(startDate))throw new Error('End date cannot be before start date.');
  const selected=dates(startDate,endDate);if(selected.length>31)throw new Error('Menu analysis is limited to 31 inclusive days at a time.');
  if(!question)throw new Error('Enter a question for AI about the selected menu range.');
  const menu=menuSnapshot(startDate,endDate),loggedDays=menu.filter(day=>day.items.length);
  if(!loggedDays.length)throw new Error('There are no Today’s Menu entries in the selected date range.');
  const targets=typeof profileCalc==='function'?profileCalc():{};
  return `Analyze the Nutrition Tracker Today’s Menu data below and answer the user’s question directly. Use the supplied tracked values as the primary evidence. You may use general nutrition knowledge when needed, but clearly distinguish general guidance from values actually present in the tracker. Do not invent foods, servings, nutrient values, diagnoses, or tracker records. Do not alter or propose an import package unless the user specifically asks for one. For multi-day ranges, identify meaningful patterns and day-to-day variation.\n\nSelected date range: ${startDate} through ${endDate}\nUser question: ${question}\n\nNutrition targets JSON:\n${JSON.stringify(targets,null,2)}\n\nToday’s Menu JSON:\n${JSON.stringify(menu,null,2)}`;
 }
 async function copy(openAfter){
  let prompt;
  try{prompt=buildPrompt();}catch(error){return status(error.message,true);}
  byId('aiAnalyzeMenuPrompt').value=prompt;byId('aiAnalyzeMenuPromptPanel').classList.remove('hide');
  if(openAfter)window.open('https://chatgpt.com/','_blank','noopener,noreferrer');
  try{
   if(window.NutritionTrackerAI&&typeof window.NutritionTrackerAI.copyTextToClipboard==='function')await window.NutritionTrackerAI.copyTextToClipboard(prompt);else await navigator.clipboard.writeText(prompt);
   status('Menu range and question copied successfully.');
   return prompt;
  }catch(_e){status('Automatic copying was blocked. Select and copy the generated instructions below.',true);return false;}
 }
 button.addEventListener('click',()=>showScreen('aiAnalyzeMenuScreen'));
 byId('aiAnalyzeMenuBackBtn').addEventListener('click',()=>showScreen('aiAssistanceScreen'));
 byId('aiAnalyzeMenuCopyBtn').addEventListener('click',()=>copy(false));
 byId('aiAnalyzeMenuOpenBtn').addEventListener('click',()=>copy(true));
 byId('aiAnalyzeMenuSelectBtn').addEventListener('click',()=>{const el=byId('aiAnalyzeMenuPrompt');el.focus();el.select();el.setSelectionRange?.(0,el.value.length);status('Instructions selected. Copy them manually.');});
}
function start(){loadCore(()=>{if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installAnalyzeMenu,{once:true});else installAnalyzeMenu();});}
start();
})();
