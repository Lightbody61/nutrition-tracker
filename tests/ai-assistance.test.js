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
const recipeInstructions=['Simmer the ingredients together.','Serve hot.'];
const linkedPackage=(ingredients,proposedFoods=[],overrides={})=>({packageType:'nutrition-tracker-ai-import',schemaVersion:2,operation:'addRecipeWithFoods',createdBy:'user-chatgpt',recipe:{name:'Complete Soup',servings:2,ingredients,instructions:recipeInstructions,notes:'',containsEstimates:false},proposedFoods,...overrides});
const ingredient=(name,link,overrides={})=>({name,brand:'',amount:100,unit:'g',existingFoodId:null,foodTemporaryKey:null,...link,...overrides});
const honeyNotes='Cooking instructions: Line a small tray or plate with parchment paper. Combine the honey, ground ginger, and water in a small heavy-bottomed saucepan. Heat over medium-low heat, stirring until evenly blended. Bring to a gentle boil, then cook without vigorous stirring until the mixture reaches 300°F (149°C), the hard-crack stage, on a candy thermometer. Remove from the heat immediately and allow the bubbling to settle briefly. Carefully spoon small portions onto the parchment or pour into heat-safe silicone candy molds. Cool completely until firm, then remove and store in an airtight container with parchment between layers. Hot honey syrup can cause severe burns; do not touch or taste it until fully cooled. Ingredient quantities and the yield of 10 servings are estimated; final candy weight and serving size will vary with evaporation and portioning.';
const honeyPackage={"packageType":"nutrition-tracker-ai-import","schemaVersion":2,"operation":"addRecipeWithFoods","createdBy":"user-chatgpt","recipe":{"name":"Honey Ginger Candy","servings":10,"ingredients":[{"name":"Honey","brand":"","amount":280,"unit":"g","existingFoodId":"2932869d-2da3-40a5-8703-2980854a0c54","foodTemporaryKey":null},{"name":"Ground ginger","brand":"","amount":6,"unit":"g","existingFoodId":"424e5ff4-1b5e-410d-91f5-9452f3fa801f","foodTemporaryKey":null},{"name":"Water","brand":"","amount":30,"unit":"ml","existingFoodId":"7ce21fd9-040e-4b77-8fdf-077a6f77f9f5","foodTemporaryKey":null}],"notes":honeyNotes,"containsEstimates":true},"proposedFoods":[]};
const reset=()=>run(`state=createEmptyTrackerState();state.foods.push(
 {id:'existing-chicken',custom:true,private:true,name:'Chicken breast',brand:'',category:'Meat',serving:'100 g',calories:120,protein:25,carbs:0,fat:2,fiber:0,sodium:50,ownerId:'owner-secret',userId:'user-secret',accountId:'account-secret',storageKey:'storage-secret',settings:{theme:'private'},entries:[{id:'saved-day-secret'}]},
 {id:'existing-carrot',custom:true,private:true,name:'Carrot',brand:'',category:'Vegetables',serving:'100 g',calories:41,protein:1,carbs:10,fat:0,fiber:3,sodium:69},
 {id:'brand:exact/001',custom:true,private:true,name:'Peanut Butter',brand:'Kroger Natural',category:'Pantry',serving:'2 tbsp',calories:190,protein:7,carbs:0,fat:16,fiber:2,sodium:0},
 {id:'missing-optional',custom:true,private:true,name:'Mystery Item',serving:''},
 {id:'2932869d-2da3-40a5-8703-2980854a0c54',custom:true,private:true,name:'Honey',brand:'',category:'Custom',serving:'100 g',calories:304,protein:0.3,carbs:82.4,fat:0,fiber:0,sodium:4},
 {id:'424e5ff4-1b5e-410d-91f5-9452f3fa801f',custom:true,private:true,name:'Ground ginger',brand:'',category:'Custom',serving:'100 g',calories:335,protein:9,carbs:72,fat:4.2,fiber:14,sodium:27},
 {id:'7ce21fd9-040e-4b77-8fdf-077a6f77f9f5',custom:true,private:true,name:'Water',brand:'',category:'Custom',serving:'100 ml',calories:0,protein:0,carbs:0,fat:0,fiber:0,sodium:0}
);state.profile={...state.profile,age:54};state.entries.push({id:'unrelated-entry',date:'2026-08-04',servings:1,food:{name:'Unrelated'},eaten:false});`);
const state=()=>clone(run('getTrackerState()'));
const setState=value=>{context.testState=clone(value);run('state=testState');};
const rejects=(value,pattern)=>assert.throws(()=>core.validatePackage(clone(value)),pattern);
const promptFoods=prompt=>{
 const marker='existingFoods JSON array';
 const start=prompt.indexOf('[',prompt.indexOf(marker));
 const end=prompt.indexOf('\n\nExisting-food matching rules:',start);
 return JSON.parse(prompt.slice(start,end));
};

