const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const trackerPath=path.resolve(__dirname,'..','index.html');
const html=fs.readFileSync(trackerPath,'utf8');
const scriptStart=html.indexOf('<script>')+8;
const source=html.slice(scriptStart,html.indexOf('</script>',scriptStart));
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
  document:{body:{classList:{contains(){return false;}}},addEventListener(){},getElementById:id=>elements[id]||null,querySelectorAll:()=>[]},
  setTimeout(){return 1;},
  clearTimeout(){},
  confirm:()=>true,
  alert(message){alerts.push(message);}
};
context.window=context;
vm.createContext(context);
vm.runInContext(source,context);

function run(expression){return JSON.parse(JSON.stringify(vm.runInContext(expression,context)));}
function setState(value){context.testState=value;vm.runInContext('state=testState',context);}
function accountState(overrides={}){return {schemaVersion:1,foods:[],recipes:[],oneOffFoods:[],entries:[],exercises:[],dailyWeights:[],profile:{sex:'male',age:0,feet:0,inches:0,weight:0,goalWeight:0,activity:1.2,plan:0,manualMaintenance:0},workoutDefinitions:{},workoutLogs:{},customExercises:{},activityLogs:{},customActivities:{},...overrides};}
function boundaryContext(initialValue){
  const data={};if(initialValue!==undefined)data['nutritionTracker.rebuild.v1']=initialValue;
  let writes=0;
  const notice={visible:false,classList:{remove(name){if(name==='hide')notice.visible=true;},add(name){if(name==='hide')notice.visible=false;}}};
  const status={textContent:'',classList:{toggle(){}}};
  const sandbox={console,crypto:{randomUUID:()=>`boundary-${++uuid}`},localStorage:{getItem:key=>data[key]??null,setItem(key,value){writes++;data[key]=value;},removeItem:key=>delete data[key]},document:{addEventListener(){},getElementById:id=>id==='incompatibleStateNotice'?notice:(id==='storageStatus'?status:null)},location:{hash:'',search:'',href:'https://tracker.example.test/'},history:{replaceState(){},pushState(){}},alert(){},confirm:()=>true};
  sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(source,sandbox);
  return {sandbox,data,notice,status,get writes(){return writes;}};
}

// Signed-out startup never loads or overwrites old unscoped Stage 1 browser data.
const currentLocal=accountState({entries:[{id:'current',date:'2026-07-01',servings:1,food:{name:'Current Food',calories:80}}]});
let boundary=boundaryContext(JSON.stringify(currentLocal));
assert.deepStrictEqual(JSON.parse(JSON.stringify(vm.runInContext(`({blocked:automaticSavesBlocked,incompatible:incompatibleStoredState,entries:state.entries.length})`,boundary.sandbox))),{blocked:false,incompatible:false,entries:0});
assert.strictEqual(boundary.writes,0);
assert.strictEqual(boundary.data['nutritionTracker.rebuild.v1'],JSON.stringify(currentLocal));

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

// Older valid account states safely gain workout collections without resetting food or profile data.
context.legacyAccount={schemaVersion:1,foods:[],oneOffFoods:[],entries:[{id:'legacy-food',date:'2026-07-01',servings:1,food:{name:'Preserved Food'}}],exercises:[],dailyWeights:[],profile:accountState().profile};
assert.strictEqual(run('applyTrackerState(legacyAccount)'),true);
assert.deepStrictEqual(run(`(()=>({food:state.entries[0].food.name,workouts:state.workoutDefinitions,logs:state.workoutLogs,activities:state.activityLogs}))()`),{food:'Preserved Food',workouts:{},logs:{},activities:{}});

// Daily exercise calories combine legacy entries, completed workout calories, and activities once.
setState(accountState({profile:{...accountState().profile,weight:154},exercises:[{id:'legacy',date:'2026-07-09',name:'Legacy Walk',minutes:30,calories:100,done:true}],workoutLogs:{'2026-07-09':{date:'2026-07-09',bodyWeight:154,minutes:60,intensity:4,exercises:[{name:'Rows',duration:60,met:4,sets:[{done:true},{done:false}]}]}},activityLogs:{'2026-07-09':[{id:'activity',name:'Yard work',met:4,minutes:30,weight:154}]}}));
assert.strictEqual(Math.round(run("exerciseForDate('2026-07-09')")),393);

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

