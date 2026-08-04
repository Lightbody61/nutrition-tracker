const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const html=fs.readFileSync(path.resolve(__dirname,'..','index.html'),'utf8');
const start=html.indexOf('<script>')+8;
const trackerSource=html.slice(start,html.indexOf('</script>',start));
const workoutSource=fs.readFileSync(path.resolve(__dirname,'..','workout.js'),'utf8').replace(/refreshWorkoutTracker\(\);\s*$/,'');
const sandbox={
  console,
  crypto:{randomUUID:()=>`uuid-${Math.random()}`},
  location:{href:'https://tracker.test/',hash:'',search:''},
  history:{replaceState(){},pushState(){}},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
  document:{addEventListener(){},getElementById(){return null;},querySelectorAll(){return[];},createElement(){return{};},activeElement:null},
  window:{scrollTo(){}},alert(){},confirm:()=>true,setTimeout(){return 1;},clearTimeout(){}
};
sandbox.window={...sandbox.window,...sandbox};
vm.createContext(sandbox);
vm.runInContext(trackerSource,sandbox);
vm.runInContext(workoutSource,sandbox);
const run=expression=>JSON.parse(JSON.stringify(vm.runInContext(expression,sandbox)));
const setState=value=>{sandbox.testState=value;vm.runInContext('state=testState',sandbox);};

// Brisk treadmill walking is proportional to duration and never a fixed session value.
const weight=150,met=4.8;
const values=[1,10,30,60].map(minutes=>run(`calculateMetCalories(${met},${weight},${minutes})`));
assert.ok(values[0]>0&&values[0]<10);
assert.ok(Math.abs(values[1]-values[0]*10)<1e-9);
assert.ok(Math.abs(values[2]-values[0]*30)<1e-9);
assert.ok(Math.abs(values[3]-values[0]*60)<1e-9);
assert.ok(values.every(value=>Math.round(value)!==306));
assert.deepStrictEqual([run('calculateMetCalories(4.8,150,"")'),run('calculateMetCalories(4.8,150,0)'),run('calculateMetCalories(4.8,150,-1)'),run('calculateMetCalories(4.8,150,"bad")'),run('calculateMetCalories(4.8,"",10)'),run('calculateMetCalories("bad",150,10)')],[0,0,0,0,0,0]);

// A saved workout retains configuration but drops a legacy stale calorie result.
setState(run('createEmptyTrackerState()'));
sandbox.legacyWorkout={id:'workout:aerobics',name:'Aerobics',exercises:[{id:'exercise:aerobics:brisk-walk-on-treadmill',name:'Brisk Walk on Treadmill',section:'Aerobics',sets:1,repetitions:'minutes',duration:60,resistance:0,met:4.8,calories:306,notes:'steady'}]};
vm.runInContext("state.workoutDefinitions.Aerobics=legacyWorkout",sandbox);
const restored=run("normalizedWorkoutDefinitions().Aerobics");
assert.deepStrictEqual(restored.exercises.map(x=>[x.id,x.name,x.duration,x.met,x.notes]),[['exercise:aerobics:brisk-walk-on-treadmill','Brisk Walk on Treadmill',60,4.8,'steady']]);
assert.ok(!Object.hasOwn(restored.exercises[0],'calories'));

// Reloaded daily logs recalculate from exercise duration rather than saved totals or global session time.
function day(duration,name='Brisk Walk on Treadmill',exerciseMet=met){return {date:'2026-08-02',type:'Aerobics',bodyWeight:weight,minutes:60,intensity:4.5,workoutCalories:306,totalExerciseCalories:306,exercises:[{id:'exercise:test',name,duration,met:exerciseMet,sets:[{done:true,weight:0,reps:String(duration)}]}]};}
for(const [index,minutes] of [1,10,30,60].entries()){
  sandbox.savedDay=day(minutes);
  vm.runInContext("state.workoutLogs['2026-08-02']=savedDay",sandbox);
  const totals=run("calculateDailyExerciseCalories('2026-08-02')");
  assert.ok(Math.abs(totals.workoutCalories-values[index])<1e-9);
  assert.strictEqual(totals.totalExerciseCalories,totals.workoutCalories);
}

// Resistance calories use weight × MET × duration; volume fields remain records, not invented calorie factors.
sandbox.resistanceDay={...day(20,'Leg Press',5),exercises:[{id:'exercise:gym-machines:leg-press',name:'Leg Press',duration:20,met:5,sets:[{done:true,weight:100,reps:'10'},{done:true,weight:150,reps:'20'}]}]};
vm.runInContext("state.workoutLogs['2026-08-03']=resistanceDay",sandbox);
const resistance=run("calculateDailyExerciseCalories('2026-08-03').workoutCalories");
assert.ok(Math.abs(resistance-run('calculateMetCalories(5,150,20)'))<1e-9);
sandbox.changedVolume={...sandbox.resistanceDay,exercises:[{...sandbox.resistanceDay.exercises[0],sets:[{done:true,weight:300,reps:'30'},{done:true,weight:400,reps:'40'}]}]};
assert.strictEqual(run('workoutLogCalories(changedVolume)'),resistance);
sandbox.changedDuration={...sandbox.resistanceDay,exercises:[{...sandbox.resistanceDay.exercises[0],duration:40}]};
assert.strictEqual(run('workoutLogCalories(changedDuration)'),resistance*2);
sandbox.invalidResistance={...sandbox.resistanceDay,exercises:[{...sandbox.resistanceDay.exercises[0],duration:'bad'}],workoutCalories:999};
assert.strictEqual(run('workoutLogCalories(invalidResistance)'),0);

// Daily totals combine recalculated workout and Other Activity once and survive JSON restoration.
vm.runInContext("state.activityLogs['2026-08-02']=[{id:'activity:yard',name:'Yard work',met:4,minutes:15,weight:150}]",sandbox);
sandbox.savedDay=day(30);
vm.runInContext("state.workoutLogs['2026-08-02']=savedDay",sandbox);
const combined=run("calculateDailyExerciseCalories('2026-08-02')");
assert.ok(Math.abs(combined.totalExerciseCalories-(values[2]+run('calculateMetCalories(4,150,15)')))<1e-9);
assert.strictEqual(run("exerciseForDate('2026-08-02')"),combined.totalExerciseCalories);
assert.deepStrictEqual(run("(()=>{const food=1000,exercise=exerciseForDate('2026-08-02'),energy=dayEnergyBalance('2026-08-02',food,exercise,2000);return{net:food-exercise,balance:energy.balance}})()"),{net:1000-combined.totalExerciseCalories,balance:(1000-combined.totalExerciseCalories)-2000});
const roundTrip=JSON.parse(JSON.stringify(run('getTrackerState()')));
setState(run('createEmptyTrackerState()'));
sandbox.roundTrip=roundTrip;
assert.strictEqual(run('applyTrackerState(roundTrip)'),true);
assert.strictEqual(run("exerciseForDate('2026-08-02')"),combined.totalExerciseCalories);

console.log('Exercise calculations: PASS (treadmill proportions, saved workout migration, resistance, invalid inputs, daily totals)');