// Existing operations remain compatible and strictly isolated.
const foodPackage={packageType:'nutrition-tracker-ai-import',schemaVersion:1,operation:'addFood',createdBy:'user-chatgpt',food:{name:'Kroger Cottage Cheese',brand:'Kroger',category:'Dairy',servingAmount:113,servingUnit:'g',nutrients:nutrients({calories:90,protein:13,carbs:5,fat:2.5,sodium:360}),nutritionSource:'package label',containsEstimates:false,notes:''}};
const recipePackage={packageType:'nutrition-tracker-ai-import',schemaVersion:1,operation:'addRecipe',createdBy:'user-chatgpt',recipe:{name:'Legacy Recipe',servings:2,ingredients:[{name:'Chicken breast',brand:'',amount:100,unit:'g',existingFoodId:null}],instructions:['Cook the chicken until done.'],notes:'',containsEstimates:false}};
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
assert.strictEqual(validated.proposedFoods.length,0);
assert.strictEqual(validated.plans.every(x=>!x.proposedFood),true);

// Recipe with all new foods and a mixture of existing/new foods.
reset();pkg=linkedPackage([ingredient('Sea salt',{foodTemporaryKey:'salt'}),ingredient('Spice',{foodTemporaryKey:'spice'})],[proposed('salt','Sea salt',{servingAmount:1,nutrients:nutrients({calories:0,protein:0,carbs:0,fat:0,fiber:0,sodium:387})}),proposed('spice','Spice')]);validated=core.validatePackage(clone(pkg));assert.deepStrictEqual(clone(core.defaultResolutions(validated).map(x=>x.kind)),['proposed','proposed']);
reset();pkg=linkedPackage([ingredient('Chicken breast',{existingFoodId:'existing-chicken'}),ingredient('Spice',{foodTemporaryKey:'spice'})],[proposed('spice','Spice')]);validated=core.validatePackage(clone(pkg));assert.deepStrictEqual(clone(core.defaultResolutions(validated).map(x=>x.kind)),['existing','proposed']);
assert.strictEqual(validated.recipe.ingredients[0].foodTemporaryKey,null);assert.strictEqual(validated.recipe.ingredients[1].existingFoodId,null);
assert.strictEqual(validated.proposedFoods.length,1);assert.strictEqual(validated.proposedFoods[0].temporaryKey,'spice');

// Missing/duplicate/unknown references, cross-account IDs, ambiguity, and invalid nutrition.
reset();rejects(linkedPackage([ingredient('Missing',{foodTemporaryKey:'missing'})],[]),/unknown temporaryKey|Missing proposed food/);
{const p=linkedPackage([ingredient('Salt',{foodTemporaryKey:'same'})],[proposed('same','Salt'),proposed('same','Pepper')]);rejects(p,/Duplicate temporaryKey/);}
{const p=linkedPackage([ingredient('Salt',{foodTemporaryKey:'unknown'})],[proposed('known','Salt')]);rejects(p,/unknown temporaryKey/);}
{const p=linkedPackage([ingredient('Other account',{existingFoodId:'other-user-food'})]);rejects(p,/active account/);}
{const p=linkedPackage([ingredient('Salt',{foodTemporaryKey:'salt'})],[proposed('salt','Salt')]);delete p.recipe.instructions;assert.deepStrictEqual(clone(core.validatePackage(clone(p)).recipe.instructions),[]);}
{const p=linkedPackage([ingredient('Salt',{foodTemporaryKey:'salt'})],[proposed('salt','Salt')]);p.recipe.instructions=[' ',''];assert.deepStrictEqual(clone(core.validatePackage(clone(p)).recipe.instructions),[]);}
{const p=linkedPackage([ingredient('Salt',{foodTemporaryKey:'salt'})],[proposed('salt','Salt')]);p.recipe.instructions=[];p.recipe.cookingInstructions='1. Mix salt.\\n2. Serve.';assert.deepStrictEqual(clone(core.validatePackage(clone(p)).recipe.instructions),['Mix salt.','Serve.']);}
{const p=linkedPackage([ingredient('Salt',{foodTemporaryKey:'salt'})],[proposed('salt','Salt')]);p.recipe.instructions=['Already correct.'];p.recipe.directions=['Do not duplicate this legacy direction.'];assert.deepStrictEqual(clone(core.validatePackage(clone(p)).recipe.instructions),['Already correct.']);}
{const p=linkedPackage([ingredient('Salt',{foodTemporaryKey:'salt'})],[proposed('salt','Salt')]);delete p.recipe.instructions;p.recipe.notes='Kitchen note.\\nDirections: Mix salt.\\nServe.';const normalized=core.validatePackage(clone(p)).recipe;assert.deepStrictEqual(clone(normalized.instructions),['Mix salt.','Serve.']);assert.strictEqual(normalized.notes,'Kitchen note.');}
run(`state.foods.push({id:'milk-a',custom:true,private:true,name:'Milk',serving:'100 g'},{id:'milk-b',custom:true,private:true,name:'Milk',serving:'100 g'});`);
pkg=linkedPackage([ingredient('Milk',{foodTemporaryKey:'milk-new'})],[proposed('milk-new','Milk')]);validated=core.validatePackage(clone(pkg));assert.strictEqual(validated.matches[0].length,2);assert.strictEqual(core.defaultResolutions(validated)[0].kind,'ambiguous');assert.throws(()=>core.approveImport(validated),/Resolve every ambiguous/);
{const bad=proposed('bad','Bad food');bad.nutrients.calories=null;rejects(linkedPackage([ingredient('Bad food',{foodTemporaryKey:'bad'})],[bad]),/calories nutrient is required/);}
{const bad=proposed('bad','Bad food');bad.nutrients.sodium='unknown';rejects(linkedPackage([ingredient('Bad food',{foodTemporaryKey:'bad'})],[bad]),/finite number/);}
{const bad=proposed('bad','Bad food');bad.nutritionSource='';rejects(linkedPackage([ingredient('Bad food',{foodTemporaryKey:'bad'})],[bad]),/Nutrition source is required/);}
{const bad=proposed('bad','Bad food');delete bad.nutrients.choline;rejects(linkedPackage([ingredient('Bad food',{foodTemporaryKey:'bad'})],[bad]),/choline nutrient field is required/);}
{const bad=proposed('salt','Sea salt',{nutrients:nutrients({sodium:0})});rejects(linkedPackage([ingredient('Sea salt',{foodTemporaryKey:'salt'})],[bad]),/Salt must include sodium/);}
{const bad=proposed('sweetener','Zero-calorie sweetener',{nutrients:nutrients({calories:0,sugar:null})});rejects(linkedPackage([ingredient('Zero-calorie sweetener',{foodTemporaryKey:'sweetener'})],[bad]),/numeric sugar value/);}
assert.strictEqual(core.findMatches({name:'Peanut Butter',brand:'Store Brand',unit:'tbsp'}).length,0);

