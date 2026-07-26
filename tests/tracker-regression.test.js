const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const trackerPath=path.resolve(__dirname,'..','index.html');
const html=fs.readFileSync(trackerPath,'utf8');
const source=html.slice(html.indexOf('<script>')+8,html.lastIndexOf('</script>'));
let uuid=0;
const stored={};
const urlMutations=[];
const alerts=[];
const elements={storageStatus:{textContent:'',classList:{toggle(){}}}};
const context={
  console,
  crypto:{randomUUID:()=>`test-uuid-${++uuid}`},
  location:{href:'https://tracker.example.test/?view=day#unchanged',hash:'#unchanged',pathname:'/',search:'?view=day'},
  history:{replaceState(...args){urlMutations.push(args);},pushState(...args){urlMutations.push(args);}},
  localStorage:{getItem:key=>stored[key]??null,setItem:(key,value)=>{stored[key]=value;},removeItem:key=>delete stored[key]},
  document:{addEventListener(){},getElementById:id=>elements[id]||null,querySelectorAll:()=>[]},
  confirm:()=>true,
  alert(message){alerts.push(message);}
};
context.window=context;
vm.createContext(context);
vm.runInContext(source,context);

function run(expression){return JSON.parse(JSON.stringify(vm.runInContext(expression,context)));}
function setState(value){context.testState=value;vm.runInContext('state=testState',context);}
function accountState(overrides={}){return {schemaVersion:1,foods:[],oneOffFoods:[],entries:[],exercises:[],dailyWeights:[],profile:{sex:'male',age:0,feet:0,inches:0,weight:0,goalWeight:0,activity:1.2,plan:0,manualMaintenance:0},...overrides};}
function boundaryContext(initialValue){
  const data={};if(initialValue!==undefined)data['nutritionTracker.rebuild.v1']=initialValue;
  let writes=0;
  const notice={visible:false,classList:{remove(name){if(name==='hide')notice.visible=true;},add(name){if(name==='hide')notice.visible=false;}}};
  const status={textContent:'',classList:{toggle(){}}};
  const sandbox={console,crypto:{randomUUID:()=>`boundary-${++uuid}`},localStorage:{getItem:key=>data[key]??null,setItem(key,value){writes++;data[key]=value;},removeItem:key=>delete data[key]},document:{addEventListener(){},getElementById:id=>id==='incompatibleStateNotice'?notice:(id==='storageStatus'?status:null)},location:{hash:'',search:'',href:'https://tracker.example.test/'},history:{replaceState(){},pushState(){}},alert(){},confirm:()=>true};
  sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(source,sandbox);
  return {sandbox,data,notice,status,get writes(){return writes;}};
}

// Current state loads normally; unversioned state is neither accepted nor overwritten before acknowledgment.
const currentLocal=accountState({entries:[{id:'current',date:'2026-07-01',servings:1,food:{name:'Current Food',calories:80}}]});
let boundary=boundaryContext(JSON.stringify(currentLocal));
assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext(`({blocked:automaticSavesBlocked,incompatible:incompatibleStoredState,entries:state.entries.length})`,boundary.sandbox))),{blocked:false,incompatible:false,entries:1});

const incompatibleRaw=JSON.stringify({foods:[{name:'Old Custom',custom:true}],entries:[{id:'old-entry'}],exercises:[{id:'old-exercise'}],profile:{weight:199},oldPrivateMarker:'must-not-migrate'});
boundary=boundaryContext(incompatibleRaw);
assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext(`({blocked:automaticSavesBlocked,incompatible:incompatibleStoredState,entries:state.entries.length,foods:state.foods.filter(f=>f.custom).length})`,boundary.sandbox))),{blocked:true,incompatible:true,entries:0,foods:0});
assert.strictEqual(boundary.writes,0);
assert.strictEqual(vm.runInContext('persistInitialState()',boundary.sandbox),false);
assert.strictEqual(boundary.writes,0);
assert.strictEqual(boundary.data['nutritionTracker.rebuild.v1'],incompatibleRaw);
assert.strictEqual(boundary.notice.visible,true);
assert.ok(html.includes('Older browser-local Tracker data is not carried forward.'));
vm.runInContext('init=()=>{}',boundary.sandbox);
assert.strictEqual(vm.runInContext('acknowledgeIncompatibleStateReset()',boundary.sandbox),true);
assert.strictEqual(boundary.writes,1);
const acknowledged=JSON.parse(boundary.data['nutritionTracker.rebuild.v1']);
assert.strictEqual(acknowledged.schemaVersion,1);
assert.deepStrictEqual({entries:acknowledged.entries,exercises:acknowledged.exercises,weights:acknowledged.dailyWeights,foods:acknowledged.foods,oneOff:acknowledged.oneOffFoods},{entries:[],exercises:[],weights:[],foods:[],oneOff:[]});
assert.ok(!JSON.stringify(acknowledged).includes('must-not-migrate'));
assert.strictEqual(boundary.notice.visible,false);
const reloadedBoundary=boundaryContext(boundary.data['nutritionTracker.rebuild.v1']);
assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext(`({blocked:automaticSavesBlocked,incompatible:incompatibleStoredState,schema:getTrackerState().schemaVersion})`,reloadedBoundary.sandbox))),{blocked:false,incompatible:false,schema:1});

