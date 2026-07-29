'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const html=fs.readFileSync('index.html','utf8');
const duplicate=fs.readFileSync('nutrition-tracker.html','utf8');
const index=JSON.parse(fs.readFileSync('data/foods/food-index.json','utf8'));
const herbs=JSON.parse(fs.readFileSync('data/herbs-spices/herbs.json','utf8'));
const spices=JSON.parse(fs.readFileSync('data/herbs-spices/spices.json','utf8'));
const alpha=items=>items.map(x=>x.name).every((name,i,names)=>i===0||names[i-1].localeCompare(name)<=0);

for(const id of ['foodReferenceSearch','clearFoodReferenceSearchBtn','expandAllFoodGroupsBtn','collapseAllFoodGroupsBtn','herbSpiceScreen','herbSpiceSearch','clearHerbSpiceSearchBtn','expandAllHerbSpiceBtn','collapseAllHerbSpiceBtn','foodPickerToggle','foodPickerPanel','foodPickerSearch','clearFoodPickerSearchBtn','expandAllFoodPickerBtn','collapseAllFoodPickerBtn','foodPickerGroups'])assert.ok(html.includes(`id="${id}"`),`missing ${id}`);
assert.ok(html.includes('data-screen="herbSpiceScreen">Herbs and Spices<span>'));
assert.ok(html.includes('<h2>Herbs and Spices</h2>'));
assert.ok(!html.includes(['Herb and Spice','Encyclopedia'].join(' ')));
assert.ok(html.includes('Search by herb or spice name, alternate name, flavor, or suggested food.'));
assert.ok(html.includes('placeholder="Search herbs, spices, flavors, or foods"'));
assert.ok(html.includes('← Back to Food'));
assert.ok(html.includes("herbSpiceScreen:'foodHubScreen'"));
assert.ok(html.includes("record.taste"));assert.ok(html.includes("record.suggestedFoods"));assert.ok(html.includes("record.searchKeywords"));
for(const forbidden of [['Traditional','Uses'].join(' '),['traditional','-use'].join(''),['medicinal','ly'].join(''),['record.','traditionalUses'].join(''),['record.','usageKeywords'].join('')])assert.ok(!html.includes(forbidden),`removed Herbs and Spices UI remains: ${forbidden}`);
assert.ok(!html.includes("nutrientDetails(record.nutrition||{})"));
assert.ok(html.includes("image.addEventListener('error'"));assert.ok(html.includes("image.alt=record.imageAlt"));assert.ok(html.includes("loading='lazy'"));

assert.ok(index.total>=300);assert.ok(index.groups.length>=10);
assert.deepStrictEqual(index.groups.map(x=>x.group),[...index.groups.map(x=>x.group)].sort((a,b)=>a.localeCompare(b)));
let total=0;for(const meta of index.groups){const items=JSON.parse(fs.readFileSync(path.join('data','foods',meta.file),'utf8'));assert.strictEqual(items.length,meta.count);assert.ok(alpha(items));assert.ok(items.every(x=>x.nutritionBasis==='per 100 g'));total+=items.length;}assert.strictEqual(total,index.total);
assert.strictEqual(herbs.length,21);assert.strictEqual(spices.length,32);assert.ok(alpha(herbs));assert.ok(alpha(spices));
for(const record of [...herbs,...spices]){assert.strictEqual(typeof record.taste,'string');assert.ok(record.taste.length>10);assert.ok(Array.isArray(record.suggestedFoods)&&record.suggestedFoods.length>=5);assert.ok(Array.isArray(record.culinaryUses)&&record.culinaryUses.length);assert.ok(Array.isArray(record.searchKeywords)&&record.searchKeywords.length);assert.ok(!('nutrition' in record));assert.ok(!('nutritionBasis' in record));assert.ok(!('traditionalUses' in record));assert.ok(!('usageKeywords' in record));assert.ok(record.imageAlt);assert.ok(fs.existsSync(record.image));}
const search=(items,q)=>items.filter(item=>[item.name,item.scientificName,item.description,item.taste,...item.alternateNames,...item.suggestedFoods,...item.culinaryUses,...item.searchKeywords].join(' ').toLowerCase().includes(q.toLowerCase()));
assert.ok(search(herbs,'sweet basil').some(x=>x.name==='Basil'));assert.ok(search(spices,'GING').some(x=>x.name==='Ginger'));
for(const query of ['peppery','sweet','earthy','chicken','fish','potatoes','curry','tomato','bread','dessert'])assert.ok(search([...herbs,...spices],query).length,`culinary search: ${query}`);

assert.ok(html.includes('role="combobox"'));assert.ok(html.includes('role="listbox"'));assert.ok(html.includes("event.key==='Escape'"));assert.ok(html.includes("picker.contains(event.target)"));
assert.ok(html.includes("const groups=pickerLegacyGroups()"));assert.ok(html.includes("foodReference.index.groups"));assert.ok(html.includes("items.map(pickerReferenceChoice)"));assert.ok(html.includes("f.custom?'Custom Foods'"));
assert.ok(html.includes("selectedFoodChoice?.kind==='reference'?referenceFoodSnapshot"));assert.ok(html.includes("state.foods[selectedFoodChoice?.index"));
assert.ok(!html.includes("encyclopediaReference.sections")||!html.includes("encyclopediaReference.sections.map(pickerReferenceChoice)"),'culinary records must not feed selector');
assert.ok(html.includes("foodPickerState.expanded.clear()"));assert.ok(html.includes("open=!!query||foodPickerState.expanded.has(name)"));assert.ok(html.includes("normalizedSearch(`${x.name} ${name}`).includes(query)"));assert.ok(html.includes("foodPickerState.query=''"));assert.ok(html.includes('No foods match your search.'));
assert.ok(html.includes('.foodPickerGroupHeader{')&&html.includes('font-weight:700;font-size:1.05rem'));
const pickerCss=html.slice(html.indexOf('.foodPickerGroupHeader{'),html.indexOf('.foodPickerItems{'));assert.ok(!/#(?:ef4444|dc2626|b91c1c|7f1d1d)|\bred\b/i.test(pickerCss),'selector headers must not be red');
assert.ok(html.includes('overflow-wrap:anywhere'));assert.ok(!html.includes('innerHTML=foodPickerState.query'));
assert.ok(html.includes("candidate.entries.map(copyKnownEntryFields)"));assert.ok(html.includes("entries:(state.entries||[]).map(copyKnownEntryFields)"));
assert.strictEqual(html,duplicate,'HTML entry points must remain identical');
console.log(`Food reference tests: PASS (${index.total} foods, grouped Today selector, ${herbs.length} herbs, ${spices.length} spices)`);