// Validation and cancellation are non-mutating.
reset();const cancelBefore=state();core.validatePackage(clone(linkedPackage([ingredient('Spice',{foodTemporaryKey:'spice'})],[proposed('spice','Spice')])));assert.deepStrictEqual(state(),cancelBefore,'cancellation after review must produce no changes');
const promptBefore=state(),uuidBefore=uuid;
const foodPrompt=core.schemaPrompt('addFood','Add a food that may already exist',1),legacyPrompt=core.schemaPrompt('addRecipe','Legacy recipe from chicken and carrots',2),linkedPrompt=core.schemaPrompt('addRecipeWithFoods','Recipe with Kroger Natural peanut butter and chicken',4);
assert.deepStrictEqual(state(),promptBefore,'prompt generation must not mutate existing foods or tracker state');assert.strictEqual(uuid,uuidBefore,'prompt generation must not generate IDs');
for(const promptText of [foodPrompt,legacyPrompt,linkedPrompt])assert.ok(promptText.includes('existingFoods JSON array')&&promptText.includes('Existing-food matching rules')&&promptText.includes('Never invent, alter, shorten, or reconstruct an existingFoodId.'));
for(const [promptText,operationText] of [[foodPrompt,'"operation":"addFood"'],[legacyPrompt,'"operation":"addRecipe"'],[linkedPrompt,'"operation":"addRecipeWithFoods"']])assert.ok(promptText.includes(operationText),`prompt missing ${operationText}`);
const foods=promptFoods(linkedPrompt),chicken=foods.find(f=>f.id==='existing-chicken'),peanut=foods.find(f=>f.id==='brand:exact/001'),optional=foods.find(f=>f.id==='missing-optional');
assert.ok(chicken&&peanut&&optional);assert.strictEqual(chicken.name,'Chicken breast');assert.strictEqual(chicken.brand,'');assert.strictEqual(chicken.category,'Meat');assert.strictEqual(chicken.servingAmount,100);assert.strictEqual(chicken.servingUnit,'g');assert.strictEqual(chicken.nutrients.carbs,0);assert.strictEqual(chicken.nutrients.fiber,0);
assert.strictEqual(peanut.id,'brand:exact/001');assert.strictEqual(peanut.brand,'Kroger Natural');assert.strictEqual(peanut.servingAmount,2);assert.strictEqual(peanut.servingUnit,'tbsp');assert.strictEqual(peanut.nutrients.sodium,0);
assert.strictEqual(optional.brand,'');assert.strictEqual(optional.category,'');assert.strictEqual(optional.servingAmount,1);assert.strictEqual(optional.servingUnit,'');
for(const forbidden of ['owner-secret','user-secret','account-secret','storage-secret','saved-day-secret','theme'])assert.ok(!linkedPrompt.includes(forbidden),`prompt leaked ${forbidden}`);

// Approval adds every food and the recipe, links generated IDs, calculates all ingredients, and preserves unrelated state.
reset();const unrelatedBefore=state();pkg=linkedPackage([ingredient('Salt',{foodTemporaryKey:'salt'}),ingredient('Spice',{foodTemporaryKey:'spice'})],[proposed('salt','Salt',{nutrients:nutrients({calories:0,protein:0,carbs:0,fat:0,fiber:0,sodium:400})}),proposed('spice','Spice',{nutrients:nutrients({calories:20,protein:2,carbs:4,fat:1,fiber:2,sodium:3})})]);validated=core.validatePackage(clone(pkg));saveResult=true;const imported=core.approveImport(validated);let after=state();
assert.strictEqual(after.foods.length,unrelatedBefore.foods.length+2);assert.strictEqual(after.recipes.length,1);assert.strictEqual(imported.createdFoodIds.length,2);assert.ok(after.recipes[0].ingredients.every(x=>imported.createdFoodIds.includes(x.foodId)));assert.ok(after.recipes[0].ingredients.every(x=>!String(x.foodId).includes('salt')&&!String(x.foodId).includes('spice')));assert.deepStrictEqual(after.recipes[0].instructions,recipeInstructions);assert.strictEqual(after.recipes[0].nutrition.calories,10);assert.strictEqual(after.recipes[0].nutrition.sodium,201.5);assert.deepStrictEqual(after.profile,unrelatedBefore.profile);assert.deepStrictEqual(after.entries,unrelatedBefore.entries);

