'use strict';
const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('<script>')+8;
const tracker=html.slice(start,html.indexOf('</script>',start));
const ai=fs.readFileSync('ai-assistance.js','utf8');
let uuid=0,saveResult=true;
const context={console,crypto:{randomUUID:()=>`uuid-${++uuid}`},navigator:{clipboard:{}},document:{readyState:'loading',addEventListener(){},getElementById(){return null;}},window:null,location:{},history:{},alert(){},confirm:()=>true};
context.window=context;vm.createContext(context);vm.runInContext(tracker,context);context.trackerAccountStateChanged=()=>saveResult;vm.runInContext(ai,context);
const run=code=>vm.runInContext(code,context),clone=value=>JSON.parse(JSON.stringify(value)),core=context.NutritionTrackerAI;
const keys=clone(run('KEYS'));
const nutrients=(overrides={})=>Object.assign(Object.fromEntries(keys.map(k=>[k,null])),{calories:10,protein:1,carbs:1,fat:0,fiber:0,sodium:1},overrides);
const proposed=(temporaryKey,name,overrides={})=>({temporaryKey,name,brand:'',category:'Custom',servingAmount:100,servingUnit:'g',nutrients:nutrients(),nutritionSource:'USDA FoodData Central estimate',containsEstimates:true,notes:'Estimated values; verify before saving.',...overrides});
const linkedPackage=(ingredients,proposedFoods=[],overrides={})=>({packageType:'nutrition-tracker-ai-import',schemaVersion:2,operation:'addRecipeWithFoods',createdBy:'user-chatgpt',recipe:{name:'Complete Soup',servings:2,ingredients,notes:'',containsEstimates:false},proposedFoods,...overrides});
const ingredient=(name,link,overrides={})=>({name,brand:'',amount:100,unit:'g',existingFoodId:null,foodTemporaryKey:null,...link,...overrides});
const reset=()=>run(`state=createEmptyTrackerState();state.foods.push(
 {id:'existing-chicken',custom:true,private:true,name:'Chicken breast',brand:'',serving:'100 g',calories:120,protein:25,carbs:0,fat:2,fiber:0,sodium:50},
 {id:'existing-carrot',custom:true,private:true,name:'Carrot',brand:'',serving:'100 g',calories:41,protein:1,carbs:10,fat:0,fiber:3,sodium:69}
);state.profile={...state.profile,age:54};state.entries.push({id:'unrelated-entry',date:'2026-08-04',servings:1,food:{name:'Unrelated'},eaten:false});`);
const state=()=>clone(run('getTrackerState()'));
const rejects=(value,pattern)=>assert.throws(()=>core.validatePackage(clone(value)),pattern);

// Existing operations remain compatible and strictly isolated.
const foodPackage={packageType:'nutrition-tracker-ai-import',schemaVersion:1,operation:'addFood',createdBy:'user-chatgpt',food:{name:'Kroger Cottage Cheese',brand:'Kroger',category:'Dairy',servingAmount:113,servingUnit:'g',nutrients:nutrients({calories:90,protein:13,carbs:5,fat:2.5,sodium:360}),nutritionSource:'package label',containsEstimates:false,notes:''}};
const recipePackage={packageType:'nutrition-tracker-ai-import',schemaVersion:1,operation:'addRecipe',createdBy:'user-chatgpt',recipe:{name:'Legacy Recipe',servings:2,ingredients:[{name:'Chicken breast',brand:'',amount:100,unit:'g',existingFoodId:null}],notes:'',containsEstimates:false}};
reset();assert.strictEqual(core.validatePackage(clone(foodPackage)).operation,'addFood');assert.strictEqual(core.validatePackage(clone(recipePackage)).operation,'addRecipe');
assert.throws(()=>core.parsePackage('{bad'),/not valid JSON/);assert.strictEqual(core.parsePackage('```json\n{"a":1}\n```').a,1);
for(const [field,value,pattern] of [['packageType','wrong',/package type/],['schemaVersion',3,/schema version/],['operation','deleteFood',/prohibited operation/]]){const p=clone(foodPackage);p[field]=value;rejects(p,pattern);}
for(const forbidden of ['ownerId','userId','accountId','storageKey','permanentId']){const p=clone(foodPackage);p.food[forbidden]='forbidden';rejects(p,/prohibited or unknown field/);}
{const p=clone(foodPackage);p.tracker_state={foods:[]};rejects(p,/prohibited or unknown field/);}

