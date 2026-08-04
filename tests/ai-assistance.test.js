const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('<script>')+8;
const tracker=html.slice(start,html.indexOf('</script>',start));
const ai=fs.readFileSync('ai-assistance.js','utf8');
let uuid=0;
const context={console,crypto:{randomUUID:()=>`uuid-${++uuid}`},navigator:{clipboard:{}},document:{readyState:'loading',addEventListener(){},getElementById(){return null;}},window:null,location:{},history:{},alert(){},confirm:()=>true};
context.window=context;vm.createContext(context);vm.runInContext(tracker,context);vm.runInContext(ai,context);
const run=code=>vm.runInContext(code,context);
const clone=value=>JSON.parse(JSON.stringify(value));
const core=context.NutritionTrackerAI;
const nutrients=Object.fromEntries(clone(run('KEYS')).map(k=>[k,null]));
Object.assign(nutrients,{calories:90,protein:13,carbs:5,fat:2.5,sodium:360});
const foodPackage={packageType:'nutrition-tracker-ai-import',schemaVersion:1,operation:'addFood',createdBy:'user-chatgpt',food:{name:'Kroger Low-Fat Cottage Cheese',brand:'Kroger',category:'Dairy',servingAmount:113,servingUnit:'g',nutrients,nutritionSource:'user-provided-label',containsEstimates:false,notes:''}};
const recipePackage={packageType:'nutrition-tracker-ai-import',schemaVersion:1,operation:'addRecipe',createdBy:'user-chatgpt',recipe:{name:'Chicken Curry',servings:3,ingredients:[{name:'Chicken breast',brand:'',amount:12,unit:'oz',existingFoodId:null},{name:'Carrots',brand:'',amount:100,unit:'g',existingFoodId:null}],notes:'',containsEstimates:false}};
const rejects=(value,pattern)=>assert.throws(()=>core.validatePackage(clone(value)),pattern);

assert.strictEqual(core.validatePackage(clone(foodPackage)).operation,'addFood');
assert.strictEqual(core.validatePackage(clone(recipePackage)).operation,'addRecipe');
assert.throws(()=>core.parsePackage('{bad'),/not valid JSON/);
assert.strictEqual(core.parsePackage('```json\n{"a":1}\n```').a,1);
for(const [field,value,pattern] of [['packageType','wrong',/package type/],['schemaVersion',2,/schema version/],['operation','deleteFood',/prohibited operation/]]){const p=clone(foodPackage);p[field]=value;rejects(p,pattern);}
{const p=clone(foodPackage);delete p.food.name;rejects(p,/name is required/);}
{const p=clone(foodPackage);p.food.servingAmount=-1;rejects(p,/greater than zero/);}
{const p=clone(foodPackage);p.food.nutrients.protein='13';rejects(p,/finite number/);}
{const p=clone(foodPackage);p.userId='victim';rejects(p,/prohibited or unknown field/);}
{const p=clone(foodPackage);p.tracker_state={foods:[]};rejects(p,/prohibited or unknown field/);}
{const p=clone(foodPackage);p.operation='deleteRecipe';rejects(p,/prohibited operation/);}
{const p=clone(foodPackage);p.food.ownerId='victim';rejects(p,/prohibited or unknown field/);}
{const p=clone(recipePackage);p.recipe.ingredients[0].amount=0;rejects(p,/greater than zero/);}
{const p=clone(recipePackage);p.recipe.extra='x';rejects(p,/prohibited or unknown field/);}

run(`state=createEmptyTrackerState();state.foods.push({id:'active-food',custom:true,name:'Chicken breast',brand:'',serving:'4 oz',calories:120,protein:25});`);
recipePackage.recipe.ingredients[0].existingFoodId='active-food';
let validated=core.validatePackage(clone(recipePackage));
assert.strictEqual(validated.matches[0].length,1);
assert.strictEqual(validated.matches[0][0].id,'active-food');
const ambiguous=clone(recipePackage);ambiguous.recipe.ingredients=[{name:'Milk',brand:'',amount:1,unit:'cup',existingFoodId:null}];
run(`state.foods.push({id:'milk-a',custom:true,name:'Milk',serving:'1 cup'},{id:'milk-b',custom:true,name:'Milk',serving:'1 cup'});`);
assert.ok(core.validatePackage(ambiguous).matches[0].length>=2);
const cross=clone(recipePackage);cross.recipe.ingredients=[{name:'Food from other account',brand:'',amount:1,unit:'g',existingFoodId:'other-user-food'}];
assert.strictEqual(core.validatePackage(cross).matches[0].length,0);

run(`state.foods.push({id:'duplicate',custom:true,name:'Kroger Low-Fat Cottage Cheese',brand:'Kroger',serving:'113 g'});`);
assert.ok(core.validatePackage(clone(foodPackage)).duplicate);
run(`state.recipes.push({id:'recipe-duplicate',name:'Chicken Curry',servings:3,ingredients:[]});`);
assert.ok(core.validatePackage(clone(recipePackage)).duplicate);

const calc=core.calculateRecipeNutrition({servings:2,ingredients:[{name:'Chicken',amount:8,unit:'oz'}]},[{food:{serving:'4 oz',calories:120,protein:25}}]);
assert.strictEqual(calc.whole.calories,240);assert.strictEqual(calc.perServing.protein,25);assert.deepStrictEqual(clone(calc.missing),[]);
assert.ok(core.calculateRecipeNutrition({servings:2,ingredients:[{name:'Unknown',amount:1,unit:'cup'}]},[{food:null}]).missing.length);

const before=clone(run('getTrackerState()'));
const proposed=clone(foodPackage);
core.validatePackage(proposed);
assert.deepStrictEqual(clone(run('getTrackerState()')),before,'validation/review must not mutate any account data');
assert.ok(ai.includes("source:'chatgpt-assisted'")&&ai.includes('if(!save())'));
assert.ok(!ai.includes('eval(')&&!ai.includes('Function(')&&!ai.includes('api.openai.com'));
assert.ok(html.includes('AI Assistance uses your own ChatGPT account'));
assert.ok(ai.includes('https://chatgpt.com/'));

console.log('AI Assistance tests: PASS (strict schema, food/recipe validation, duplicates, ingredient matching/calculation, account-ID rejection, review non-mutation, privacy)');