// A fresh browser has catalogs and neutral placeholders, but no user history or user-created foods.
assert.deepStrictEqual(run(`(()=>{const s=createEmptyTrackerState();return {builtInFoods:s.foods.length,customFoods:s.foods.filter(f=>f.custom).length,oneOff:s.oneOffFoods.length,entries:s.entries.length,exercises:s.exercises.length,weights:s.dailyWeights.length,profile:s.profile};})()`),{builtInFoods:138,customFoods:0,oneOff:0,entries:0,exercises:0,weights:0,profile:accountState().profile});
assert.strictEqual(run('RECIPE_DATA.length'),15);
assert.strictEqual(run('CDC_EXERCISES.length'),20);

// The Stage 2 boundary returns current user state and applies a valid state while ignoring unknown fields.
setState(run('createEmptyTrackerState()'));
assert.deepStrictEqual(run('getTrackerState()'),accountState());
context.incoming=accountState({entries:[{id:'food-1',date:'2026-07-01',servings:2,food:{name:'Test Food',calories:100,unknownFoodField:'ignored'},unknownEntryField:'ignored'}],exercises:[{id:'walk-1',date:'2026-07-01',name:'Walking',minutes:30,calories:120,unknownExerciseField:'ignored'}],dailyWeights:[{date:'2026-07-01',weight:150,unknownWeightField:'ignored'}],profile:{...accountState().profile,age:40,weight:150,unknownProfileField:'ignored'},unknownCollection:[{private:'ignored'}]});
assert.strictEqual(run('applyTrackerState(incoming)'),true);
assert.deepStrictEqual(run(`(()=>{const s=getTrackerState();return {entry:s.entries[0].food.name,exercise:s.exercises[0].name,weight:s.dailyWeights[0].weight,age:s.profile.age,unknown:Object.prototype.hasOwnProperty.call(s,'unknownCollection')||Object.prototype.hasOwnProperty.call(s.entries[0],'unknownEntryField')||Object.prototype.hasOwnProperty.call(s.entries[0].food,'unknownFoodField')||Object.prototype.hasOwnProperty.call(s.exercises[0],'unknownExerciseField')||Object.prototype.hasOwnProperty.call(s.dailyWeights[0],'unknownWeightField')||Object.prototype.hasOwnProperty.call(s.profile,'unknownProfileField')};})()`),{entry:'Test Food',exercise:'Walking',weight:150,age:40,unknown:false});
context.invalid={foods:[],entries:[],exercises:[],profile:{}};
assert.strictEqual(run('applyTrackerState(invalid)'),false);

// Food and standard exercise logging records remain functional.
setState(run('createEmptyTrackerState()'));
context.testFood={name:'Logged Food',calories:125,custom:false};
run(`state.entries.push({id:'entry-1',date:'2026-07-02',servings:2,food:testFood})`);
assert.strictEqual(run(`totalsForDate('2026-07-02').calories`),250);
assert.deepStrictEqual(run(`(()=>{const e=addStandardExerciseRecord({name:'Walking',category:'Moderate'},'2026-07-02','09:30',30,140,true);return {name:e.name,minutes:e.minutes,calories:e.calories};})()`),{name:'Walking',minutes:30,calories:140});

// Profile and weight values save into the current state boundary.
run(`state.profile={...state.profile,age:55,weight:149};state.dailyWeights=[{date:'2026-07-02',weight:149}]`);
assert.deepStrictEqual(run(`(()=>{const s=getTrackerState();return {age:s.profile.age,profileWeight:s.profile.weight,dailyWeight:s.dailyWeights[0].weight};})()`),{age:55,profileWeight:149,dailyWeight:149});