// Exact Honey Ginger Candy regression: prefixed notes become ordered cooking instructions without changing ingredients, servings, nutrition inputs, or food references.
reset();const honeyBefore=clone(honeyPackage.recipe),honeyValidated=core.validatePackage(clone(honeyPackage));
assert.strictEqual(honeyValidated.operation,'addRecipeWithFoods');
assert.strictEqual(honeyValidated.recipe.servings,10);
assert.deepStrictEqual(clone(honeyValidated.recipe.ingredients),honeyBefore.ingredients);
assert.strictEqual(honeyValidated.proposedFoods.length,0);
assert.deepStrictEqual(clone(core.defaultResolutions(honeyValidated).map(x=>x.food.id)),honeyBefore.ingredients.map(x=>x.existingFoodId));
assert.ok(honeyValidated.recipe.instructions.length>=6);
assert.strictEqual(honeyValidated.recipe.instructions[0],'Line a small tray or plate with parchment paper.');
assert.ok(honeyValidated.recipe.instructions.some(x=>x.includes('300°F (149°C)')));
assert.ok(honeyValidated.recipe.instructions.some(x=>x.includes('airtight container with parchment between layers.')));
assert.ok(honeyValidated.recipe.notes.includes('Hot honey syrup can cause severe burns; do not touch or taste it until fully cooled.'));
assert.ok(honeyValidated.recipe.notes.includes('Ingredient quantities and the yield of 10 servings are estimated; final candy weight and serving size will vary with evaporation and portioning.'));
const honeyImport=core.approveImport(honeyValidated),honeyState=state(),honeyRecipe=honeyState.recipes.find(r=>r.id===honeyImport.record.id);
assert.deepStrictEqual(honeyRecipe.ingredients.map(x=>({name:x.name,brand:x.brand,amount:x.amount,unit:x.unit,foodId:x.foodId})),honeyBefore.ingredients.map(x=>({name:x.name,brand:x.brand,amount:x.amount,unit:x.unit,foodId:x.existingFoodId})));
assert.strictEqual(honeyRecipe.servings,10);
assert.deepStrictEqual(honeyRecipe.instructions,clone(honeyValidated.recipe.instructions));
assert.deepStrictEqual(honeyRecipe.nutrition,clone(honeyImport.record.nutrition));
assert.ok(honeyRecipe.notes.includes('severe burns')&&honeyRecipe.notes.includes('estimated; final candy weight'));
const honeyOriginalParts=honeyNotes.replace(/^Cooking instructions:\s*/,'').match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g);
const honeyCombined=`${honeyRecipe.instructions.join(' ')} ${honeyRecipe.notes}`;
for(const part of honeyOriginalParts)assert.ok(honeyCombined.includes(part.trim()),`lost Honey notes text: ${part}`);
run(`state=createEmptyTrackerState();`);
context.backup=honeyState;
assert.strictEqual(run('applyTrackerState(backup)'),true);
assert.deepStrictEqual(run('getTrackerState().recipes[0].instructions'),honeyRecipe.instructions);

// Partial save failure rolls back the complete state, including unrelated data.
reset();const rollbackBefore=state();validated=core.validatePackage(clone(pkg));saveResult=false;assert.throws(()=>core.approveImport(validated),/Save failed/);assert.deepStrictEqual(state(),rollbackBefore);saveResult=true;

// Undo removes the recipe and unused import-created foods.
reset();validated=core.validatePackage(clone(pkg));const undoable=core.approveImport(validated);const baseFoodCount=state().foods.length-2;const undoResult=core.undoImport(undoable);after=state();assert.strictEqual(after.recipes.length,0);assert.strictEqual(after.foods.length,baseFoodCount);assert.deepStrictEqual(new Set(undoResult.removedFoodIds),new Set(undoable.createdFoodIds));assert.strictEqual(after.profile.age,54);assert.strictEqual(after.entries[0].id,'unrelated-entry');

// Undo removes the imported recipe but retains a created food used by another recipe.
reset();validated=core.validatePackage(clone(pkg));const shared=core.approveImport(validated),keptId=shared.createdFoodIds[0];run(`state.recipes.push({id:'later-recipe',name:'Later recipe',servings:1,ingredients:[{name:'Salt',brand:'',amount:1,unit:'g',foodId:${JSON.stringify(keptId)},resolution:'existing'}],nutrition:{}});`);core.undoImport(shared);after=state();assert.ok(after.foods.some(f=>f.id===keptId));assert.ok(after.recipes.some(r=>r.id==='later-recipe'));assert.ok(!after.recipes.some(r=>r.id===shared.record.id));