// Signed-out saves are refused and never move personal data into URL/history or unscoped storage.
setState(run('createEmptyTrackerState()'));
run(`state.entries=[{id:'persisted',date:'2026-07-04',servings:1,food:{name:'Persisted Food',calories:90}}];state.exercises=[{id:'persisted-walk',date:'2026-07-04',name:'Walking',minutes:20,calories:80}];state.profile={...state.profile,age:45}`);
const originalUrl=JSON.parse(JSON.stringify(context.location));
assert.strictEqual(run('save()'),false);
assert.strictEqual(stored['nutritionTracker.rebuild.v1'],undefined);
assert.deepStrictEqual(context.location,originalUrl);
assert.strictEqual(urlMutations.length,0);

// Retained food and reporting modules remain present and their calculation functions remain callable.
for(const id of ['foodHubScreen','statsScreen','dailyTotalsScreen','breakdownScreen','foodsScreen','recipesScreen']) assert.ok(html.includes(`id="${id}"`),`missing retained module: ${id}`);
assert.deepStrictEqual(run(`({renderStats:typeof renderStats,renderBreakdown:typeof renderDailyBreakdown,totals:typeof totalsForDate})`),{renderStats:'function',renderBreakdown:'function',totals:'function'});
setState(accountState({entries:[{id:'nutrients',date:'2026-07-10',servings:2,food:{name:'Nutrient Food',calories:100,protein:12,fiber:3,vitC:8}}]}));
assert.deepStrictEqual(run(`(()=>{const t=totalsForDate('2026-07-10');return {calories:t.calories,protein:t.protein,fiber:t.fiber,vitC:t.vitC};})()`),{calories:200,protein:24,fiber:6,vitC:16});
assert.ok(html.includes('data-screen="trackerSummaryScreen"'));
assert.ok(html.includes('id="trackerSummaryScreen"'));
assert.ok(html.includes('Tracker Summary'));
assert.deepStrictEqual(run(`typeof buildTrackerSummaryReport`),'function');

// User recipes can be deleted with confirmation, persist through the account boundary, and built-in recipes are protected.
function recipeDom(selectedValue){
  const recipeSelect={value:String(selectedValue),innerHTML:'',onchange:null};
  const recipeDetails={innerHTML:''};
  const recipePrintChoices={innerHTML:''};
  const deleteRecipeBtn={disabled:null,hidden:false,classList:{toggle(name,on){if(name==='hide')deleteRecipeBtn.hidden=!!on;}}};
  return {recipeSelect,recipeDetails,recipePrintChoices,deleteRecipeBtn};
}
const userRecipes=[
  {id:'recipe-1',name:'Delete Me',category:'Other',yield:'1 serving',serving:'1 bowl',foodName:'Delete Me Food',ingredients:['1 cup test food'],directions:['Mix.'],nutrition:{calories:100}},
  {id:'recipe-2',name:'Keep Me',category:'Other',yield:'2 servings',serving:'1 plate',foodName:'Keep Me Food',ingredients:['2 cups test food'],directions:['Bake.'],nutrition:{calories:200}}
];
let dom=recipeDom(run('RECIPE_DATA.length'));
let confirmMessages=[];
let persistedState=null;
context.document.getElementById=id=>dom[id]||elements[id]||null;
context.trackerAccountStateChanged=()=>{persistedState=JSON.parse(JSON.stringify(vm.runInContext('getTrackerState()',context)));return true;};
context.confirm=message=>{confirmMessages.push(message);return false;};
setState(accountState({recipes:JSON.parse(JSON.stringify(userRecipes))}));
run('(()=>{deleteSelectedRecipe();return true;})()');
assert.deepStrictEqual(run('state.recipes.map(r=>r.name)'),['Delete Me','Keep Me']);
assert.deepStrictEqual(confirmMessages,[`Are you sure you want to delete ‘Delete Me’? This cannot be undone.`]);
assert.strictEqual(persistedState,null);

dom=recipeDom(run('RECIPE_DATA.length'));
context.document.getElementById=id=>dom[id]||elements[id]||null;
context.confirm=message=>{confirmMessages.push(message);return true;};
confirmMessages=[];
persistedState=null;
setState(accountState({recipes:JSON.parse(JSON.stringify(userRecipes))}));
run('(()=>{deleteSelectedRecipe();return true;})()');
assert.deepStrictEqual(run('state.recipes.map(r=>r.name)'),['Keep Me']);
assert.deepStrictEqual(persistedState.recipes.map(r=>r.name),['Keep Me']);
assert.strictEqual(dom.recipeSelect.value,'');
assert.ok(dom.recipeDetails.innerHTML.includes('Choose a recipe to view details.'));
assert.ok(!dom.recipePrintChoices.innerHTML.includes('Delete Me'));
assert.ok(dom.recipePrintChoices.innerHTML.includes('Keep Me'));
assert.strictEqual(dom.deleteRecipeBtn.disabled,true);
assert.strictEqual(dom.deleteRecipeBtn.hidden,true);

