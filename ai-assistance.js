(()=>{
'use strict';
const PACKAGE_TYPE='nutrition-tracker-ai-import',CURRENT_SCHEMA_VERSION=2,SUPPORTED_SCHEMA_VERSIONS=new Set([1,2]);
const OPERATIONS=new Set(['addFood','addRecipe','addRecipeWithFoods']);
const ROOT_FIELDS=new Set(['packageType','schemaVersion','operation','createdBy','food','recipe','proposedFoods']);
const FOOD_FIELDS=new Set(['temporaryKey','name','brand','category','servingAmount','servingUnit','nutrients','nutritionSource','containsEstimates','notes']);
const RECIPE_FIELDS=new Set(['name','servings','ingredients','instructions','cookingInstructions','directions','steps','method','preparation','notes','containsEstimates']);
const LEGACY_INGREDIENT_FIELDS=new Set(['name','brand','amount','unit','existingFoodId']);
const LINKED_INGREDIENT_FIELDS=new Set(['name','brand','amount','unit','existingFoodId','foodTemporaryKey']);
const NUTRIENT_FIELDS=new Set(KEYS),CORE_NUTRIENTS=new Set(['calories','protein','carbs','fat','fiber','sodium']);
const UNIT_ALIASES={gram:'g',grams:'g',kilogram:'kg',kilograms:'kg',milligram:'mg',milligrams:'mg',ounce:'oz',ounces:'oz',pound:'lb',pounds:'lb',liter:'l',liters:'l',litre:'l',litres:'l',teaspoon:'tsp',teaspoons:'tsp',tablespoon:'tbsp',tablespoons:'tbsp',cups:'cup',pieces:'piece',servings:'serving'};
let pending=null,lastImport=null,previousFocus=null;
const byId=id=>document.getElementById(id);
const plain=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const normalizeText=v=>String(v||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const normalizeUnit=v=>UNIT_ALIASES[normalizeText(v)]||normalizeText(v);
const finite=(v,label,{positive=false,nullable=false}={})=>{if(nullable&&v===null)return null;if(typeof v!=='number'||!Number.isFinite(v))throw new Error(`${label} must be a finite number${nullable?' or null':''}.`);if(positive&&v<=0)throw new Error(`${label} must be greater than zero.`);if(v<0)throw new Error(`${label} must not be negative.`);return v;};
function rejectUnknown(value,allowed,label){for(const key of Object.keys(value))if(!allowed.has(key))throw new Error(`${label} contains prohibited or unknown field “${key}”.`);}
function parsePackage(text){let raw=String(text||'').trim();if(!raw)throw new Error('Paste an AI import package first.');const fenced=raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);if(fenced)raw=fenced[1].trim();else if(raw.includes('```'))throw new Error('Markdown code fences are incomplete or mixed with other content. Paste only the JSON object.');let value;try{value=JSON.parse(raw);}catch(_e){throw new Error('The import package is not valid JSON. Paste one complete JSON object without commentary.');}if(!plain(value))throw new Error('The import package root must be a JSON object.');return value;}
function validatePackage(value,expectedOperation){
 rejectUnknown(value,ROOT_FIELDS,'Import package');
 if(value.packageType!==PACKAGE_TYPE)throw new Error('Unsupported package type.');
 if(!SUPPORTED_SCHEMA_VERSIONS.has(value.schemaVersion))throw new Error(`Unsupported schema version. This Tracker supports versions 1 and ${CURRENT_SCHEMA_VERSION}.`);
 if(!OPERATIONS.has(value.operation))throw new Error('Unsupported or prohibited operation. Only addFood, addRecipe, and addRecipeWithFoods are allowed.');
 if(value.operation==='addRecipeWithFoods'&&value.schemaVersion!==2)throw new Error('addRecipeWithFoods requires schema version 2.');
 if(value.operation!=='addRecipeWithFoods'&&value.schemaVersion!==1)throw new Error(`${value.operation} requires schema version 1.`);
 if(expectedOperation&&value.operation!==expectedOperation&&!(expectedOperation==='addRecipeWithFoods'&&value.operation==='addRecipe'))throw new Error(`This panel expects operation ${expectedOperation}.`);
 if(value.createdBy!=='user-chatgpt')throw new Error('createdBy must be “user-chatgpt”.');
 if(value.operation==='addFood')return validateFood(value.food,{operation:'addFood',requireCore:false});
 if(value.operation==='addRecipe')return validateRecipe(value.recipe);
 return validateRecipeWithFoods(value.recipe,value.proposedFoods);
}
function validateFood(food,{operation='addFood',requireCore=false,requireTemporaryKey=false}={}){
 if(!plain(food))throw new Error('Missing required food object.');rejectUnknown(food,FOOD_FIELDS,'Food');
 const temporaryKey=String(food.temporaryKey||'').trim();if(requireTemporaryKey&&!/^[A-Za-z0-9._:-]+$/.test(temporaryKey))throw new Error('Proposed food temporaryKey is required and must use only letters, numbers, periods, underscores, colons, or hyphens.');
 const name=String(food.name||'').trim();if(!name)throw new Error('Food name is required.');
 const servingAmount=finite(food.servingAmount,'Serving amount',{positive:true});const servingUnit=normalizeUnit(food.servingUnit);if(!servingUnit)throw new Error('Serving unit is required.');
 if(!plain(food.nutrients))throw new Error('Food nutrients object is required.');rejectUnknown(food.nutrients,NUTRIENT_FIELDS,'Nutrients');
 const nutrients={};for(const key of KEYS){if(requireCore&&!own(food.nutrients,key))throw new Error(`${key} nutrient field is required for every proposed food; use null only when this optional value is unknown.`);if(requireCore&&CORE_NUTRIENTS.has(key)&&food.nutrients[key]===null)throw new Error(`${key} nutrient is required for every proposed food.`);const value=own(food.nutrients,key)?food.nutrients[key]:null;nutrients[key]=finite(value,`${key} nutrient`,{nullable:true});}
 const nutritionSource=String(food.nutritionSource||'').trim();if(requireCore&&!nutritionSource)throw new Error('Nutrition source is required for every proposed food.');
 if(requireCore&&typeof food.containsEstimates!=='boolean')throw new Error('containsEstimates must be true or false for every proposed food.');
 if(requireCore&&/\bsalt\b/i.test(name)&&!(nutrients.sodium>0))throw new Error('Salt must include sodium for the stated serving quantity.');
 if(requireCore&&/sweetener/i.test(name)&&nutrients.calories===0&&nutrients.sugar===null)throw new Error('Zero-calorie sweeteners must include a numeric sugar value when using the Tracker schema.');
 const normalized={temporaryKey,name,brand:String(food.brand||'').trim(),category:String(food.category||'Custom').trim()||'Custom',servingAmount,servingUnit,nutrients,nutritionSource:nutritionSource||'unspecified',containsEstimates:food.containsEstimates===true,notes:String(food.notes||'').trim()};
 const duplicate=(state.foods||[]).find(f=>normalizeText(f.name)===normalizeText(name)&&normalizeText(f.brand)===normalizeText(normalized.brand));
 return {operation,food:normalized,duplicate};
}
function normalizeIngredient(item,index,linked=false){
 if(!plain(item))throw new Error(`Ingredient ${index+1} must be an object.`);rejectUnknown(item,linked?LINKED_INGREDIENT_FIELDS:LEGACY_INGREDIENT_FIELDS,`Ingredient ${index+1}`);
 const name=String(item.name||'').trim();if(!name)throw new Error(`Ingredient ${index+1} name is required.`);
 const amount=finite(item.amount,`Ingredient ${index+1} amount`,{positive:true}),unit=normalizeUnit(item.unit);if(!unit)throw new Error(`Ingredient ${index+1} unit is required.`);
 const existingFoodId=item.existingFoodId===null||item.existingFoodId===undefined?null:String(item.existingFoodId).trim();
 const foodTemporaryKey=item.foodTemporaryKey===null||item.foodTemporaryKey===undefined?null:String(item.foodTemporaryKey).trim();
 if(linked&&Boolean(existingFoodId)===Boolean(foodTemporaryKey))throw new Error(`Ingredient ${index+1} must reference exactly one existingFoodId or foodTemporaryKey.`);
 return {name,brand:String(item.brand||'').trim(),amount,unit,existingFoodId,foodTemporaryKey};
}
function stripInstructionMarker(value){return String(value||'').replace(/^\s*(?:\d+[\.)]|[-*•])\s*/,'').trim();}
function instructionSentences(text){
 const normalized=String(text||'').replace(/\\n/g,'\n').replace(/\r/g,'').trim();
 if(!normalized)return [];
 const withInlineBreaks=normalized.replace(/\s+(?=\d+[\.)]\s+)/g,'\n').replace(/\s+(?=[-*•]\s+)/g,'\n');
 const lines=withInlineBreaks.split(/\n+/).map(stripInstructionMarker).filter(Boolean);
 if(lines.length>1)return lines;
 return (normalized.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)||[normalized]).map(stripInstructionMarker).filter(Boolean);
}
function normalizeInstructionValue(value){
 if(Array.isArray(value))return value.flatMap(instructionSentences).filter(Boolean);
 if(typeof value==='string')return instructionSentences(value);
 return [];
}
function prefixedNotesInstructions(notes){
 const text=String(notes||'').replace(/\\n/g,'\n').replace(/\r/g,''),match=text.match(/(?:^|\n)\s*(?:Cooking instructions|Directions|Instructions|Method|Preparation)\s*:\s*([\s\S]*)$/i);
 if(!match)return null;
 const before=text.slice(0,match.index).trim(),body=match[1].trim(),sentences=instructionSentences(body);
 const notePattern=/\b(warn|warning|caution|careful|burn|severe|safety|safe|do not touch|do not taste|storage|store|airtight|refrigerat|freeze|shelf|estimated|estimate|nutrition|nutrient|yield|serving size|final weight|will vary|vary with|approx(?:imate)?|about)\b/i;
 const instructionOnly=sentences.filter(x=>!/\b(warn|warning|caution|burn|severe|safety|do not touch|do not taste|estimated|estimate|nutrition|nutrient|yield|serving size|final weight|will vary|vary with)\b/i.test(x));
 const notesOnly=sentences.filter(x=>notePattern.test(x));
 return {instructions:instructionOnly.length?instructionOnly:sentences,notes:[before,notesOnly.join(' ')].filter(Boolean).join('\n').trim()};
}
function normalizeRecipeInstructionsAndNotes(recipe){
 const current=normalizeInstructionValue(recipe.instructions);
 if(current.length)return {instructions:current,notes:String(recipe.notes||'')};
 for(const key of ['cookingInstructions','directions','steps','method','preparation']){
  const instructions=normalizeInstructionValue(recipe[key]);
  if(instructions.length)return {instructions,notes:String(recipe.notes||'')};
 }
 const fromNotes=prefixedNotesInstructions(recipe.notes);
 if(fromNotes&&fromNotes.instructions.length)return fromNotes;
 return {instructions:[],notes:String(recipe.notes||'')};
}
function recipeBase(recipe,linked=false){
 if(!plain(recipe))throw new Error('Missing required recipe object.');rejectUnknown(recipe,RECIPE_FIELDS,'Recipe');
 const name=String(recipe.name||'').trim();if(!name)throw new Error('Recipe name is required.');const servings=finite(recipe.servings,'Recipe servings',{positive:true});
 if(!Array.isArray(recipe.ingredients)||!recipe.ingredients.length)throw new Error('Recipe ingredients must be a nonempty array.');
 const instructionData=normalizeRecipeInstructionsAndNotes(recipe);
 return {name,servings,ingredients:recipe.ingredients.map((x,i)=>normalizeIngredient(x,i,linked)),instructions:instructionData.instructions,notes:instructionData.notes,containsEstimates:recipe.containsEstimates===true};
}
function validateRecipe(recipe){const normalized=recipeBase(recipe);const duplicate=trackerRecipes().find(r=>normalizeText(r.name)===normalizeText(normalized.name));return {operation:'addRecipe',recipe:normalized,duplicate,matches:normalized.ingredients.map(findMatches)};}
function validateRecipeWithFoods(recipe,proposedFoods){
 const normalized=recipeBase(recipe,true);if(!Array.isArray(proposedFoods))throw new Error('proposedFoods must be an array.');
 const proposals=proposedFoods.map((food,index)=>{try{return validateFood(food,{operation:'addRecipeWithFoods',requireCore:true,requireTemporaryKey:true}).food;}catch(error){throw new Error(`Proposed food ${index+1}: ${error.message}`);}});
 const byKey=new Map();for(const food of proposals){if(byKey.has(food.temporaryKey))throw new Error(`Duplicate temporaryKey “${food.temporaryKey}”.`);byKey.set(food.temporaryKey,food);}
 for(const [index,item] of normalized.ingredients.entries()){
  if(item.existingFoodId&&!validOwnedFoodId(item.existingFoodId))throw new Error(`Ingredient ${index+1} existingFoodId does not belong to the active account.`);
  if(item.foodTemporaryKey&&!byKey.has(item.foodTemporaryKey))throw new Error(`Ingredient ${index+1} references unknown temporaryKey “${item.foodTemporaryKey}”.`);
 }
 const usedKeys=new Set(normalized.ingredients.map(x=>x.foodTemporaryKey).filter(Boolean));for(const key of usedKeys)if(!byKey.has(key))throw new Error(`Missing proposed food for temporaryKey “${key}”.`);
 const duplicate=trackerRecipes().find(r=>normalizeText(r.name)===normalizeText(normalized.name));
 const matches=normalized.ingredients.map(item=>item.existingFoodId?[validOwnedFoodId(item.existingFoodId)]:findMatches(item));
 const plans=normalized.ingredients.map((item,index)=>({ingredient:item,matches:matches[index],proposedFood:item.foodTemporaryKey?byKey.get(item.foodTemporaryKey):null}));
 for(const [index,plan] of plans.entries())if(plan.matches.length===0&&!plan.proposedFood)throw new Error(`Missing proposed food for unmatched ingredient ${index+1} (${plan.ingredient.name}).`);
 return {operation:'addRecipeWithFoods',schemaVersion:2,recipe:normalized,proposedFoods:proposals,proposalByKey:byKey,duplicate,matches,plans};
}
function validOwnedFoodId(id){return id?(state.foods||[]).find(f=>f&&f.id===id&&f.custom===true)||null:null;}
function findMatches(ingredient){
 if(ingredient.existingFoodId){const exact=validOwnedFoodId(ingredient.existingFoodId);return exact?[exact]:[];}
 const target=normalizeText(ingredient.name),brand=normalizeText(ingredient.brand),unit=normalizeUnit(ingredient.unit);
 return (state.foods||[]).filter(f=>f&&f.custom===true&&f.id&&(()=>{const name=normalizeText(f.name);if(name!==target&&!(name.includes(target)||target.includes(name)))return false;const foodBrand=normalizeText(f.brand);if(brand&&foodBrand!==brand)return false;const parsed=parseServing(f.serving);return !parsed||parsed.unit===unit||compatibleUnits(parsed.unit,unit);})()).slice(0,8);
}
function compatibleUnits(a,b){const group=u=>['g','kg','mg','oz','lb'].includes(u)?'mass':['ml','l','tsp','tbsp','cup'].includes(u)?'volume':u;return group(a)===group(b);}
function parseServing(value){const m=String(value||'').trim().match(/^([0-9]*\.?[0-9]+)\s*([a-zA-Z]+)\b/);return m?{amount:Number(m[1]),unit:normalizeUnit(m[2])}:null;}
function unitBase(amount,unit){const factors={mg:.001,g:1,kg:1000,oz:28.349523125,lb:453.59237,ml:1,l:1000,tsp:4.92892159375,tbsp:14.78676478125,cup:236.5882365};return factors[unit]?amount*factors[unit]:amount;}
function ingredientServings(ingredient,food){const serving=parseServing(food.serving);if(!serving||!compatibleUnits(serving.unit,ingredient.unit))return null;return unitBase(ingredient.amount,ingredient.unit)/unitBase(serving.amount,serving.unit);}
function calculateRecipeNutrition(recipe,resolutions){const whole=Object.fromEntries(KEYS.map(k=>[k,0])),missing=[];recipe.ingredients.forEach((ingredient,i)=>{const food=resolutions[i]?.food;if(!food){missing.push(ingredient.name);return;}const count=ingredientServings(ingredient,food);if(!Number.isFinite(count)){missing.push(`${ingredient.name} (unit conversion unresolved)`);return;}KEYS.forEach(k=>whole[k]+=n(food[k])*count);});const perServing=Object.fromEntries(KEYS.map(k=>[k,whole[k]/recipe.servings]));return {whole,perServing,missing};}
function proposedFoodRecord(food,id,now){return normalizeNutritionFields({id,custom:true,private:true,name:food.name,brand:food.brand,category:food.category,serving:`${food.servingAmount} ${food.servingUnit}`,...Object.fromEntries(KEYS.map(k=>[k,food.nutrients[k]??0])),source:'chatgpt-assisted',importSchemaVersion:CURRENT_SCHEMA_VERSION,dateCreated:now,containsEstimates:food.containsEstimates,nutritionSource:food.nutritionSource,notes:food.notes});}
function defaultResolutions(validated){return validated.recipe.ingredients.map((item,i)=>{const matches=validated.matches[i]||[];if(item.existingFoodId)return {kind:'existing',food:matches[0]||null};if(matches.length===1)return {kind:'existing',food:matches[0]};if(matches.length>1)return {kind:'ambiguous',food:null};return {kind:'proposed',food:validated.plans[i].proposedFood};});}
function existingFoodServingParts(food){
 const raw=String(food&&food.serving||'').trim();
 const m=raw.match(/^([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+)\s*(.*)$/);
 if(!m)return {servingAmount:1,servingUnit:raw};
 const amount=m[1].includes('/')?m[1].split('/').map(Number).reduce((a,b)=>a/b):Number(m[1]);
 return {servingAmount:Number.isFinite(amount)&&amount>0?amount:1,servingUnit:m[2].trim()};
}
function existingFoodNutrients(food){
 const nutrients={};
 for(const key of KEYS)if(own(food,key)){
  const value=food[key];
  if(value===null)nutrients[key]=null;
  else if(typeof value==='number'&&Number.isFinite(value))nutrients[key]=value;
  else if(value!==''&&Number.isFinite(Number(value)))nutrients[key]=Number(value);
 }
 return nutrients;
}
function existingFoodsForPrompt(){
 return (state.foods||[]).filter(f=>f&&f.custom===true&&typeof f.id==='string'&&f.id.trim()).map(f=>{const serving=existingFoodServingParts(f);return {id:f.id,name:String(f.name||''),brand:String(f.brand||''),category:String(f.category||''),servingAmount:serving.servingAmount,servingUnit:serving.servingUnit,nutrients:existingFoodNutrients(f)};});
}
function schemaPrompt(operation,description,servings){
 const nutrientShape=KEYS.map(k=>`"${k}": ${CORE_NUTRIENTS.has(k)?0:'null'}`).join(', ');
 const foodShape=`{"name":"","brand":"","category":"Custom","servingAmount":1,"servingUnit":"g","nutrients":{${nutrientShape}},"nutritionSource":"","containsEstimates":true,"notes":""}`;
 const instructionShape=`"instructions":["First cooking step.","Second cooking step.","Continue until the recipe is complete."]`;
 const recipeShape=`{"name":"Recipe name","servings":${servings||1},"ingredients":[{"name":"","brand":"","amount":1,"unit":"g","existingFoodId":null}],${instructionShape},"notes":"","containsEstimates":true}`;
 const schema=operation==='addFood'?`{"packageType":"${PACKAGE_TYPE}","schemaVersion":1,"operation":"addFood","createdBy":"user-chatgpt","food":${foodShape}}`:operation==='addRecipe'?`{"packageType":"${PACKAGE_TYPE}","schemaVersion":1,"operation":"addRecipe","createdBy":"user-chatgpt","recipe":${recipeShape}}`:`{"packageType":"${PACKAGE_TYPE}","schemaVersion":2,"operation":"addRecipeWithFoods","createdBy":"user-chatgpt","recipe":{"name":"Recipe name","servings":${servings||1},"ingredients":[{"name":"","brand":"","amount":1,"unit":"g","existingFoodId":null,"foodTemporaryKey":"food-1"}],${instructionShape},"notes":"","containsEstimates":true},"proposedFoods":[{"temporaryKey":"food-1",${foodShape.slice(1)}}]}`;
 const special=operation==='addFood'?'':` Every recipe must include recipe.name, recipe.servings, recipe.ingredients, recipe.instructions, recipe.notes, and recipe.containsEstimates. recipe.instructions is required and must be a nonempty ordered array of strings, one complete preparation or cooking step per array item. Include complete, step-by-step cooking directions for every recipe in recipe.instructions exactly as shown in the import schema. Preserve the original step order. Keep ingredient data in recipe.ingredients and cooking directions in recipe.instructions; never mix directions into ingredient records or proposedFoods. Do not place preparation steps, cooking directions, method text, or directions prefixed with "Cooking instructions:" in recipe.notes. Use recipe.notes only for safety warnings, storage guidance, yield disclosures, and nutrition-estimate disclosures. Never put directions only in explanatory chat text outside the importable JSON payload. Return raw valid JSON only, without Markdown code fences. For every ingredient that may not clearly match an existing private Food List item, include one complete proposedFoods record and reference its stable temporaryKey from foodTemporaryKey. Provide full nutrition data, not merely ingredient names. Do not omit salt, spices, or condiments because quantities are small. Salt must include sodium for the stated amount. Zero-calorie sweeteners must include applicable carbohydrates, sugar, or other supported nutrient values. Preserve supplied brand names and never silently replace a branded ingredient with a generic food.`;
 const existingFoods=existingFoodsForPrompt();
 const matchingRules='The existingFoods array contains foods already stored in the user’s private Food List.\n\nBefore creating any proposedFoods record, search existingFoods for a matching food using normalized name, brand, serving unit, and relevant nutrition information.\n\nWhen a reliable match exists:\n- use the exact supplied id as existingFoodId\n- set foodTemporaryKey to null or omit it if permitted by the active import schema\n- do not create a proposedFoods record for that ingredient\n\nCreate a proposedFoods record only when no reliable existing-food match is present.\n\nNever invent, alter, shorten, or reconstruct an existingFoodId.\n\nPreserve supplied brand names. Do not match a branded ingredient to a generic food unless the user explicitly permits substitution.\n\nAn empty proposedFoods array is valid when all ingredients already exist.';
 return `Create one proposed Nutrition Tracker ${operation==='addFood'?'addFood':operation} import operation from the user description below. Return only one valid JSON object, without markdown or commentary. Do not rewrite account data or alter existing records.${special} Use these exact nutrient fields and units: ${NUTRIENTS.map(x=>`${x.key} (${x.unit})`).join(', ')}. calories, protein, carbs, fat, fiber, and sodium are required numeric core values for every proposed food. Other fields may be null when genuinely unknown. nutritionSource is required. Set containsEstimates true and clearly explain estimates in notes whenever any value is estimated. Never include owner IDs, user IDs, account IDs, login data, authorization tokens, permanent record IDs for proposed foods, storage keys, complete tracker state, saved days, menus, exercise records, settings, or deletion instructions.\n\nImport-operation instructions and allowlisted schema:\n${schema}\n\nUser food or recipe description:\n${String(description||'').trim()}\n\nexistingFoods JSON array (complete private Food List records supplied for matching; not truncated):\n${JSON.stringify(existingFoods,null,2)}\n\nExisting-food matching rules:\n${matchingRules}`;
}
async function copyPrompt(operation,openAfter=false){const isFood=operation==='addFood',description=byId(isFood?'aiFoodDescription':'aiRecipeDescription').value;if(!description.trim())return status('Describe the item first.',true);const prompt=schemaPrompt(operation,description,byId('aiRecipeServings').value);try{await navigator.clipboard.writeText(prompt);status('ChatGPT instructions copied to the clipboard.');if(openAfter)window.open('https://chatgpt.com/','_blank','noopener,noreferrer');}catch(_e){status('Clipboard permission was denied or is unavailable. Copy the instructions manually.',true);if(openAfter)window.open('https://chatgpt.com/','_blank','noopener,noreferrer');}}
async function pasteClipboard(target){try{const text=await navigator.clipboard.readText();if(!text)return status('The clipboard is empty. Paste the JSON manually into the box.',true);byId(target).value=text;status('Clipboard content pasted. Select Review Import when ready.');}catch(_e){status('Clipboard permission was denied or is unavailable. Paste the JSON manually into the box.',true);}}
function status(message,error=false){const el=byId('aiImportStatus');if(el){el.textContent=message;el.classList.toggle('error',error);}return false;}
function review(operation){try{const text=byId(operation==='addFood'?'aiFoodPackage':'aiRecipePackage').value;pending=validatePackage(parsePackage(text),operation);renderReview();return true;}catch(error){pending=null;byId('aiReviewPanel').classList.add('hide');return status(error.message,true);}}
function foodNutritionTable(f){return `<p>Serving: ${f.servingAmount} ${esc(f.servingUnit)} · Source: ${esc(f.nutritionSource)} · Estimates: ${f.containsEstimates?'Yes':'No'}</p>${f.containsEstimates?'<p class="aiWarning">Contains estimated nutrition values. Verify before saving.</p>':''}<table><tbody>${NUTRIENTS.map(x=>`<tr><td>${esc(x.label)}</td><td>${f.nutrients[x.key]===null?'Unknown':`${round(f.nutrients[x.key])} ${esc(x.unit)}`}</td></tr>`).join('')}</tbody></table>`;}
function renderReview(){
 const box=byId('aiReviewContent');byId('aiImportComplete').classList.add('hide');let html='';
 if(pending.operation==='addFood'){const f=pending.food;html=`<p><b>${esc(f.name)}</b>${f.brand?` — ${esc(f.brand)}`:''}</p>${foodNutritionTable(f)}${pending.duplicate?'<p class="aiWarning">Duplicate warning: a food with this name and brand already exists. Saving is blocked.</p>':''}`;}
 else if(pending.operation==='addRecipeWithFoods'){
  const r=pending.recipe;html=`<p><b>${esc(r.name)}</b> · ${r.servings} servings</p>${pending.duplicate?'<p class="aiWarning">A recipe with this name already exists. Saving is blocked.</p>':''}<h3>Ingredients</h3>`;
  html+=r.ingredients.map((item,i)=>{const plan=pending.plans[i],matches=plan.matches,options=matches.map((f,j)=>`<option value="match:${j}">Reuse ${esc(f.name)}${f.brand?` — ${esc(f.brand)}`:''}</option>`).join('');const proposed=plan.proposedFood?`<option value="proposed">Create ${esc(plan.proposedFood.name)}${plan.proposedFood.brand?` — ${esc(plan.proposedFood.brand)}`:''}</option>`:'';return `<div class="aiIngredient"><b>${esc(item.amount)} ${esc(item.unit)} ${esc(item.name)}</b><label for="aiMatch${i}">Ingredient resolution</label><select id="aiMatch${i}" data-ai-match="${i}">${matches.length>1?'<option value="ambiguous">Choose a clear match</option>':''}${options}${proposed}</select>${matches.length>1?'<p class="aiWarning">Ambiguous match—choose the intended existing food or the proposed new food.</p>':''}</div>`;}).join('');
  const proposedUsed=[...new Map(pending.plans.filter(x=>x.proposedFood).map(x=>[x.proposedFood.temporaryKey,x.proposedFood])).values()];
  html+=`<h3>New foods available to create</h3>${proposedUsed.length?proposedUsed.map(f=>`<section class="aiIngredient"><b>${esc(f.name)}${f.brand?` — ${esc(f.brand)}`:''}</b>${foodNutritionTable(f)}</section>`).join(''):'<p>None. All ingredients reuse existing foods.</p>'}<h3>Cooking Instructions</h3><ol>${r.instructions.map(x=>`<li>${esc(x)}</li>`).join('')}</ol><h3>Notes</h3>${r.notes?`<p>${esc(r.notes)}</p>`:'<p class="small">No notes.</p>'}<div id="aiRecipeNutrition"></div>`;
 }else{const r=pending.recipe;html=`<p><b>${esc(r.name)}</b> · ${r.servings} servings</p><h3>Ingredients</h3>`+r.ingredients.map((item,i)=>{const matches=pending.matches[i],options=matches.map((f,j)=>`<option value="match:${j}">${esc(f.name)} (${esc(f.serving||'serving unknown')})</option>`).join('');return `<div class="aiIngredient"><b>${esc(item.amount)} ${esc(item.unit)} ${esc(item.name)}</b><select id="aiMatch${i}" data-ai-match="${i}"><option value="unresolved">Unresolved</option>${options}</select></div>`;}).join('')+`<h3>Cooking Instructions</h3><ol>${r.instructions.map(x=>`<li>${esc(x)}</li>`).join('')}</ol><h3>Notes</h3>${r.notes?`<p>${esc(r.notes)}</p>`:'<p class="small">No notes.</p>'}<div id="aiRecipeNutrition"></div>`;}
 box.innerHTML=html;box.querySelectorAll('[data-ai-match]').forEach(s=>{const i=Number(s.dataset.aiMatch),matches=pending.matches[i];if(matches.length===1)s.value='match:0';else if(!matches.length&&pending.operation==='addRecipeWithFoods')s.value='proposed';s.addEventListener('change',renderRecipeNutrition);});renderRecipeNutrition();previousFocus=document.activeElement;const panel=byId('aiReviewPanel');panel.classList.remove('hide');status('Validated. Review every value; nothing has been saved.');panel.focus();
}
function resolutions(){return pending.recipe.ingredients.map((_x,i)=>{const value=byId(`aiMatch${i}`)?.value||(pending.operation==='addRecipeWithFoods'?'ambiguous':'unresolved');if(value.startsWith('match:'))return {kind:'existing',food:pending.matches[i][Number(value.split(':')[1])]};if(value==='proposed'){const f=pending.plans[i].proposedFood;return {kind:'proposed',food:f};}return {kind:value,food:null};});}
function previewResolutions(){return resolutions().map(x=>x.kind==='proposed'?{...x,food:proposedFoodRecord(x.food,`preview:${x.food.temporaryKey}`,'')}:x);}
function renderRecipeNutrition(){if(!pending||pending.operation==='addFood')return;const res=pending.operation==='addRecipeWithFoods'?previewResolutions():resolutions(),calc=calculateRecipeNutrition(pending.recipe,res),el=byId('aiRecipeNutrition');if(!el)return;const reused=res.filter(x=>x.kind==='existing').map(x=>x.food.name),created=res.filter(x=>x.kind==='proposed').map(x=>x.food.name);el.innerHTML=`<h3>Nutrition</h3><p><b>Ingredient resolution:</b><br>Reused: ${reused.length?reused.map(esc).join(', '):'None'}<br>Created: ${created.length?created.map(esc).join(', '):'None'}</p>${calc.missing.length?`<p class="aiWarning">Resolve before approval: ${calc.missing.map(esc).join(', ')}.</p>`:''}<div class="row"><div><b>Whole recipe</b>${nutritionSummary(calc.whole)}</div><div><b>Per serving</b>${nutritionSummary(calc.perServing)}</div></div>`;}
function nutritionSummary(values){return `<p>Calories ${round(values.calories)} kcal · Protein ${round(values.protein)} g · Carbs ${round(values.carbs)} g · Fat ${round(values.fat)} g · Fiber ${round(values.fiber)} g · Sodium ${round(values.sodium)} mg</p>`;}
function newId(){return crypto.randomUUID();}
function approveImport(validated,chosen){
 if(!validated)throw new Error('Review a valid package first.');if(validated.duplicate)throw new Error(`A ${validated.operation==='addFood'?'food':'recipe'} with this name already exists.`);
 const before=cloneStateValue(getTrackerState()),now=new Date().toISOString(),createdFoods=[];let record;
 try{
  if(validated.operation==='addFood'){record=proposedFoodRecord(validated.food,newId(),now);state.foods.push(record);}
  else{
   const r=validated.recipe,res=chosen||defaultResolutions(validated);if(res.some(x=>!x||x.kind==='ambiguous'||!x.food))throw new Error('Resolve every ambiguous or unmatched ingredient before approval.');
   const createdByKey=new Map();for(let i=0;i<res.length;i++)if(res[i].kind==='proposed'){const proposal=res[i].food,key=proposal.temporaryKey;if(!createdByKey.has(key)){const food=proposedFoodRecord(proposal,newId(),now);createdByKey.set(key,food);createdFoods.push(food);state.foods.push(food);}res[i]={kind:'existing',food:createdByKey.get(key)};}
   const calc=calculateRecipeNutrition(r,res);if(calc.missing.length)throw new Error(`Recipe calculation failed for: ${calc.missing.join(', ')}.`);
   record={id:newId(),name:r.name,category:'Custom',servings:r.servings,yield:`${r.servings} servings`,serving:`1 serving (1/${r.servings} recipe)`,ingredients:r.ingredients.map((x,i)=>({name:x.name,brand:x.brand,amount:x.amount,unit:x.unit,foodId:res[i].food.id,resolution:createdFoods.includes(res[i].food)?'created':'existing'})),instructions:r.instructions,notes:r.notes,nutrition:calc.perServing,source:'chatgpt-assisted',importSchemaVersion:validated.operation==='addRecipeWithFoods'?2:1,dateCreated:now,containsEstimates:r.containsEstimates||res.some(x=>x.food.containsEstimates===true)};state.recipes.push(record);
  }
  if(!save())throw new Error('Save failed. No imported record was retained.');
 }catch(error){applyTrackerState(before);throw error;}
 lastImport={record,operation:validated.operation,createdFoodIds:createdFoods.map(x=>x.id)};return lastImport;
}
function approve(){try{const result=approveImport(pending,pending&&pending.operation==='addFood'?undefined:resolutions());pending=null;renderFoodSelect();renderFoodsList();renderRecipes();renderRecipePrintChoices();byId('aiReviewPanel').classList.add('hide');showComplete();return result;}catch(error){return status(error.message,true);}}
function showComplete(){const food=lastImport.operation==='addFood';byId('aiCompleteMessage').textContent=`Added ${lastImport.record.name} to your private ${food?'food database':'recipes'}.`;byId('aiAddTodayBtn').textContent=food?'Add to Today’s Menu':'Add One Serving to Today’s Menu';byId('aiReturnBtn').textContent=food?'Return to My Foods':'Return to My Recipes';byId('aiImportComplete').classList.remove('hide');status('Import saved.');byId('aiAddTodayBtn').focus();}
function addImportedToday(){if(!lastImport)return;let food=lastImport.record;if(lastImport.operation!=='addFood')food={name:lastImport.record.name,serving:lastImport.record.serving,...lastImport.record.nutrition};state.entries.push({id:newId(),date:selectedDate(),order:nextFoodOrder(selectedDate()),time:hhmm(),servings:1,food:normalizeNutritionFields(cloneStateValue(food)),eaten:false,group:''});if(save()){render();showScreen('mainScreen');}else status('The item could not be added to Today’s Menu.',true);}
function foodUsedElsewhere(id,excludedRecipeId){return (state.recipes||[]).some(r=>r.id!==excludedRecipeId&&(r.ingredients||[]).some(x=>x.foodId===id))||(state.entries||[]).some(e=>e.food&&e.food.id===id);}
function undoImport(importInfo=lastImport){
 if(!importInfo)return false;const before=cloneStateValue(getTrackerState());
 try{state.recipes=(state.recipes||[]).filter(r=>r.id!==importInfo.record.id);const removable=new Set((importInfo.createdFoodIds||[]).filter(id=>!foodUsedElsewhere(id,importInfo.record.id)));state.foods=(state.foods||[]).filter(f=>!removable.has(f.id));if(importInfo.operation==='addFood'&&!foodUsedElsewhere(importInfo.record.id,null))state.foods=state.foods.filter(f=>f.id!==importInfo.record.id);if(!save())throw new Error('Undo save failed.');if(importInfo===lastImport)lastImport=null;return {removedFoodIds:[...removable]};}catch(error){applyTrackerState(before);throw error;}
}
function undo(){try{undoImport();byId('aiImportComplete').classList.add('hide');renderFoodSelect();renderFoodsList();renderRecipes();status('The AI-assisted import was undone.');}catch(error){status('Undo failed. Your saved data was not changed.',true);}}
function cancel(){pending=null;byId('aiReviewPanel').classList.add('hide');status('Import canceled. Nothing was saved.');if(previousFocus&&previousFocus.focus)previousFocus.focus();}
function bind(){const on=(id,event,fn)=>{const el=byId(id);if(el)el.addEventListener(event,fn);};on('aiCopyFoodBtn','click',()=>copyPrompt('addFood'));on('aiOpenFoodBtn','click',()=>copyPrompt('addFood',true));on('aiCopyRecipeBtn','click',()=>copyPrompt('addRecipeWithFoods'));on('aiOpenRecipeBtn','click',()=>copyPrompt('addRecipeWithFoods',true));on('aiPasteFoodBtn','click',()=>pasteClipboard('aiFoodPackage'));on('aiPasteRecipeBtn','click',()=>pasteClipboard('aiRecipePackage'));on('aiReviewFoodBtn','click',()=>review('addFood'));on('aiReviewRecipeBtn','click',()=>review('addRecipeWithFoods'));on('aiApproveBtn','click',approve);on('aiEditBtn','click',cancel);on('aiCancelBtn','click',cancel);on('aiUndoBtn','click',undo);on('aiAddTodayBtn','click',addImportedToday);on('aiReturnBtn','click',()=>showScreen(lastImport?.operation==='addFood'?'foodsScreen':'recipesScreen'));}
window.NutritionTrackerAI={parsePackage,validatePackage,validateFood,validateRecipe,validateRecipeWithFoods,normalizeRecipeInstructionsAndNotes,findMatches,calculateRecipeNutrition,defaultResolutions,approveImport,undoImport,foodUsedElsewhere,existingFoodsForPrompt,schemaPrompt};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