// Meal-plan generation, validation, matching, date handling, import choices, and rollback.
const mealRequest={startDate:'2026-08-10',endDate:'2026-08-11',goals:['Weight loss','Keto','Other'],weightLossDegree:'moderate',otherGoal:'No shellfish',notes:'1200 calories, avoid peanuts'};
assert.deepStrictEqual(clone(core.inclusiveDates('2026-08-10','2026-08-11')),['2026-08-10','2026-08-11']);
assert.throws(()=>core.validateMealPlanRequest({...mealRequest,startDate:''}),/start date/);
assert.throws(()=>core.validateMealPlanRequest({...mealRequest,endDate:'2026-08-09'}),/End date/);
assert.throws(()=>core.validateMealPlanRequest({...mealRequest,startDate:'2026-08-01',endDate:'2026-09-01'}),/31 inclusive days/);
assert.throws(()=>core.validateMealPlanRequest({...mealRequest,goals:[]}),/at least one goal/);
assert.strictEqual(core.validateMealPlanRequest({...mealRequest,calorieAdjustmentAmount:'',calorieAdjustmentType:''}).calorieAdjustment,null);
assert.strictEqual(core.validateMealPlanRequest({...mealRequest,calorieAdjustmentAmount:'',calorieAdjustmentType:'deficit'}).calorieAdjustment,null);
assert.strictEqual(core.validateMealPlanRequest({...mealRequest,calorieAdjustmentAmount:'0',calorieAdjustmentType:''}).calorieAdjustment,null);
assert.deepStrictEqual(clone(core.validateMealPlanRequest({...mealRequest,calorieAdjustmentAmount:'500',calorieAdjustmentType:'deficit'}).calorieAdjustment),{type:'deficit',amount:500});
assert.deepStrictEqual(clone(core.validateMealPlanRequest({...mealRequest,calorieAdjustmentAmount:'250',calorieAdjustmentType:'surplus'}).calorieAdjustment),{type:'surplus',amount:250});
assert.throws(()=>core.validateMealPlanRequest({...mealRequest,calorieAdjustmentAmount:'500',calorieAdjustmentType:''}),/Select Deficit or Surplus/);
for(const amount of ['-1','abc','12.5','2001'])assert.throws(()=>core.validateMealPlanRequest({...mealRequest,calorieAdjustmentAmount:amount,calorieAdjustmentType:'deficit'}),/whole number from 0 through 2,000/);
reset();const mealPrompt=core.mealPlanPrompt(mealRequest);
for(const text of ['Weight loss (moderate)','Keto','Other: No shellfish','1200 calories, avoid peanuts','No maintenance-relative calorie deficit or surplus was supplied.','2026-08-10, 2026-08-11','nutrition-tracker-ai-meal-plan','This is not a medical prescription','Existing private Food List JSON','Existing recipes JSON'])assert.ok(mealPrompt.includes(text),`meal prompt missing ${text}`);
assert.ok(!mealPrompt.includes('owner-secret')&&!mealPrompt.includes('user-secret'));
const deficitPrompt=core.mealPlanPrompt({...mealRequest,calorieAdjustmentType:'deficit',calorieAdjustmentAmount:'500'});
assert.ok(deficitPrompt.includes("Create each daily menu at a 500-calorie daily deficit relative to the user's maintenance target."));
assert.ok(deficitPrompt.includes('Potential calorie conflict')&&deficitPrompt.includes('absolute daily calorie target')&&deficitPrompt.includes('Do not confuse the 500-calorie daily deficit with an absolute daily calorie target.'));
const surplusPrompt=core.mealPlanPrompt({...mealRequest,notes:'higher protein',calorieAdjustmentType:'surplus',calorieAdjustmentAmount:'250'});
assert.ok(surplusPrompt.includes("Create each daily menu at a 250-calorie daily surplus relative to the user's maintenance target."));
assert.ok(!surplusPrompt.includes('Potential calorie conflict'));
const mealNutrients=(overrides={})=>nutrients({calories:300,protein:25,carbs:8,fat:14,fiber:3,sodium:220,...overrides});
const mealPlanPackage={packageType:'nutrition-tracker-ai-meal-plan',schemaVersion:1,createdBy:'user-chatgpt',startDate:'2026-08-10',endDate:'2026-08-11',days:[
 {date:'2026-08-10',items:[{meal:'Breakfast',type:'food',name:'Chicken breast',quantity:1.5,servingUnit:'serving',foodId:null,recipeId:null,nutrients:mealNutrients({calories:120,protein:25,carbs:0,fat:2,fiber:0,sodium:50}),notes:''},{meal:'Dinner',type:'food',name:'New salmon bowl',quantity:1,servingUnit:'bowl',foodId:null,recipeId:null,nutrients:mealNutrients({calories:410,protein:34,carbs:12,fat:22,fiber:4,sodium:390}),notes:'Estimated.'}]},
 {date:'2026-08-11',items:[{meal:'Lunch',type:'recipe',name:'Complete Soup',quantity:2,servingUnit:'serving',foodId:null,recipeId:null,nutrients:mealNutrients({calories:250,protein:20,carbs:10,fat:12,fiber:2,sodium:300}),notes:''}]}
]};
run(`state.recipes.push({id:'recipe-complete-soup',name:'Complete Soup',category:'Custom',servings:2,serving:'1 serving',nutrition:{calories:111,protein:11,carbs:5,fat:4,fiber:1,sodium:99}});render=()=>{};`);
let mealValidated=core.parseMealPlanPackage('```json\n'+JSON.stringify(mealPlanPackage)+'\n```',mealRequest);
assert.strictEqual(mealValidated.days.length,2);
assert.strictEqual(mealValidated.days[0].items[0].match.kind,'food');
assert.strictEqual(mealValidated.days[0].items[1].match.kind,'generated');
assert.strictEqual(mealValidated.days[1].items[0].match.kind,'recipe');
assert.strictEqual(core.mealPlanDailyTotals(mealValidated.days[0]).calories,590);
assert.throws(()=>core.parseMealPlanPackage('{bad',mealRequest),/not valid JSON/);
{const bad=clone(mealPlanPackage);bad.days=bad.days.slice(0,1);assert.throws(()=>core.parseMealPlanPackage(JSON.stringify(bad),mealRequest),/missing 2026-08-11/);}
{const bad=clone(mealPlanPackage);bad.days[1].date='2026-08-12';assert.throws(()=>core.parseMealPlanPackage(JSON.stringify(bad),mealRequest),/out-of-range date/);}
{const bad=clone(mealPlanPackage);bad.days[1].date='2026-08-10';assert.throws(()=>core.parseMealPlanPackage(JSON.stringify(bad),mealRequest),/duplicate date/);}
{const bad=clone(mealPlanPackage);bad.days[0].items[0].quantity=0;assert.throws(()=>core.parseMealPlanPackage(JSON.stringify(bad),mealRequest),/greater than zero/);}
{const bad=clone(mealPlanPackage);bad.days[0].items[0].nutrients.calories=null;assert.throws(()=>core.parseMealPlanPackage(JSON.stringify(bad),mealRequest),/calories is required/);}
let importResult=core.importValidatedMealPlan(mealValidated,'append');after=state();
assert.deepStrictEqual(clone(importResult),{days:2,items:3,mode:'append'});
assert.deepStrictEqual(after.entries.map(e=>e.date).filter(d=>d>='2026-08-10').sort(),['2026-08-10','2026-08-10','2026-08-11']);
assert.strictEqual(after.entries.find(e=>e.food.name==='Chicken breast').food.calories,120);
assert.strictEqual(after.entries.find(e=>e.food.name==='Complete Soup').food.calories,111);
assert.strictEqual(after.entries.find(e=>e.food.name==='New salmon bowl').food.calories,410);
const appendBase=state();
mealValidated=core.parseMealPlanPackage(JSON.stringify(mealPlanPackage),mealRequest);
core.importValidatedMealPlan(mealValidated,'append');
assert.strictEqual(state().entries.filter(e=>e.date==='2026-08-10').length,4);
setState(appendBase);mealValidated=core.parseMealPlanPackage(JSON.stringify(mealPlanPackage),mealRequest);
core.importValidatedMealPlan(mealValidated,'replace');
after=state();assert.strictEqual(after.entries.filter(e=>e.date==='2026-08-10').length,2);assert.strictEqual(after.entries.filter(e=>e.date==='2026-08-11').length,1);
setState(appendBase);mealValidated=core.parseMealPlanPackage(JSON.stringify(mealPlanPackage),mealRequest);
core.importValidatedMealPlan(mealValidated,'cancel');
assert.strictEqual(JSON.stringify(state()),JSON.stringify(appendBase));
setState(appendBase);mealValidated=core.parseMealPlanPackage(JSON.stringify(mealPlanPackage),mealRequest);saveResult=false;core.importValidatedMealPlan(mealValidated,'replace');assert.strictEqual(JSON.stringify(state()),JSON.stringify(appendBase));saveResult=true;