dom=recipeDom(0);
context.document.getElementById=id=>dom[id]||elements[id]||null;
context.confirm=message=>{confirmMessages.push(message);return true;};
confirmMessages=[];
alerts.length=0;
setState(accountState({recipes:JSON.parse(JSON.stringify(userRecipes))}));
run('(()=>{deleteSelectedRecipe();return true;})()');
assert.deepStrictEqual(run('state.recipes.map(r=>r.name)'),['Delete Me','Keep Me']);
assert.deepStrictEqual(confirmMessages,[]);
assert.deepStrictEqual(alerts.slice(-1),['Built-in recipes cannot be deleted.']);
assert.ok(html.includes('id="deleteRecipeBtn" type="button">Delete Recipe</button>'));
context.document.getElementById=id=>elements[id]||null;
context.confirm=()=>true;

// Tracker Summary filters by local date strings and groups saved days without counting missing days as zero.
setState(accountState({
  profile:{...accountState().profile,manualMaintenance:2000,weight:154},
  entries:[
    {id:'outside',date:'2026-12-01',servings:1,food:{name:'Outside',calories:999,protein:9,fat:9,carbs:9,fiber:1,sodium:9,vitC:9}},
    {id:'d1',date:'2026-12-31',servings:1,food:{name:'Day 1',calories:1500,protein:100,fat:50,carbs:80,fiber:20,sodium:100,vitC:10}},
    {id:'d2',date:'2027-01-02',servings:1,food:{name:'Day 2',calories:1000,protein:50,fat:30,carbs:40,fiber:10,sodium:50,vitC:20}},
    {id:'d3',date:'2027-01-15',servings:1,food:{name:'Day 3',calories:800,protein:20,fat:10,carbs:20,fiber:5,sodium:25,vitC:5}}
  ],
  exercises:[
    {id:'ex1',date:'2026-12-31',name:'Walk',minutes:30,calories:300,done:true},
    {id:'ex2',date:'2027-01-02',name:'Skipped',minutes:30,calories:999,done:false}
  ],
  workoutLogs:{'2027-01-02':{date:'2027-01-02',totalExerciseCalories:200}}
}));
const daySummary=run(`buildTrackerSummaryReport('2026-12-31','2027-01-02','day')`);
assert.deepStrictEqual(daySummary.periods.map(p=>p.key),['2026-12-31','2027-01-02']);
assert.deepStrictEqual(daySummary.periods.map(p=>p.loggedDays),[1,1]);
assert.deepStrictEqual(daySummary.periods.map(p=>p.macroAverages.netCarbs),[60,30]);
assert.deepStrictEqual(daySummary.periods.map(p=>p.microAverages.vitC),[10,20]);
assert.deepStrictEqual(daySummary.periods.map(p=>p.calories),[1500,1000]);
assert.deepStrictEqual(daySummary.periods.map(p=>p.exercise),[300,200]);
assert.deepStrictEqual(daySummary.periods.map(p=>p.balance),[-800,-1200]);
assert.strictEqual(run(`formatTrackerSummaryBalance(-800)`),'800 kcal Deficit');
assert.strictEqual(run(`formatTrackerSummaryBalance(250)`),'250 kcal Surplus');

const weekSummary=run(`buildTrackerSummaryReport('2026-12-31','2027-01-02','week')`);
assert.deepStrictEqual(weekSummary.periods.map(p=>p.key),['2026-12-27']);
assert.strictEqual(weekSummary.periods[0].label.includes('2027'),true);
assert.strictEqual(weekSummary.periods[0].loggedDays,2);
assert.strictEqual(weekSummary.periods[0].calories,2500);
assert.strictEqual(weekSummary.periods[0].exercise,500);
assert.strictEqual(weekSummary.periods[0].balance,-2000);
assert.strictEqual(weekSummary.periods[0].macroAverages.protein,75);
assert.strictEqual(weekSummary.periods[0].macroAverages.netCarbs,45);
assert.strictEqual(weekSummary.periods[0].microAverages.sodium,75);