// Recipe with all existing foods.
reset();let pkg=linkedPackage([
 ingredient('Chicken breast',{existingFoodId:'existing-chicken'}),
 ingredient('Carrot',{existingFoodId:'existing-carrot'})
]);let validated=core.validatePackage(clone(pkg));assert.deepStrictEqual(clone(core.defaultResolutions(validated).map(x=>x.kind)),['existing','existing']);

// Recipe with all new foods and a mixture of existing/new foods.
reset();pkg=linkedPackage([ingredient('Sea salt',{foodTemporaryKey:'salt'}),ingredient('Spice',{foodTemporaryKey:'spice'})],[proposed('salt','Sea salt',{servingAmount:1,nutrients:nutrients({calories:0,protein:0,carbs:0,fat:0,fiber:0,sodium:387})}),proposed('spice','Spice')]);validated=core.validatePackage(clone(pkg));assert.deepStrictEqual(clone(core.defaultResolutions(validated).map(x=>x.kind)),['proposed','proposed']);
reset();pkg=linkedPackage([ingredient('Chicken breast',{existingFoodId:'existing-chicken'}),ingredient('Spice',{foodTemporaryKey:'spice'})],[proposed('spice','Spice')]);validated=core.validatePackage(clone(pkg));assert.deepStrictEqual(clone(core.defaultResolutions(validated).map(x=>x.kind)),['existing','proposed']);

// Missing/duplicate/unknown references, cross-account IDs, ambiguity, and invalid nutrition.
reset();rejects(linkedPackage([ingredient('Missing',{foodTemporaryKey:'missing'})],[]),/unknown temporaryKey|Missing proposed food/);
{const p=linkedPackage([ingredient('Salt',{foodTemporaryKey:'same'})],[proposed('same','Salt'),proposed('same','Pepper')]);rejects(p,/Duplicate temporaryKey/);}
{const p=linkedPackage([ingredient('Salt',{foodTemporaryKey:'unknown'})],[proposed('known','Salt')]);rejects(p,/unknown temporaryKey/);}
{const p=linkedPackage([ingredient('Other account',{existingFoodId:'other-user-food'})]);rejects(p,/active account/);}
run(`state.foods.push({id:'milk-a',custom:true,private:true,name:'Milk',serving:'100 g'},{id:'milk-b',custom:true,private:true,name:'Milk',serving:'100 g'});`);
pkg=linkedPackage([ingredient('Milk',{foodTemporaryKey:'milk-new'})],[proposed('milk-new','Milk')]);validated=core.validatePackage(clone(pkg));assert.strictEqual(validated.matches[0].length,2);assert.strictEqual(core.defaultResolutions(validated)[0].kind,'ambiguous');assert.throws(()=>core.approveImport(validated),/Resolve every ambiguous/);
{const bad=proposed('bad','Bad food');bad.nutrients.calories=null;rejects(linkedPackage([ingredient('Bad food',{foodTemporaryKey:'bad'})],[bad]),/calories nutrient is required/);}
{const bad=proposed('bad','Bad food');bad.nutrients.sodium='unknown';rejects(linkedPackage([ingredient('Bad food',{foodTemporaryKey:'bad'})],[bad]),/finite number/);}
{const bad=proposed('bad','Bad food');bad.nutritionSource='';rejects(linkedPackage([ingredient('Bad food',{foodTemporaryKey:'bad'})],[bad]),/Nutrition source is required/);}
{const bad=proposed('bad','Bad food');delete bad.nutrients.choline;rejects(linkedPackage([ingredient('Bad food',{foodTemporaryKey:'bad'})],[bad]),/choline nutrient field is required/);}
{const bad=proposed('salt','Sea salt',{nutrients:nutrients({sodium:0})});rejects(linkedPackage([ingredient('Sea salt',{foodTemporaryKey:'salt'})],[bad]),/Salt must include sodium/);}
{const bad=proposed('sweetener','Zero-calorie sweetener',{nutrients:nutrients({calories:0,sugar:null})});rejects(linkedPackage([ingredient('Zero-calorie sweetener',{foodTemporaryKey:'sweetener'})],[bad]),/numeric sugar value/);}

