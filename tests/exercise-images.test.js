const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'workout.js'),'utf8').replace(/refreshWorkoutTracker\(\);\s*$/,'');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sandbox={console,state:{workoutDefinitions:{},workoutLogs:{},activityLogs:{},customExercises:{},customActivities:{},profile:{}},document:{getElementById(){return null},querySelectorAll(){return[]},createElement(){return{}}},window:{scrollTo(){}},alert(){},confirm:()=>true,save(){},setTimeout(){return 1},clearTimeout(){}};
sandbox.window={...sandbox.window,...sandbox};
vm.createContext(sandbox);
vm.runInContext(source,sandbox);
const run=expression=>JSON.parse(JSON.stringify(vm.runInContext(expression,sandbox)));

const inventory=run(`(()=>{const all=Object.values(allExercises()),target=['Stretching','Yoga','Tai Chi','Isometrics'];return{mapped:all.filter(x=>x.images),stretching:all.filter(x=>x.section==='Stretching'),nonTargeted:all.filter(x=>!target.includes(x.section)),counts:Object.fromEntries(target.map(section=>[section,all.filter(x=>x.section===section&&x.images).length])),missing:all.filter(x=>target.includes(x.section)&&!x.images).map(x=>x.name)}})()`);
assert.deepStrictEqual(inventory.counts,{Stretching:14,Yoga:10,'Tai Chi':6,Isometrics:15});
assert.strictEqual(inventory.stretching.length,14);
assert.ok(inventory.stretching.every(x=>x.images&&x.images.primary.startsWith('exercise-images/stretching/')));
assert.strictEqual(inventory.mapped.length,45);
assert.ok(inventory.nonTargeted.every(x=>x.images===null));
assert.strictEqual(new Set(inventory.mapped.map(x=>x.images.primary)).size,45,'mapped exercises must use distinct PNGs');
assert.ok(inventory.mapped.every(x=>x.images.primary.endsWith('.png')));

const pngMagic=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
for(const exercise of inventory.mapped){
  const asset=path.resolve(root,exercise.images.primary);
  assert.ok(asset.startsWith(root+path.sep),'image path escaped project root');
  assert.ok(fs.existsSync(asset),`missing image: ${exercise.images.primary}`);
  const data=fs.readFileSync(asset);
  assert.ok(data.length>pngMagic.length,`empty image: ${exercise.images.primary}`);
  assert.ok(data.subarray(0,8).equals(pngMagic),`not a PNG: ${exercise.images.primary}`);
}
assert.strictEqual(fs.readdirSync(path.join(root,'exercise-images','yoga')).filter(x=>x.endsWith('.png')).length,10);
assert.strictEqual(fs.readdirSync(path.join(root,'exercise-images','tai-chi')).filter(x=>x.endsWith('.png')).length,6);
assert.strictEqual(fs.readdirSync(path.join(root,'exercise-images','isometrics')).filter(x=>x.endsWith('.png')).length,15);
assert.strictEqual(fs.readdirSync(path.join(root,'exercise-images','stretching')).filter(x=>x.endsWith('.png')).length,14);

const stretchingFiles={'exercise:stretching:neck-stretch':'neck-stretch.png','exercise:stretching:shoulder-stretch':'shoulder-stretch.png','exercise:stretching:doorway-chest-stretch':'doorway-chest-stretch.png','exercise:stretching:triceps-stretch':'triceps-stretch.png','exercise:stretching:forearm-stretch':'forearm-stretch.png','exercise:stretching:cat-cow':'cat-cow.png','exercise:stretching:child-s-pose':'child-s-pose.png','exercise:stretching:hip-flexor-stretch':'hip-flexor-stretch.png','exercise:stretching:hamstring-stretch':'hamstring-stretch.png','exercise:stretching:quadriceps-stretch':'quadriceps-stretch.png','exercise:stretching:figure-four-stretch':'figure-four-stretch.png','exercise:stretching:calf-stretch':'calf-stretch.png','exercise:stretching:adductor-stretch':'adductor-stretch.png','exercise:stretching:thoracic-rotation':'thoracic-rotation.png'};
for(const [id,file] of Object.entries(stretchingFiles))assert.strictEqual(run(`getExercise(${JSON.stringify(id)}).images.primary`),`exercise-images/stretching/${file}`);

const newIsometricFiles={'Dead Bug Hold':'dead-bug-hold.png','Hollow Body Hold':'hollow-body-hold.png','Shoulder External Rotation Hold':'shoulder-external-rotation-hold.png','Split Squat Hold':'split-squat-hold.png','Superman Hold':'superman-hold.png','Towel Row Isometric':'towel-row-isometric.png'};
const isometrics=run(`Object.values(allExercises()).filter(x=>x.section==='Isometrics')`);
assert.strictEqual(isometrics.length,15);
assert.ok(isometrics.every(x=>x.images&&x.images.primary.endsWith('.png')));
assert.strictEqual(new Set(isometrics.map(x=>x.id)).size,15);
assert.strictEqual(new Set(isometrics.map(x=>x.images.primary)).size,15);
for(const [name,file] of Object.entries(newIsometricFiles)){
  const exercise=run(`getExercise(${JSON.stringify(name)})`);
  assert.strictEqual(exercise.images.primary,`exercise-images/isometrics/${file}`);
  assert.ok(exercise.images.altPrimary.includes(name));
}