const monthSummary=run(`buildTrackerSummaryReport('2026-12-31','2027-01-31','month')`);
assert.deepStrictEqual(monthSummary.periods.map(p=>p.key),['2026-12-01','2027-01-01']);
assert.deepStrictEqual(monthSummary.periods.map(p=>p.loggedDays),[1,2]);
assert.strictEqual(monthSummary.periods[1].calories,1800);
assert.strictEqual(monthSummary.periods[1].macroAverages.protein,35);
assert.strictEqual(monthSummary.periods[1].macroAverages.netCarbs,22.5);
assert.strictEqual(monthSummary.periods[1].microAverages.vitC,12.5);
assert.deepStrictEqual(run(`trackerSummaryDefaultRange()`),{start:'2026-12-31',end:'2027-01-15'});
assert.deepStrictEqual(run(`buildTrackerSummaryReport('2027-02-01','2027-02-28','day')`).empty,true);
assert.strictEqual(run(`buildTrackerSummaryReport('2027-02-02','2027-02-01','day').error`),'End Date cannot be earlier than Start Date.');
assert.strictEqual(run(`addLocalDays('2027-01-01',-1)`),'2026-12-31');
assert.strictEqual(run(`trackerSummaryPeriodForDate('2027-01-01','week').key`),'2026-12-27');
assert.strictEqual(run(`(()=>{const r=buildTrackerSummaryReport('2026-12-31','2027-01-02','week');return Object.prototype.hasOwnProperty.call(r.periods[0].microAverages,'vitC')&&Object.prototype.hasOwnProperty.call(r.periods[0].microAverages,'b12');})()`),true);