// Copy Day copies only normal current food/exercise entries.
assert.deepStrictEqual(run(`(()=>{const result=copyDayRecords('2026-07-02','2026-07-03','replace');return {foods:result.copiedEntries.length,exercises:result.copiedExercises.length,toFoods:state.entries.filter(e=>e.date==='2026-07-03').length,toExercises:state.exercises.filter(e=>e.date==='2026-07-03').length};})()`),{foods:1,exercises:1,toFoods:1,toExercises:1});

// Reset Day and Reset App preserve catalogs while clearing browser-local activity.
context.selectedDate=()=> '2026-07-03';
context.render=()=>{};
context.init=()=>{};
assert.strictEqual(run(`(()=>{clearDay();return state.entries.some(e=>e.date==='2026-07-03')||state.exercises.some(e=>e.date==='2026-07-03');})()`),false);
assert.strictEqual(run('(()=>{resetAll();return true;})()'),true);
assert.deepStrictEqual(run(`(()=>({foods:state.foods.length,custom:state.foods.filter(f=>f.custom).length,oneOff:state.oneOffFoods.length,entries:state.entries.length,exercises:state.exercises.length,weights:state.dailyWeights.length}))()`),{foods:138,custom:0,oneOff:0,entries:0,exercises:0,weights:0});

// Browser-local state survives save/reload and never changes URL/history fields.
setState(run('createEmptyTrackerState()'));
run(`state.entries=[{id:'persisted',date:'2026-07-04',servings:1,food:{name:'Persisted Food',calories:90}}];state.exercises=[{id:'persisted-walk',date:'2026-07-04',name:'Walking',minutes:20,calories:80}];state.profile={...state.profile,age:45}`);
const originalUrl=JSON.parse(JSON.stringify(context.location));
assert.strictEqual(run('save()'),true);
setState(run('createEmptyTrackerState()'));
setState(run('loadState()'));
assert.deepStrictEqual(run(`(()=>({food:state.entries[0].food.name,exercise:state.exercises[0].name,age:state.profile.age}))()`),{food:'Persisted Food',exercise:'Walking',age:45});
assert.deepStrictEqual(context.location,originalUrl);
assert.strictEqual(urlMutations.length,0);

// Retained food and reporting modules remain present and their calculation functions remain callable.
for(const id of ['foodHubScreen','statsScreen','dailyTotalsScreen','breakdownScreen','foodsScreen','recipesScreen']) assert.ok(html.includes(`id="${id}"`),`missing retained module: ${id}`);
assert.deepStrictEqual(run(`({renderStats:typeof renderStats,renderBreakdown:typeof renderDailyBreakdown,totals:typeof totalsForDate})`),{renderStats:'function',renderBreakdown:'function',totals:'function'});
setState(accountState({entries:[{id:'nutrients',date:'2026-07-10',servings:2,food:{name:'Nutrient Food',calories:100,protein:12,fiber:3,vitC:8}}]}));
assert.deepStrictEqual(run(`(()=>{const t=totalsForDate('2026-07-10');return {calories:t.calories,protein:t.protein,fiber:t.fiber,vitC:t.vitC};})()`),{calories:200,protein:24,fiber:6,vitC:16});

// Removed controls, file-transfer APIs, and removed workout module identifiers stay absent.
const forbidden=[
  ['Planet','Fitness'].join(' '),['planet','Fitness'].join(''),['pf','Workout'].join(''),['pf','Workouts'].join(''),['pf','Machine'].join(''),['workout','Id'].join(''),
  ['Export','Backup'].join(' '),['Import','Backup'].join(' '),['import','File'].join(''),['File','Reader'].join(''),['JSON','backup'].join(' ')
];
for(const term of [['Micronutrient','Optimizer'].join(' '),['micronutrient','Optimizer'].join(''),['optimizer','Plan'].join(''),['optimizer','Max'].join(''),['optimizer','Include'].join(''),['optimizer','Exclude'].join(''),['run','Optimizer'].join(''),['optimizer','Results'].join(''),['optimizer','Summary'].join(''),['optimizer','AddAll'].join('')]) forbidden.push(term);
for(const term of forbidden) assert.ok(!html.includes(term),`removed term remains: ${term}`);
assert.ok(!html.includes('type="file"'));
assert.ok(!source.includes('createObjectURL'));
assert.ok(!source.includes('.download='));

console.log('Tracker regression tests: PASS (retained nutrition reports, clean state, account boundary, local persistence, logging, copy/reset, removal scans)');
