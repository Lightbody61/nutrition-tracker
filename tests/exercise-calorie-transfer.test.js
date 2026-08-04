const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const start=html.indexOf('<script>')+8;
const trackerSource=html.slice(start,html.indexOf('</script>',start));
const workoutSource=fs.readFileSync(path.resolve(__dirname,'..','workout.js'),'utf8').replace(/refreshWorkoutTracker\(\);\s*$/,'');
const elements={saveStatus:{textContent:''}};
const sandbox={
  console,
  crypto:{randomUUID:()=>`uuid-${Math.random()}`},
  location:{href:'https://tracker.test/',hash:'',search:''},
  history:{replaceState(){},pushState(){}},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
  document:{addEventListener(){},getElementById:id=>elements[id]||null,querySelectorAll:()=>[],createElement:()=>({}),activeElement:null},
  window:{scrollTo(){}},
  alert(){},confirm:()=>true,
  setTimeout(){return 1;},clearTimeout(){}
};
sandbox.window={...sandbox.window,...sandbox};
vm.createContext(sandbox);
vm.runInContext(trackerSource,sandbox);
vm.runInContext(workoutSource,sandbox);
const run=expression=>JSON.parse(JSON.stringify(vm.runInContext(expression,sandbox)));
const setState=value=>{sandbox.testState=value;vm.runInContext('state=testState',sandbox);};
const empty=()=>run('createEmptyTrackerState()');

function savedDay(date,workoutCalories,otherActivityCalories){
  return {date,workoutCalories,otherActivityCalories,totalExerciseCalories:Number(workoutCalories)+Number(otherActivityCalories)};
}

// Test 1: combined transfer and Today’s Menu/net/deficit calculation path.
setState(empty());
vm.runInContext(`state.workoutLogs['2026-08-01']=testDay`,Object.assign(sandbox,{testDay:savedDay('2026-08-01','240','110')}));
assert.deepStrictEqual(run("calculateDailyExerciseCalories('2026-08-01')"),{workoutCalories:240,otherActivityCalories:110,totalExerciseCalories:350});
assert.strictEqual(run("exerciseForDate('2026-08-01')"),350);
assert.deepStrictEqual(run("(()=>{const food=1000,exercise=exerciseForDate('2026-08-01'),energy=dayEnergyBalance('2026-08-01',food,exercise,2000);return{net:food-exercise,balance:energy.balance}})()"),{net:650,balance:-1350});

// Test 2: JSON/account-state refresh retains all audit fields and the same total.
const refreshed=JSON.parse(JSON.stringify(run('getTrackerState()')));
setState(refreshed);
assert.deepStrictEqual(run("calculateDailyExerciseCalories('2026-08-01')"),{workoutCalories:240,otherActivityCalories:110,totalExerciseCalories:350});

// Test 3: resaving replaces rather than adds the former activity calories.
vm.runInContext("state.workoutLogs['2026-08-01'].otherActivityCalories='80';state.workoutLogs['2026-08-01'].totalExerciseCalories=320",sandbox);
assert.deepStrictEqual(run("calculateDailyExerciseCalories('2026-08-01')"),{workoutCalories:240,otherActivityCalories:80,totalExerciseCalories:320});
assert.strictEqual(run("exerciseForDate('2026-08-01')"),320);

// Tests 4–6: workout-only, activity-only, and numeric zero/invalid normalization.
vm.runInContext(`state.workoutLogs['2026-08-02']=workoutOnly;state.workoutLogs['2026-08-03']=activityOnly;state.workoutLogs['2026-08-04']=zeros`,Object.assign(sandbox,{workoutOnly:savedDay('2026-08-02',200,0),activityOnly:savedDay('2026-08-03',0,150),zeros:{date:'2026-08-04',workoutCalories:'0',otherActivityCalories:'',totalExerciseCalories:'not-a-number'}}));
assert.strictEqual(run("exerciseForDate('2026-08-02')"),200);
assert.strictEqual(run("exerciseForDate('2026-08-03')"),150);
assert.deepStrictEqual(run("calculateDailyExerciseCalories('2026-08-04')"),{workoutCalories:0,otherActivityCalories:0,totalExerciseCalories:0});

// Test 7: calendar-date keys remain isolated.
vm.runInContext(`state.workoutLogs['2026-08-05']=dateA;state.workoutLogs['2026-08-06']=dateB`,Object.assign(sandbox,{dateA:savedDay('2026-08-05',240,110),dateB:savedDay('2026-08-06',100,0)}));
assert.strictEqual(run("exerciseForDate('2026-08-05')"),350);
assert.strictEqual(run("exerciseForDate('2026-08-06')"),100);

// Test 8: complete account JSON export/import into a clean state.
const exported=JSON.stringify(run('getTrackerState()'));
setState(empty());
sandbox.imported=JSON.parse(exported);
assert.strictEqual(run('applyTrackerState(imported)'),true);
assert.deepStrictEqual(run("state.workoutLogs['2026-08-05']"),savedDay('2026-08-05',240,110));
assert.strictEqual(run("exerciseForDate('2026-08-05')"),350);

// Test 9: legacy totals, aliases, numeric strings, missing fields, and zero survive safely.
vm.runInContext(`state.workoutLogs={
  legacyTotal:{date:'legacyTotal',exerciseCalories:'275'},
  separate:{date:'separate',workoutCals:'120',activityCalories:'30'},
  burned:{date:'burned',caloriesBurned:'90'},
  missing:{date:'missing'},
  zero:{date:'zero',dailyExerciseCalories:0}
}`,sandbox);
assert.strictEqual(run("calculateDailyExerciseCalories('legacyTotal').totalExerciseCalories"),275);
assert.deepStrictEqual(run("calculateDailyExerciseCalories('separate')"),{workoutCalories:120,otherActivityCalories:30,totalExerciseCalories:150});
assert.strictEqual(run("calculateDailyExerciseCalories('burned').totalExerciseCalories"),90);
assert.strictEqual(run("calculateDailyExerciseCalories('missing').totalExerciseCalories"),0);
assert.strictEqual(run("calculateDailyExerciseCalories('zero').totalExerciseCalories"),0);

// Exercise the actual saveDay overwrite path with current workout and activity state.
setState(empty());
vm.runInContext(`
  dayKey=()=> '2026-08-07';
  collectDay=()=>({date:'2026-08-07',type:'Test',bodyWeight:154,minutes:49.087,intensity:4,notes:'',exercises:[{id:'exercise:test',name:'Test',duration:49.087,met:4,sets:[{done:true,weight:0,reps:'1'}]}]});
  state.activityLogs['2026-08-07']=[{id:'activity:test',name:'Test Activity',met:5,minutes:17.999,weight:154}];
  renderHistory=()=>{};
  saveDay(false);
`,sandbox);
const actualSave=run("state.workoutLogs['2026-08-07']");
assert.strictEqual(Math.round(actualSave.workoutCalories),240);
assert.strictEqual(Math.round(actualSave.otherActivityCalories),110);
assert.strictEqual(Math.round(actualSave.totalExerciseCalories),350);
assert.strictEqual(Math.round(run("exerciseForDate('2026-08-07')")),350);

console.log('Exercise calorie transfer tests: PASS (combined save, Today totals, resave, zeros, dates, JSON, legacy)');