// Recipe instructions migrate from aliases, survive export/import, render, print, and tolerate missing directions.
const honeyNotes='Cooking instructions: Line a small tray or plate with parchment paper. Combine the honey, ground ginger, and water in a small heavy-bottomed saucepan. Heat over medium-low heat, stirring until evenly blended. Bring to a gentle boil, then cook without vigorous stirring until the mixture reaches 300°F (149°C), the hard-crack stage, on a candy thermometer. Remove from the heat immediately and allow the bubbling to settle briefly. Carefully spoon small portions onto the parchment or pour into heat-safe silicone candy molds. Cool completely until firm, then remove and store in an airtight container with parchment between layers. Hot honey syrup can cause severe burns; do not touch or taste it until fully cooled. Ingredient quantities and the yield of 10 servings are estimated; final candy weight and serving size will vary with evaporation and portioning.';
setState(accountState({recipes:[
  {id:'new-recipe',name:'Instruction Recipe',category:'Custom',servings:2,yield:'2 servings',serving:'1 serving',ingredients:[{name:'Ingredient',amount:1,unit:'cup'}],instructions:['Prep the pan.','Cook until done.'],notes:'',nutrition:{calories:50,protein:5}},
  {id:'legacy-directions',name:'Legacy Directions',category:'Custom',servings:1,ingredients:[{name:'Ingredient',amount:1,unit:'cup'}],directions:['Old step one.','Old step two.'],nutrition:{}},
  {id:'legacy-method',name:'Legacy Method',category:'Custom',servings:1,ingredients:[{name:'Ingredient',amount:1,unit:'cup'}],method:'Brown the food.\\nSimmer it.',nutrition:{}},
  {id:'honey-ginger-candy',name:'Honey Ginger Candy',category:'Custom',servings:10,yield:'10 servings',serving:'1 serving',ingredients:[{name:'Honey',brand:'',amount:280,unit:'g',foodId:'2932869d-2da3-40a5-8703-2980854a0c54',resolution:'existing'},{name:'Ground ginger',brand:'',amount:6,unit:'g',foodId:'424e5ff4-1b5e-410d-91f5-9452f3fa801f',resolution:'existing'},{name:'Water',brand:'',amount:30,unit:'ml',foodId:'7ce21fd9-040e-4b77-8fdf-077a6f77f9f5',resolution:'existing'}],notes:honeyNotes,nutrition:{calories:90,protein:0.1,carbs:22.5,fat:0,sodium:1}},
  {id:'no-instructions',name:'No Instructions',category:'Custom',servings:1,ingredients:[{name:'Ingredient',amount:1,unit:'cup'}],nutrition:{}},
  {id:'notes-directions',name:'Notes Directions',category:'Custom',servings:1,ingredients:[{name:'Ingredient',amount:1,unit:'cup'}],notes:'Keep this note.\\nDirections: Stir once.\\nBake until set.',nutrition:{}}
]}));
let exported=run('getTrackerState()');
assert.deepStrictEqual(exported.recipes[0].instructions,['Prep the pan.','Cook until done.']);
assert.deepStrictEqual(exported.recipes[1].instructions,['Old step one.','Old step two.']);
assert.deepStrictEqual(exported.recipes[2].instructions,['Brown the food.','Simmer it.']);
assert.strictEqual(exported.recipes[3].servings,10);
assert.deepStrictEqual(exported.recipes[3].ingredients.map(x=>({name:x.name,brand:x.brand,amount:x.amount,unit:x.unit,foodId:x.foodId})),[{name:'Honey',brand:'',amount:280,unit:'g',foodId:'2932869d-2da3-40a5-8703-2980854a0c54'},{name:'Ground ginger',brand:'',amount:6,unit:'g',foodId:'424e5ff4-1b5e-410d-91f5-9452f3fa801f'},{name:'Water',brand:'',amount:30,unit:'ml',foodId:'7ce21fd9-040e-4b77-8fdf-077a6f77f9f5'}]);
assert.ok(exported.recipes[3].instructions.length>=6);
assert.strictEqual(exported.recipes[3].instructions[0],'Line a small tray or plate with parchment paper.');
assert.ok(exported.recipes[3].instructions.some(x=>x.includes('300°F (149°C)')));
assert.ok(exported.recipes[3].notes.includes('Hot honey syrup can cause severe burns; do not touch or taste it until fully cooled.'));
assert.ok(exported.recipes[3].notes.includes('Ingredient quantities and the yield of 10 servings are estimated; final candy weight and serving size will vary with evaporation and portioning.'));
const honeyCombined=`${exported.recipes[3].instructions.join(' ')} ${exported.recipes[3].notes}`;
for(const part of honeyNotes.replace(/^Cooking instructions:\s*/,'').match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)) assert.ok(honeyCombined.includes(part.trim()),`lost Honey notes text: ${part}`);
assert.deepStrictEqual(exported.recipes[4].instructions,[]);
assert.deepStrictEqual(exported.recipes[5].instructions,['Stir once.','Bake until set.']);
assert.strictEqual(exported.recipes[5].notes,'Keep this note.');
setState(run('createEmptyTrackerState()'));
context.backup=exported;
assert.strictEqual(run('applyTrackerState(backup)'),true);
assert.deepStrictEqual(run('getTrackerState().recipes.map(r=>r.instructions)'),exported.recipes.map(r=>r.instructions));
elements.recipeSelect={value:String(run('RECIPE_DATA.length')),innerHTML:'',onchange:null};
elements.recipeDetails={innerHTML:''};
run('(()=>{renderRecipes();return true;})()');
assert.ok(elements.recipeDetails.innerHTML.includes('Cooking Instructions')&&elements.recipeDetails.innerHTML.includes('<li>Prep the pan.</li>')&&elements.recipeDetails.innerHTML.includes('<li>Cook until done.</li>'));
elements.recipeSelect.value=String(run('RECIPE_DATA.length+4'));
run('(()=>{renderRecipes();return true;})()');
assert.ok(elements.recipeDetails.innerHTML.includes('No cooking instructions saved.'));
let printed='';
context.open=()=>({document:{write(html){printed+=html;},close(){}}});
context.document.querySelectorAll=selector=>selector==='[data-recipe-print-index]:checked'?[{dataset:{recipePrintIndex:String(run('RECIPE_DATA.length'))}}]:[];
assert.strictEqual(run('(()=>{printSelectedRecipes();return true;})()'),true);
assert.ok(printed.includes('<h2>Cooking Instructions</h2><ol><li>Prep the pan.</li><li>Cook until done.</li></ol>'));
printed='';
context.document.querySelectorAll=selector=>selector==='[data-recipe-print-index]:checked'?[{dataset:{recipePrintIndex:String(run('RECIPE_DATA.length+3'))}}]:[];
assert.strictEqual(run('(()=>{printSelectedRecipes();return true;})()'),true);
assert.ok(printed.includes('<h1>Honey Ginger Candy</h1>'));
assert.ok(printed.includes('<h2>Cooking Instructions</h2><ol><li>Line a small tray or plate with parchment paper.</li>'));
assert.ok(!printed.includes('Hot honey syrup can cause severe burns'),'printed recipe should keep notes out of the ordered cooking list');