async function runCopyButtonRegressionTests(){
 function element(id,tag='div'){
  const listeners={},children=[],el={id,tagName:tag.toUpperCase(),value:'',textContent:'',checked:false,disabled:false,dataset:{},style:{},children,parentElement:null,attributes:{},
   classList:{classes:new Set(),add(name){this.classes.add(name);},remove(name){this.classes.delete(name);},toggle(name,on){if(on)this.classes.add(name);else this.classes.delete(name);},contains(name){return this.classes.has(name);}},
   setAttribute(name,value){this.attributes[name]=String(value);},
   appendChild(child){child.parentElement=this;children.push(child);return child;},
   removeChild(child){const i=children.indexOf(child);if(i>=0)children.splice(i,1);child.parentElement=null;},
   remove(){if(this.parentElement)this.parentElement.removeChild(this);},
   focus(){},
   select(){this.selected=true;},
   setSelectionRange(start,end){this.selection=[start,end];},
   addEventListener(type,fn){(listeners[type]||(listeners[type]=[])).push(fn);},
   dispatchEvent(event){for(const fn of listeners[event.type]||[])fn.call(el,event);},
   listenerCount(type){return (listeners[type]||[]).length;}
  };
  return el;
 }
 function harness({clipboardMode='success',secure=true,execMode=true}={}){
  const elements={},screens={},body=element('body','body'),writes=[],openCalls=[];
  const make=id=>elements[id]=element(id,id.includes('Description')||id.includes('Notes')||id.includes('Package')?'textarea':id.includes('Btn')?'button':'input');
  for(const id of ['aiFoodDescription','aiRecipeDescription','aiRecipeServings','aiFoodPackage','aiRecipePackage','aiImportStatus','aiReviewPanel','aiImportComplete','aiReviewContent','aiCompleteMessage','aiAddTodayBtn','aiReturnBtn','aiUndoBtn','aiMealPlanStart','aiMealPlanEnd','aiGoalWeightLoss','aiGoalKeto','aiGoalHeartHealthy','aiGoalLowCarb','aiGoalLowFat','aiGoalOther','aiWeightLossDegree','aiOtherGoalText','aiMealPlanCalorieAdjustmentType','aiMealPlanCalorieAdjustmentAmount','aiMealPlanNotes','aiMealPlanPackage','aiMealPlanStatus','aiMealPlanConflict','aiMealPlanPreview','aiMealPlanPreviewContent','aiImportMealPlanBtn','aiMealPlanComplete','aiMealPlanCompleteMessage','aiWeightLossDegreeWrap','aiOtherGoalWrap','aiCopyFoodBtn','aiOpenFoodBtn','aiCopyRecipeBtn','aiOpenRecipeBtn','aiPasteFoodBtn','aiPasteRecipeBtn','aiReviewFoodBtn','aiReviewRecipeBtn','aiApproveBtn','aiEditBtn','aiCancelBtn','aiGenerateMealPlanBtn','aiOpenMealPlanBtn','aiPasteMealPlanBtn','aiReviewMealPlanBtn','aiMealPlanAppendBtn','aiMealPlanReplaceBtn','aiMealPlanCancelImportBtn','aiMealPlanOpenTodayBtn'])make(id);
  for(const id of ['aiAddFoodScreen','aiAddRecipeScreen','aiMealPlanScreen']){
   const screen=element(id,'section'),card=element(`${id}Card`,'div');screen.classList.add('screen');screen.classList.add('aiAssist');screen.appendChild(card);screens[id]={screen,card};
  }
  let active='aiAddFoodScreen';
  const document={readyState:'loading',body,addEventListener(){},getElementById:id=>elements[id]||null,createElement:tag=>element('',tag),execCommand(cmd){return cmd==='copy'&&execMode===true;},querySelector(selector){return selector==='.screen.active.aiAssist>.card'?screens[active].card:null;},querySelectorAll(){return [];}};
  const navigator={clipboard:{writeText:async text=>{if(clipboardMode==='reject')throw new Error('blocked');writes.push(String(text));return true;}}};
  if(clipboardMode==='missing')delete navigator.clipboard;
  const ctx={console,crypto:{randomUUID:()=>`dom-uuid-${++uuid}`},navigator,document,window:null,location:{},history:{},alert(){},confirm:()=>true,setTimeout,clearTimeout};
  ctx.window=ctx;ctx.isSecureContext=secure;ctx.open=(url,target,features)=>openCalls.push({url,target,features});
  vm.createContext(ctx);vm.runInContext(tracker,ctx);ctx.trackerAccountStateChanged=()=>true;vm.runInContext('state=createEmptyTrackerState();',ctx);document.readyState='complete';vm.runInContext(ai,ctx);
  return {ctx,elements,writes,openCalls,setActive:id=>{active=id;},flush:()=>new Promise(resolve=>setImmediate(resolve)),body};
 }

 let h=harness();h.setActive('aiAddFoodScreen');h.elements.aiFoodDescription.value='Add cottage cheese with package-label nutrition.';h.elements.aiCopyFoodBtn.dispatchEvent({type:'click'});await h.flush();
 assert.strictEqual(h.writes.length,1);assert.ok(h.writes[0].includes('"operation":"addFood"'));assert.ok(h.writes[0].includes('Add cottage cheese with package-label nutrition.'));assert.ok(!h.writes[0].includes('"operation":"addRecipeWithFoods"'));assert.strictEqual(h.elements.aiImportStatus.textContent,'Instructions copied.');assert.strictEqual(h.elements.aiFoodPackage.value,'');

 h.setActive('aiAddRecipeScreen');h.elements.aiRecipeDescription.value='Add turkey chili with beans.';h.elements.aiRecipeServings.value='6';h.elements.aiCopyRecipeBtn.dispatchEvent({type:'click'});await h.flush();
 assert.strictEqual(h.writes.length,2);assert.ok(h.writes[1].includes('"operation":"addRecipeWithFoods"'));assert.ok(h.writes[1].includes('Add turkey chili with beans.'));assert.ok(h.writes[1].includes('"servings":6'));assert.ok(!h.writes[1].includes('"operation":"addFood"'));assert.strictEqual(h.elements.aiImportStatus.textContent,'Instructions copied.');assert.strictEqual(h.elements.aiRecipePackage.value,'');

 h.setActive('aiMealPlanScreen');h.elements.aiMealPlanStart.value='2026-08-20';h.elements.aiMealPlanEnd.value='2026-08-22';h.elements.aiGoalWeightLoss.checked=true;h.elements.aiWeightLossDegree.value='moderate';h.elements.aiGoalKeto.checked=true;h.elements.aiGoalOther.checked=true;h.elements.aiOtherGoalText.value='No shellfish';h.elements.aiMealPlanCalorieAdjustmentType.value='deficit';h.elements.aiMealPlanCalorieAdjustmentAmount.value='450';h.elements.aiMealPlanNotes.value='Higher protein breakfast.';h.elements.aiGenerateMealPlanBtn.dispatchEvent({type:'click'});await h.flush();
 assert.strictEqual(h.writes.length,3);assert.ok(h.writes[2].includes('nutrition-tracker-ai-meal-plan'));assert.ok(h.writes[2].includes('Date range: 2026-08-20 through 2026-08-22.'));assert.ok(h.writes[2].includes('Weight loss (moderate), Keto, Other: No shellfish'));assert.ok(h.writes[2].includes("450-calorie daily deficit"));assert.ok(!h.writes[2].includes('"operation":"addFood"')&&!h.writes[2].includes('"operation":"addRecipeWithFoods"'));assert.ok(h.elements.aiMealPlanStatus.textContent.includes('Instructions copied.'));assert.strictEqual(h.elements.aiMealPlanPackage.value,'');

 h.elements.aiFoodDescription.value='';h.setActive('aiAddFoodScreen');h.elements.aiCopyFoodBtn.dispatchEvent({type:'click'});await h.flush();
 assert.strictEqual(h.writes.length,3);assert.strictEqual(h.elements.aiImportStatus.textContent,'Describe the item first.');assert.ok(h.elements.aiImportStatus.classList.contains('error'));
 h.elements.aiMealPlanStart.value='';h.setActive('aiMealPlanScreen');h.elements.aiGenerateMealPlanBtn.dispatchEvent({type:'click'});await h.flush();
 assert.strictEqual(h.writes.length,3);assert.strictEqual(h.elements.aiMealPlanStatus.textContent,'Choose a valid start date.');

 h=harness({clipboardMode:'reject',secure:true,execMode:true});h.setActive('aiAddFoodScreen');h.elements.aiFoodDescription.value='Fallback food.';h.elements.aiCopyFoodBtn.dispatchEvent({type:'click'});await h.flush();
 assert.strictEqual(h.writes.length,0);assert.strictEqual(h.elements.aiImportStatus.textContent,'Instructions copied.');assert.strictEqual(h.body.children.length,0,'temporary clipboard textarea should be removed after fallback');

 h=harness({clipboardMode:'missing',secure:false,execMode:false});h.setActive('aiAddRecipeScreen');h.elements.aiRecipeDescription.value='Clipboard failure recipe.';h.elements.aiCopyRecipeBtn.dispatchEvent({type:'click'});await h.flush();
 assert.strictEqual(h.elements.aiImportStatus.textContent,'Clipboard permission was denied or is unavailable. Copy the instructions manually.');assert.ok(h.elements.aiImportStatus.classList.contains('error'));assert.strictEqual(h.body.children.length,0);

 h=harness();h.ctx.NutritionTrackerAI.bind();h.ctx.NutritionTrackerAI.bind();assert.strictEqual(h.elements.aiCopyFoodBtn.listenerCount('click'),1);assert.strictEqual(h.elements.aiGenerateMealPlanBtn.listenerCount('click'),1);
 h.setActive('aiAddFoodScreen');h.elements.aiFoodDescription.value='First visit food.';h.elements.aiCopyFoodBtn.dispatchEvent({type:'click'});await h.flush();h.setActive('aiMealPlanScreen');h.setActive('aiAddFoodScreen');h.elements.aiFoodDescription.value='Returned visit food.';h.elements.aiCopyFoodBtn.dispatchEvent({type:'click'});await h.flush();
 assert.strictEqual(h.writes.length,2);assert.ok(h.writes[0].includes('First visit food.'));assert.ok(h.writes[1].includes('Returned visit food.'));
 h.elements.aiOpenFoodBtn.dispatchEvent({type:'click'});await h.flush();assert.strictEqual(h.openCalls.length,1);assert.strictEqual(h.openCalls[0].url,'https://chatgpt.com/');
}

