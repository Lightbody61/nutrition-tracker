const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const source=fs.readFileSync(path.resolve(__dirname,'..','workout.js'),'utf8').replace(/refreshWorkoutTracker\(\);\s*$/,'');
const elements={
  builderName:{value:''},
  builderLoad:{value:'',innerHTML:''},
  workoutType:{value:'',innerHTML:''},
  selectedCount:{textContent:''},
  builderAttachedExercises:{innerHTML:''}
};
const alerts=[];
const sandbox={
  console,
  state:{workoutDefinitions:{},workoutLogs:{},activityLogs:{},customExercises:{},customActivities:{},profile:{weight:150}},
  document:{getElementById:id=>elements[id]||null,querySelectorAll:()=>[],createElement:()=>({})},
  window:{scrollTo(){}},
  alert:message=>alerts.push(message),
  confirm:()=>true,
  save(){sandbox.saved=JSON.parse(JSON.stringify(sandbox.state));},
  setTimeout(){return 1;},
  clearTimeout(){}
};
sandbox.window={...sandbox.window,...sandbox};
vm.createContext(sandbox);
vm.runInContext(source,sandbox);
const run=expression=>JSON.parse(JSON.stringify(vm.runInContext(expression,sandbox)));

// 1–4: create Workout Save Test with three ordered exercise snapshots and distinct settings.
elements.builderName.value='Workout Save Test';
sandbox.testExercises=[
  {id:'exercise:test:first',name:'First Exercise',section:'Test',sets:3,repetitions:'8',duration:0,resistance:50,calories:0,notes:'first notes',met:4},
  {id:'exercise:test:second',name:'Second Exercise',section:'Test',sets:4,repetitions:'12',duration:10,resistance:0,calories:75,notes:'second notes',met:5},
  {id:'exercise:test:third',name:'Third Exercise',section:'Test',sets:1,repetitions:'30 sec',duration:15,resistance:20,calories:40,notes:'third notes',met:6}
];
vm.runInContext('builderAttachedExercises=deepCopy(testExercises);saveWorkoutDefinition()',sandbox);
let saved=run("state.workoutDefinitions['Workout Save Test']");
assert.strictEqual(saved.name,'Workout Save Test');
assert.strictEqual(saved.id,'workout:workout-save-test');
assert.deepStrictEqual(saved.exercises.map(x=>x.name),['First Exercise','Second Exercise','Third Exercise']);
assert.deepStrictEqual(saved.exercises.map(x=>x.order),[0,1,2]);
assert.deepStrictEqual(saved.exercises.map(x=>[x.sets,x.repetitions,x.duration,x.resistance,x.met,x.notes]),[[3,'8',0,50,4,'first notes'],[4,'12',10,0,5,'second notes'],[1,'30 sec',15,20,6,'third notes']]);
assert.ok(saved.exercises.every(x=>!Object.hasOwn(x,'calories')),'stale calorie results must not be saved in workout definitions');

// 5–7: open another workout, then reopen the test workout without shared-array mutation.
sandbox.state.workoutDefinitions.Other={id:'workout:other',name:'Other',exercises:[{id:'exercise:other',name:'Other Exercise',sets:2,repetitions:'5'}]};
elements.builderLoad.value='Other';
vm.runInContext('loadWorkoutIntoBuilder()',sandbox);
vm.runInContext("builderAttachedExercises[0].sets=99",sandbox);
assert.strictEqual(run("state.workoutDefinitions.Other.exercises[0].sets"),2);
elements.builderLoad.value='Workout Save Test';
vm.runInContext('loadWorkoutIntoBuilder()',sandbox);
assert.deepStrictEqual(run('builderAttachedExercises.map(x=>x.name)'),['First Exercise','Second Exercise','Third Exercise']);

// 8–12: simulate refresh, edit one snapshot, save again, and refresh once more.
sandbox.reloaded=JSON.parse(JSON.stringify(sandbox.saved));
vm.runInContext('state=reloaded',sandbox);
elements.builderLoad.value='Workout Save Test';
vm.runInContext('loadWorkoutIntoBuilder();builderAttachedExercises[1].notes="edited after reopen";builderAttachedExercises[1].resistance=25',sandbox);
elements.builderName.value='Workout Save Test';
vm.runInContext('saveWorkoutDefinition()',sandbox);
sandbox.reloadedAgain=JSON.parse(JSON.stringify(sandbox.saved));
vm.runInContext('state=reloadedAgain',sandbox);
assert.deepStrictEqual(run("(()=>{const x=state.workoutDefinitions['Workout Save Test'].exercises[1];return [x.notes,x.resistance]})()"),['edited after reopen',25]);

// 13–16: account-state JSON export/import round trip retains the complete workout snapshots.
const exported=JSON.stringify(sandbox.state);
const imported=JSON.parse(exported);
assert.deepStrictEqual(imported.workoutDefinitions['Workout Save Test'].exercises,sandbox.state.workoutDefinitions['Workout Save Test'].exercises);
sandbox.state={workoutDefinitions:{},workoutLogs:{},activityLogs:{},customExercises:{},customActivities:{},profile:{weight:0}};
sandbox.state=JSON.parse(exported);
assert.strictEqual(sandbox.state.workoutDefinitions['Workout Save Test'].exercises.length,3);

// 17: legacy name arrays and unavailable master exercises migrate without being discarded.
sandbox.state.workoutDefinitions.Legacy=['Leg Press','Renamed or unavailable exercise'];
const legacy=run("normalizedWorkoutDefinitions().Legacy");
assert.strictEqual(legacy.exercises.length,2);
assert.strictEqual(legacy.exercises[1].name,'Renamed or unavailable exercise');
assert.ok(legacy.exercises.every(x=>x.id&&Number.isInteger(x.order)));

console.log('Workout save tests: PASS (ordered snapshots, independent edits, refresh, JSON round trip, legacy migration)');