// Selected recipes can be saved into the persistent Food List and then logged today without duplicate entries.
const foodListRecipe={id:'food-list-recipe',name:'Food List Recipe',foodName:'Different Generated Food Name',category:'Custom',servings:2,yield:'2 servings',serving:'1 saved recipe serving',ingredients:[{name:'Ingredient',amount:1,unit:'cup'}],nutrition:{calories:123,protein:9,carbs:10,fat:4,fiber:2,sodium:55,potassium:77}};
setState(accountState({recipes:[foodListRecipe]}));
elements.recipeSelect={value:String(run('RECIPE_DATA.length'))};
elements.date={value:'2026-08-01'};
vm.runInContext('selectedDate=()=> "2026-08-01"',context);
elements.recipeFoodListStatus={textContent:''};
context.renderFoodSelect=()=>{};
context.renderFoodsList=()=>{};
assert.strictEqual(run('(()=>{addSelectedRecipeToFoodList();addSelectedRecipeToFoodList();return state.foods.filter(f=>f.name==="Food List Recipe").length;})()'),1);
const savedRecipeFood=run('getTrackerState().foods.find(f=>f.name==="Food List Recipe")');
assert.deepStrictEqual({name:savedRecipeFood.name,custom:savedRecipeFood.custom,serving:savedRecipeFood.serving,calories:savedRecipeFood.calories,protein:savedRecipeFood.protein,carbs:savedRecipeFood.carbs,fat:savedRecipeFood.fat,fiber:savedRecipeFood.fiber,sodium:savedRecipeFood.sodium,potassium:savedRecipeFood.potassium},{name:'Food List Recipe',custom:true,serving:'1 saved recipe serving',calories:123,protein:9,carbs:10,fat:4,fiber:2,sodium:55,potassium:77});
assert.strictEqual(elements.recipeFoodListStatus.textContent,'Food List Recipe is in the Food List.');
const savedFoodListState=run('getTrackerState()');
alerts.length=0;
assert.strictEqual(run('(()=>{addSelectedRecipeToDay();return state.entries.length;})()'),1);
let recipeEntry=run('state.entries[0]');
assert.deepStrictEqual({date:recipeEntry.date,servings:recipeEntry.servings,foodName:recipeEntry.food.name,serving:recipeEntry.food.serving,calories:recipeEntry.food.calories,protein:recipeEntry.food.protein,carbs:recipeEntry.food.carbs,fat:recipeEntry.food.fat,fiber:recipeEntry.food.fiber,sodium:recipeEntry.food.sodium,potassium:recipeEntry.food.potassium},{date:'2026-08-01',servings:1,foodName:'Food List Recipe',serving:'1 saved recipe serving',calories:123,protein:9,carbs:10,fat:4,fiber:2,sodium:55,potassium:77});
assert.deepStrictEqual(alerts,[]);
context.reloadedRecipeState=savedFoodListState;
setState(accountState());
assert.strictEqual(run('applyTrackerState(reloadedRecipeState)'),true);
elements.recipeSelect={value:String(run('RECIPE_DATA.length'))};
elements.date={value:'2026-08-02'};
vm.runInContext('selectedDate=()=> "2026-08-02"',context);
assert.strictEqual(run('(()=>{addSelectedRecipeToDay();return state.entries.length;})()'),1);
recipeEntry=run('state.entries[0]');
assert.deepStrictEqual({date:recipeEntry.date,foodName:recipeEntry.food.name,serving:recipeEntry.food.serving,calories:recipeEntry.food.calories,protein:recipeEntry.food.protein,potassium:recipeEntry.food.potassium},{date:'2026-08-02',foodName:'Food List Recipe',serving:'1 saved recipe serving',calories:123,protein:9,potassium:77});

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