// Prompt and source safety requirements.
const prompt=core.schemaPrompt('addRecipeWithFoods','Branded sweetener and salt',4);for(const text of ['addRecipeWithFoods','proposedFoods','temporaryKey','complete proposedFoods record','Salt must include sodium','Preserve supplied brand names','calories, protein, carbs, fat, fiber, and sodium','"instructions":["First cooking step.","Second cooking step.","Continue until the recipe is complete."]','recipe.instructions is required and must be a nonempty ordered array','Include complete, step-by-step cooking directions for every recipe in recipe.instructions exactly as shown in the import schema','Preserve the original step order','Keep ingredient data in recipe.ingredients and cooking directions in recipe.instructions','Never put directions only in explanatory chat text outside the importable JSON payload','Return raw valid JSON only, without Markdown code fences','Do not place preparation steps, cooking directions, method text, or directions prefixed with "Cooking instructions:" in recipe.notes','<h3>Cooking Instructions</h3>','<h3>Notes</h3>','<h3>Nutrition</h3>'])assert.ok(prompt.includes(text)||ai.includes(text),`prompt/source missing ${text}`);
assert.ok(ai.includes("source:'chatgpt-assisted'")&&ai.includes('if(!save())'));assert.ok(!ai.includes('eval(')&&!ai.includes('Function(')&&!ai.includes('api.openai.com'));assert.ok(html.includes('AI Assistance uses your own ChatGPT account'));assert.ok(ai.includes('https://chatgpt.com/'));

runCopyButtonRegressionTests().then(()=>console.log('AI Assistance tests: PASS (legacy compatibility; all-existing/all-new/mixed recipe foods; strict references and nutrition; ambiguity/cross-account rejection; non-mutating review; copy buttons; atomic approval/rollback; generated links/calculation; safe surgical undo; unrelated-data preservation; privacy)')).catch(error=>{console.error(error);process.exit(1);});
