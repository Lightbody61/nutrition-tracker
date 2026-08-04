const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'workout.js'),'utf8').replace(/refreshWorkoutTracker\(\);\s*$/,'');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const cdcMatch=html.match(/const CDC_EXERCISES = (\[[^\n]+\]);/);
assert.ok(cdcMatch,'CDC exercise source not found');
const sandbox={
  console,
  CDC_EXERCISES:JSON.parse(cdcMatch[1]),
  state:{workoutDefinitions:{},workoutLogs:{},activityLogs:{},customExercises:{},customActivities:{},profile:{weight:150}},
  document:{getElementById(){return null;},querySelectorAll(){return[];},createElement(){return{}}},
  window:{scrollTo(){}},alert(){},confirm:()=>true,save(){},setTimeout(){return 1;},clearTimeout(){}
};
sandbox.window={...sandbox.window,...sandbox};
vm.createContext(sandbox);
vm.runInContext(source,sandbox);
const run=expression=>JSON.parse(JSON.stringify(vm.runInContext(expression,sandbox)));

// Test 1: every built-in catalog exercise has a complete structured instruction set.
const inventory=run(`(()=>{const items=Object.values(allExercises()).filter(x=>!x.custom);return{count:items.length,categories:[...new Set(items.map(x=>x.section))],missing:items.filter(x=>{const i=x.instructions;return !i||!i.setup||!i.movement||!i.breathing||!i.safety||!Array.isArray(i.formTips)||!i.formTips.length||!Array.isArray(i.avoid)||!i.avoid.length}).map(x=>x.name)}})()`);
assert.strictEqual(inventory.count,148);
assert.deepStrictEqual(inventory.categories,['Stretching','Gym Machines','Free Weights','Aerobics','Swimming','Isometrics','Resistance Bands','Tai Chi','Yoga']);
assert.deepStrictEqual(inventory.missing,[]);
const cdcInventory=run(`({count:CDC_EXERCISES.length,missing:CDC_EXERCISES.filter(x=>!x.instructions||!x.instructions.setup||!x.instructions.movement||!x.instructions.breathing||!x.instructions.safety).map(x=>x.name)})`);
assert.deepStrictEqual(cdcInventory,{count:20,missing:[]});
assert.strictEqual(run(`new Set(Object.values(allExercises()).map(x=>JSON.stringify(x.instructions))).size`),148,'built-in instructions should be individually tailored');

// Test 2: native disclosure renders all required sections and starts collapsed.
const disclosure=vm.runInContext(`instructionHtml(getExercise('Leg Press').instructions,'Leg Press')`,sandbox);
for(const label of ['<details class="exerciseInstructions">','<summary','Setup','Movement','Breathing','Form tips','Avoid','Safety'])assert.ok(disclosure.includes(label),`missing instruction rendering: ${label}`);
assert.ok(!/<details[^>]*\sopen/.test(disclosure),'instructions must be collapsed by default');

// Test 3: three saved snapshots retain instructions through state reconstruction.
vm.runInContext(`state.workoutDefinitions.Test={id:'workout:test',name:'Test',exercises:['Leg Press','Band Row','Plank'].map((name,index)=>exerciseSnapshot(name,index))}`,sandbox);
let snapshots=run(`state.workoutDefinitions.Test.exercises`);
assert.strictEqual(snapshots.length,3);
assert.ok(snapshots.every(x=>x.instructions&&x.instructions.setup&&x.instructions.safety));
sandbox.reloaded=JSON.parse(JSON.stringify(sandbox.state));
vm.runInContext('state=reloaded',sandbox);
assert.ok(run(`normalizedWorkoutDefinitions().Test.exercises.every(x=>x.instructions&&x.instructions.movement)`));

// Test 4: catalog and workouts receive independent deep copies.
vm.runInContext(`state.workoutDefinitions.A={id:'workout:a',name:'A',exercises:[exerciseSnapshot('Leg Press',0)]};state.workoutDefinitions.B={id:'workout:b',name:'B',exercises:[exerciseSnapshot('Leg Press',0)]};state.workoutDefinitions.A.exercises[0].instructions.setup='Changed only in A'`,sandbox);
assert.notStrictEqual(run(`state.workoutDefinitions.B.exercises[0].instructions.setup`),'Changed only in A');
assert.notStrictEqual(run(`getExercise('Leg Press').instructions.setup`),'Changed only in A');

// Test 5: legacy name-only records inherit catalog instructions; unknown names stay safe.
vm.runInContext(`state.workoutDefinitions.Legacy=['leg press','Unknown Legacy Movement']`,sandbox);
const legacy=run(`normalizedWorkoutDefinitions().Legacy.exercises`);
assert.ok(legacy[0].instructions&&legacy[0].instructions.movement);
assert.strictEqual(legacy[1].instructions,null);
assert.ok(vm.runInContext(`instructionHtml(legacyInstructions,'Unknown')`,Object.assign(sandbox,{legacyInstructions:null})).includes('No instructions available'));

// Test 6: multiline custom instructions survive custom storage, snapshot editing, and reload.
const multiline='Set feet evenly.\nMove slowly through a comfortable path.\nBreathe out during effort.';
sandbox.customText=multiline;
vm.runInContext(`state.customExercises.Custom={id:'exercise:custom:custom',name:'Custom',section:'Custom Exercises',sets:2,reps:'8',met:4,instructions:normalizeInstructions(customText)};state.workoutDefinitions.CustomWorkout={id:'workout:custom',name:'CustomWorkout',exercises:[exerciseSnapshot('Custom',0)]}`,sandbox);
assert.strictEqual(run(`state.workoutDefinitions.CustomWorkout.exercises[0].instructions.movement`),multiline);
vm.runInContext(`state.workoutDefinitions.CustomWorkout.exercises[0].instructions.safety='Edited safety note'`,sandbox);
const customRoundTrip=JSON.parse(JSON.stringify(sandbox.state));
assert.strictEqual(customRoundTrip.customExercises.Custom.instructions.movement,multiline);
assert.strictEqual(customRoundTrip.workoutDefinitions.CustomWorkout.exercises[0].instructions.safety,'Edited safety note');

// Test 7: full JSON round trip restores built-in snapshots and custom instructions.
sandbox.imported=customRoundTrip;
vm.runInContext(`state={workoutDefinitions:{},workoutLogs:{},activityLogs:{},customExercises:{},customActivities:{},profile:{}};state=JSON.parse(JSON.stringify(imported))`,sandbox);
assert.strictEqual(run(`normalizedWorkoutDefinitions().CustomWorkout.exercises[0].instructions.movement`),multiline);

// Test 8: touch-friendly disclosure and narrow-screen wrapping styles are present.
assert.ok(html.includes('.exerciseInstructions summary{cursor:pointer;padding:9px 11px;font-weight:800;background:#0f172a;min-height:44px}'));
assert.ok(html.includes('overflow-wrap:anywhere'));
assert.ok(html.includes('@media(max-width:599px){.exerciseInstructionBody{font-size:14px}'));
assert.ok(html.includes('Use controlled movement and stop if an exercise causes sharp pain'));

console.log(`Exercise instruction tests: PASS (${inventory.count} active + ${cdcInventory.count} legacy-reference exercises across ${inventory.categories.length} active categories)`);