// Three-level SPA navigation keeps account, authenticated main menu, and tracker menu distinct.
assert.ok(!html.includes('<header><h1>Nutrition Tracker</h1>'));
assert.ok(!html.includes('Private account-based nutrition and exercise tracking with Supabase cloud synchronization.'));
assert.ok(!html.includes('id="accountGateMessage"'));
assert.ok(!html.includes('Sign in or create an account to use and save your Tracker.'));
const landingMarkup=html.slice(html.indexOf('id="publicLandingScreen"'),html.indexOf('</section>',html.indexOf('id="publicLandingScreen"')));
assert.ok(landingMarkup.includes('<h2>A Healthy You Starts Here</h2>'));
assert.ok(landingMarkup.includes("Welcome to the Community! More than looking good and feeling great (both are awesome!!), our goal is to become healthy and lead vibrant, energetic lives. We will learn and encourage each other to eat healthy, natural, real and delicious foods as well as build strong bodies. Whether you are under the care of a weight management doctor or are just exploring healthy alternatives to modern diets and lifestyles that have left you feeling sluggish and sick, you'll find recipes and encouragement here to build healthy habits for life. You should absolutely consult with a medical professional before embarking on major changes that affect any conditions that you may have."));
assert.ok(landingMarkup.includes('Set up a free account and join us in our commitment to good health!'));
assert.ok(landingMarkup.includes('id="openAccountBtn" data-screen="accountScreen">Create Account / Log In</button>'));
assert.ok(html.includes('<section class="screen active" id="publicLandingScreen"'));
const accountMarkup=html.slice(html.indexOf('id="accountScreen"'),html.indexOf('</section>',html.indexOf('id="accountScreen"')));
assert.ok(accountMarkup.includes('id="signedOutAccount"')&&accountMarkup.includes('id="loginBtn"'));
assert.ok(accountMarkup.includes('id="signedInEmail"')&&accountMarkup.includes('id="logoutBtn"'));
assert.ok(accountMarkup.includes('data-screen="mainMenuScreen">Main Menu</button>'));
const mainMenuMarkup=html.slice(html.indexOf('id="mainMenuScreen"'),html.indexOf('</section>',html.indexOf('id="mainMenuScreen"')));
for(const label of ['Proceed to Tracker','Community Forum','Back to Account']) assert.ok(mainMenuMarkup.includes(`>${label}</button>`),`missing Main Menu button: ${label}`);
assert.ok(!mainMenuMarkup.includes('>Contact Admin</button>'));
for(const label of ['Food','Exercise','Utilities','Profile','Users Guide']) assert.ok(!mainMenuMarkup.includes(`>${label}</button>`),`tracker button leaked into Main Menu: ${label}`);
const homeMarkup=html.slice(html.indexOf('id="homeScreen"'),html.indexOf('</section>',html.indexOf('id="homeScreen"')));
assert.strictEqual((homeMarkup.match(/<button\b/g)||[]).length,6);
for(const label of ['Food','Exercise','Profile','Utilities','Users Guide','Main Menu']) assert.ok(homeMarkup.includes(`>${label}</button>`),`missing Tracker Menu button: ${label}`);
assert.ok(!homeMarkup.includes('>Contact Admin</button>')&&!homeMarkup.includes('>Admin</button>'));
for(const forbiddenHomeContent of ['<form','signedInEmail','cloudSaveStatus','foodSelect','menuTotals','profileResults']) assert.ok(!homeMarkup.includes(forbiddenHomeContent),`Home contains module content: ${forbiddenHomeContent}`);
assert.ok(html.includes("communityForumScreen:'mainMenuScreen'"));
function sectionMarkup(id){const start=html.indexOf(`id="${id}"`);assert.ok(start>=0,`missing section ${id}`);const sectionStart=html.lastIndexOf('<section',start);const next=html.indexOf('<section class="screen',start+1);return html.slice(sectionStart,next>0?next:html.indexOf('</main>'));}
const aiMenuMarkup=sectionMarkup('aiAssistanceScreen');
for(const label of ['Add Food','Add Recipe','Suggest Menus']) assert.ok(aiMenuMarkup.includes(`>${label}<span>`),`missing AI Assistance menu button: ${label}`);
for(const forbidden of ['aiFoodDescription','aiRecipeDescription','aiMealPlanStart','aiMealPlanPackage','Paste AI Import Package']) assert.ok(!aiMenuMarkup.includes(forbidden),`AI Assistance menu contains tool form: ${forbidden}`);
assert.ok(aiMenuMarkup.includes('data-screen="foodHubScreen">← Food</button>'));
const aiFoodMarkup=sectionMarkup('aiAddFoodScreen'),aiRecipeMarkup=sectionMarkup('aiAddRecipeScreen'),aiMenusMarkup=sectionMarkup('aiMealPlanScreen');
assert.ok(aiFoodMarkup.includes('data-screen="aiAssistanceScreen">← AI Assistance</button>')&&aiFoodMarkup.includes('aiFoodDescription'));
assert.ok(!aiFoodMarkup.includes('aiRecipeDescription')&&!aiFoodMarkup.includes('aiMealPlanStart'));
assert.ok(aiRecipeMarkup.includes('data-screen="aiAssistanceScreen">← AI Assistance</button>')&&aiRecipeMarkup.includes('aiRecipeDescription'));
assert.ok(!aiRecipeMarkup.includes('aiFoodDescription')&&!aiRecipeMarkup.includes('aiMealPlanStart'));
assert.ok(aiMenusMarkup.includes('<h2>Suggest Menus with ChatGPT</h2>')&&aiMenusMarkup.includes('data-screen="aiAssistanceScreen">← AI Assistance</button>'));
assert.ok(aiMenusMarkup.includes('id="aiGenerateMealPlanBtn" type="button">Copy ChatGPT Instructions</button>'));
assert.ok(aiMenusMarkup.includes('id="aiReviewMealPlanBtn" type="button">Preview Menus</button>'));
assert.ok(aiMenusMarkup.includes('id="aiImportMealPlanBtn" type="button" disabled>Import Menus to Today'));
assert.ok(aiMenusMarkup.includes('id="aiMealPlanAppendBtn"')&&aiMenusMarkup.includes('id="aiMealPlanReplaceBtn"')&&aiMenusMarkup.includes('id="aiMealPlanCancelImportBtn"'));
assert.ok(aiMenusMarkup.includes('id="aiMealPlanOpenTodayBtn" type="button">Open Today'));
assert.ok(!aiMenusMarkup.includes('aiFoodDescription')&&!aiMenusMarkup.includes('aiRecipeDescription'));
assert.ok(html.includes("aiAddFoodScreen:'aiAssistanceScreen',aiAddRecipeScreen:'aiAssistanceScreen',aiMealPlanScreen:'aiAssistanceScreen'"));
assert.ok(html.includes("foodListsHubScreen:'foodHubScreen'"));
assert.ok(html.includes("statsHubScreen:'foodHubScreen'"));
assert.ok(html.includes("reportsScreen:'utilitiesScreen'"));
assert.ok(html.includes("recipePrintScreen:'reportsScreen',weightHistoryScreen:'reportsScreen',trackerSummaryScreen:'reportsScreen'"));
assert.ok(html.includes("SHARED_DESTINATION_PARENTS={dailyTotalsScreen:['statsHubScreen','exerciseHubScreen']}"));
assert.ok(html.includes('.homeMenu{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))'));
assert.ok(html.includes('@media(max-width:899px){.homeMenu{grid-template-columns:repeat(2,minmax(0,1fr))'));
assert.ok(html.includes('@media(max-width:599px){.homeMenu{grid-template-columns:1fr'));
assert.ok(html.includes('.trackerLocked main .screen:not(#accountScreen):not(#publicLandingScreen){display:none!important}'));