// Validation and cancellation are non-mutating.
reset();const cancelBefore=state();core.validatePackage(clone(linkedPackage([ingredient('Spice',{foodTemporaryKey:'spice'})],[proposed('spice','Spice')])));assert.deepStrictEqual(state(),cancelBefore,'cancellation after review must produce no changes');

// Approval adds every food and the recipe, links generated IDs, calculates all ingredients, and preserves unrelated state.
reset();const unrelatedBefore=state();pkg=linkedPackage([ingredient('Salt',{foodTemporaryKey:'salt'}),ingredient('Spice',{foodTemporaryKey:'spice'})],[proposed('salt','Salt',{nutrients:nutrients({calories:0,protein:0,carbs:0,fat:0,fiber:0,sodium:400})}),proposed('spice','Spice',{nutrients:nutrients({calories:20,protein:2,carbs:4,fat:1,fiber:2,sodium:3})})]);validated=core.validatePackage(clone(pkg));saveResult=true;const imported=core.approveImport(validated);let after=state();
assert.strictEqual(after.foods.length,unrelatedBefore.foods.length+2);assert.strictEqual(after.recipes.length,1);assert.strictEqual(imported.createdFoodIds.length,2);assert.ok(after.recipes[0].ingredients.every(x=>imported.createdFoodIds.includes(x.foodId)));assert.ok(after.recipes[0].ingredients.every(x=>!String(x.foodId).includes('salt')&&!String(x.foodId).includes('spice')));assert.strictEqual(after.recipes[0].nutrition.calories,10);assert.strictEqual(after.recipes[0].nutrition.sodium,201.5);assert.deepStrictEqual(after.profile,unrelatedBefore.profile);assert.deepStrictEqual(after.entries,unrelatedBefore.entries);

// Partial save failure rolls back the complete state, including unrelated data.
reset();const rollbackBefore=state();validated=core.validatePackage(clone(pkg));saveResult=false;assert.throws(()=>core.approveImport(validated),/Save failed/);assert.deepStrictEqual(state(),rollbackBefore);saveResult=true;

// Undo removes the recipe and unused import-created foods.
reset();validated=core.validatePackage(clone(pkg));const undoable=core.approveImport(validated);const baseFoodCount=state().foods.length-2;const undoResult=core.undoImport(undoable);after=state();assert.strictEqual(after.recipes.length,0);assert.strictEqual(after.foods.length,baseFoodCount);assert.deepStrictEqual(new Set(undoResult.removedFoodIds),new Set(undoable.createdFoodIds));assert.strictEqual(after.profile.age,54);assert.strictEqual(after.entries[0].id,'unrelated-entry');

// Undo removes the imported recipe but retains a created food used by another recipe.
reset();validated=core.validatePackage(clone(pkg));const shared=core.approveImport(validated),keptId=shared.createdFoodIds[0];run(`state.recipes.push({id:'later-recipe',name:'Later recipe',servings:1,ingredients:[{name:'Salt',brand:'',amount:1,unit:'g',foodId:${JSON.stringify(keptId)},resolution:'existing'}],nutrition:{}});`);core.undoImport(shared);after=state();assert.ok(after.foods.some(f=>f.id===keptId));assert.ok(after.recipes.some(r=>r.id==='later-recipe'));assert.ok(!after.recipes.some(r=>r.id===shared.record.id));

// Prompt and source safety requirements.
const prompt=core.schemaPrompt('addRecipeWithFoods','Branded sweetener and salt',4);for(const text of ['addRecipeWithFoods','proposedFoods','temporaryKey','complete proposedFoods record','Salt must include sodium','Preserve supplied brand names','calories, protein, carbs, fat, fiber, and sodium'])assert.ok(prompt.includes(text),`prompt missing ${text}`);
assert.ok(ai.includes("source:'chatgpt-assisted'")&&ai.includes('if(!save())'));assert.ok(!ai.includes('eval(')&&!ai.includes('Function(')&&!ai.includes('api.openai.com'));assert.ok(html.includes('AI Assistance uses your own ChatGPT account'));assert.ok(ai.includes('https://chatgpt.com/'));

console.log('AI Assistance tests: PASS (legacy compatibility; all-existing/all-new/mixed recipe foods; strict references and nutrition; ambiguity/cross-account rejection; non-mutating review; atomic approval/rollback; generated links/calculation; safe surgical undo; unrelated-data preservation; privacy)');