for(const name of ['Neck Stretch','Cat-Cow','Child’s Pose','Hip Flexor Stretch','Figure-Four Stretch','Thoracic Rotation','Mountain Pose','Commencing Form','Wall Sit','Plank']){
  sandbox.imageName=name;
  const rendered=vm.runInContext(`(()=>{const x=getExercise(imageName);return instructionHtml(x.instructions,x.name,x.images)})()`,sandbox);
  assert.ok(rendered.includes('exerciseInstructionImages')&&rendered.includes('.png'),`${name} PNG was not rendered`);
  assert.ok(rendered.includes('loading="lazy"')&&rendered.includes('alt="'));
  assert.ok(!/<details[^>]*\sopen/.test(rendered));
}
for(const name of ['Leg Press','Sphinx Pose']){
  sandbox.imageName=name;
  const rendered=vm.runInContext(`(()=>{const x=getExercise(imageName);return instructionHtml(x.instructions,x.name,x.images)})()`,sandbox);
  assert.ok(!rendered.includes('<img'),`${name} must not render an unrelated image`);
}
for(const absent of ['Single Whip','Neck Isometric Hold'])assert.strictEqual(run(`getExercise(${JSON.stringify(absent)})||null`),null);

for(const [name,file] of Object.entries(newIsometricFiles)){
  sandbox.imageName=name;
  const rendered=vm.runInContext(`(()=>{const x=getExercise(imageName);return instructionHtml(x.instructions,x.name,x.images)})()`,sandbox);
  assert.ok(rendered.includes(`exercise-images/isometrics/${file}`));
  assert.ok(rendered.includes(`alt="${run(`getExercise(${JSON.stringify(name)}).images.altPrimary`)}"`));
  assert.strictEqual((rendered.match(/<img /g)||[]).length,1);
}

vm.runInContext(`state.workoutDefinitions.Targets={id:'workout:targets',name:'Targets',exercises:['Cat-Cow','Hamstring Stretch','Thoracic Rotation','Mountain Pose','Commencing Form','Wall Sit'].map((name,index)=>exerciseSnapshot(name,index))}`,sandbox);
assert.ok(run(`state.workoutDefinitions.Targets.exercises.every(x=>x.instructions&&x.images&&x.images.primary.endsWith('.png'))`));
const saved=JSON.parse(JSON.stringify(sandbox.state));
sandbox.saved=saved;
vm.runInContext(`state=JSON.parse(JSON.stringify(saved))`,sandbox);
assert.ok(run(`normalizedWorkoutDefinitions().Targets.exercises.every(x=>x.images&&x.images.primary.endsWith('.png'))`));

vm.runInContext(`state.workoutDefinitions.NewIsometrics={id:'workout:new-isometrics',name:'NewIsometrics',exercises:Object.keys(newIsometricFiles).map((name,index)=>exerciseSnapshot(name,index))}`,Object.assign(sandbox,{newIsometricFiles}));
assert.ok(run(`state.workoutDefinitions.NewIsometrics.exercises.length===6&&state.workoutDefinitions.NewIsometrics.exercises.every(x=>x.images&&x.images.primary.endsWith('.png'))`));
vm.runInContext(`state.workoutDefinitions.NewIsometricsCopy=deepCopy(state.workoutDefinitions.NewIsometrics);state.workoutDefinitions.NewIsometrics.exercises[0].images.primary='changed.png'`,sandbox);
assert.notStrictEqual(run(`state.workoutDefinitions.NewIsometricsCopy.exercises[0].images.primary`),'changed.png');

vm.runInContext(`state.workoutDefinitions.A={name:'A',exercises:[exerciseSnapshot('Mountain Pose',0)]};state.workoutDefinitions.B={name:'B',exercises:[exerciseSnapshot('Mountain Pose',0)]};state.workoutDefinitions.A.exercises[0].images.primary='changed.png'`,sandbox);
assert.notStrictEqual(run(`state.workoutDefinitions.B.exercises[0].images.primary`),'changed.png');
assert.notStrictEqual(run(`getExercise('Mountain Pose').images.primary`),'changed.png');

vm.runInContext(`state.workoutDefinitions.Legacy=['cat cow','mountain pose','commencing form','wall sit','Unknown Legacy Exercise']`,sandbox);
const legacy=run(`normalizedWorkoutDefinitions().Legacy.exercises`);
assert.ok(legacy.slice(0,4).every(x=>x.images&&x.images.primary.endsWith('.png')));
assert.strictEqual(legacy[4].images,null);

const roundTrip=JSON.parse(JSON.stringify(sandbox.state));
sandbox.roundTrip=roundTrip;
vm.runInContext(`state=JSON.parse(JSON.stringify(roundTrip))`,sandbox);
assert.ok(run(`normalizedWorkoutDefinitions().Targets.exercises.every(x=>x.images&&x.images.primary.endsWith('.png'))`));
assert.ok(run(`normalizedWorkoutDefinitions().NewIsometrics.exercises.every(x=>x.images&&x.images.primary.endsWith('.png'))`));

assert.ok(html.includes('.exerciseInstructionImage{display:block;width:100%'));
assert.ok(html.includes('height:auto;max-height:280px;object-fit:contain'));
assert.ok(html.includes('@media(max-width:599px)'));
assert.ok(source.includes('instructionHtml(x.instructions,x.name,x.images)'));
assert.ok(source.includes('instructionHtml(x.instructions,name,x.images)'));

console.log(`Exercise image tests: PASS (${inventory.mapped.length} distinct supplied PNG mappings; ${inventory.missing.length} catalog targets intentionally unmapped)`);