const navIds=['publicLandingScreen','mainMenuScreen','communityForumScreen','homeScreen','accountScreen','foodHubScreen','aiAssistanceScreen','aiAddFoodScreen','aiAddRecipeScreen','aiMealPlanScreen','foodListsHubScreen','statsHubScreen','exerciseHubScreen','utilitiesScreen','reportsScreen','profileScreen','contactScreen','usersGuideScreen','dailyTotalsScreen'];
const navScreens=Object.fromEntries(navIds.map(id=>[id,{id,active:id==='homeScreen',classList:{add(name){if(name==='active')this.owner.active=true;},remove(name){if(name==='active')this.owner.active=false;}}}]));
for(const screen of Object.values(navScreens)) screen.classList.owner=screen;
const dailyReturn={dataset:{screen:'statsHubScreen'},textContent:''};
let scrollCalls=0;
context.document.querySelectorAll=selector=>selector==='.screen'?Object.values(navScreens):[];
context.document.querySelector=selector=>selector==='.screen.active'?(Object.values(navScreens).find(screen=>screen.active)||null):(selector==='[data-return-for="dailyTotalsScreen"]'?dailyReturn:null);
context.document.getElementById=id=>navScreens[id]||elements[id]||null;
context.document.body={classList:{contains:()=>false}};
context.scrollTo=(x,y)=>{assert.strictEqual(x,0);assert.strictEqual(y,0);scrollCalls++;};
context.render=()=>{};context.renderProfile=()=>{};context.renderVitABreakdown=()=>{};context.renderDailyBreakdown=()=>{};
for(const id of ['publicLandingScreen','mainMenuScreen','communityForumScreen','foodHubScreen','aiAssistanceScreen','aiAddFoodScreen','aiAddRecipeScreen','aiMealPlanScreen','foodListsHubScreen','statsHubScreen','exerciseHubScreen','utilitiesScreen','reportsScreen','accountScreen','profileScreen','contactScreen','usersGuideScreen']){
  assert.strictEqual(run(`showScreen('${id}')`),true);
  assert.deepStrictEqual(Object.values(navScreens).filter(screen=>screen.active).map(screen=>screen.id),[id]);
}
context.document.body={classList:{contains:()=>true}};
assert.strictEqual(run("showScreen('foodHubScreen')"),true);
assert.deepStrictEqual(Object.values(navScreens).filter(screen=>screen.active).map(screen=>screen.id),['publicLandingScreen']);
context.document.body={classList:{contains:()=>false}};
run("showScreen('exerciseHubScreen');showScreen('dailyTotalsScreen','exerciseHubScreen')");
assert.strictEqual(dailyReturn.dataset.screen,'exerciseHubScreen');
assert.strictEqual(dailyReturn.textContent,'← Exercise');
run("showScreen('statsHubScreen');showScreen('dailyTotalsScreen','statsHubScreen')");
assert.strictEqual(dailyReturn.dataset.screen,'statsHubScreen');
assert.strictEqual(dailyReturn.textContent,'← Stats');
assert.ok(scrollCalls>=18);

console.log('Tracker regression tests: PASS (hierarchical navigation, retained nutrition reports, clean state, account boundary, local persistence, logging, copy/reset, removal scans)');
