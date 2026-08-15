#!/usr/bin/env node
'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const duplicateHtml=fs.readFileSync(path.join(root,'nutrition-tracker.html'),'utf8');
const coreKeys=['calories','protein','carbs','fat','fiber','sugar'];
const trackedKeys=['calories','protein','collagenProtein','carbs','fat','fiber','sugar','glycemicLoad','sodium','potassium','calcium','iron','magnesium','phosphorus','zinc','copper','manganese','selenium','vitA','vitC','vitD','vitD3','vitDOther','vitE','vitK','vitK1','vitK2','thiamin','riboflavin','niacin','b6','folate','b12','choline'];
const referenceKeys=new Set(['calories','proteinG','carbohydrateG','fiberG','sugarsG','fatG','saturatedFatG','monounsaturatedFatG','polyunsaturatedFatG','cholesterolMg','sodiumMg','potassiumMg','calciumMg','ironMg','magnesiumMg','phosphorusMg','zincMg','copperMg','manganeseMg','seleniumMcg','vitaminAMcgRAE','vitaminCMg','vitaminDMcg','vitaminEMg','vitaminKMcg','thiaminMg','riboflavinMg','niacinMg','pantothenicAcidMg','vitaminB6Mg','folateMcg','vitaminB12Mcg','cholineMg']);

function arrayExpressionAfter(marker){
  const markerAt=html.indexOf(marker);
  assert.ok(markerAt>=0,`Missing ${marker}`);
  let start=markerAt+marker.length;
  while(/\s/.test(html[start]))start++;
  assert.strictEqual(html[start],'[',`${marker} is not an array`);
  let depth=0,quote='',escaped=false;
  for(let i=start;i<html.length;i++){
    const char=html[i];
    if(quote){
      if(escaped)escaped=false;
      else if(char==='\\')escaped=true;
      else if(char===quote)quote='';
      continue;
    }
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==='[')depth++;
    else if(char===']'&&!--depth)return html.slice(start,i+1);
  }
  throw new Error(`Unterminated ${marker}`);
}

function embeddedArray(marker){return vm.runInNewContext(arrayExpressionAfter(marker),Object.create(null));}
function normalizedName(value){return String(value||'').trim().toLowerCase().replace(/\s+/g,' ');}
function assertNutrition(record,nutrition,label,requireCore=true){
  assert.ok(nutrition&&typeof nutrition==='object',`${label}: missing nutrition object`);
  if(requireCore)for(const key of coreKeys)assert.ok(Object.hasOwn(nutrition,key),`${label}: missing ${key}`);
  for(const [key,value] of Object.entries(nutrition)){
    if(!trackedKeys.includes(key))continue;
    assert.ok(Number.isFinite(value),`${label}: ${key} is not finite`);
    assert.ok(value>=0,`${label}: ${key} is negative (${value})`);
  }
  if(Object.hasOwn(nutrition,'vitD')&&Object.hasOwn(nutrition,'vitD3')&&Object.hasOwn(nutrition,'vitDOther'))assert.ok(Math.abs(nutrition.vitD-nutrition.vitD3-nutrition.vitDOther)<0.011,`${label}: vitamin D total conflicts with components`);
  if(Object.hasOwn(nutrition,'vitK')&&Object.hasOwn(nutrition,'vitK1')&&Object.hasOwn(nutrition,'vitK2'))assert.ok(Math.abs(nutrition.vitK-nutrition.vitK1-nutrition.vitK2)<0.011,`${label}: vitamin K total conflicts with components`);
}

assert.strictEqual(html,duplicateHtml,'HTML entry points must remain byte-identical');
const foods=embeddedArray('const DEFAULT_FOODS =');
const recipes=embeddedArray('const RECIPE_DATA =');
assert.ok(foods.every(Boolean),'Built-in foods contain an empty array slot');
assert.ok(recipes.every(Boolean),'Built-in recipes contain an empty array slot');

for(const [label,items] of [['food',foods],['recipe',recipes]]){
  const seen=new Set();
  for(const [index,item] of items.entries()){
    assert.ok(item&&typeof item==='object',`${label} ${index}: invalid record`);
    const name=normalizedName(item.name);
    assert.ok(name,`${label} ${index}: missing name`);
    assert.ok(!seen.has(name),`${label}: duplicate name ${item.name}`);
    seen.add(name);
    assert.ok(String(item.serving||'').trim(),`${label} ${item.name}: missing serving`);
    assertNutrition(item,label==='recipe'?item.nutrition:item,`${label} ${item.name}`);
  }
}

const index=JSON.parse(fs.readFileSync(path.join(root,'data/foods/food-index.json'),'utf8'));
let referenceCount=0;
for(const group of index.groups){
  const records=JSON.parse(fs.readFileSync(path.join(root,'data/foods',group.file),'utf8'));
  assert.strictEqual(records.length,group.count,`${group.group}: index count mismatch`);
  for(const record of records){
    referenceCount++;
    assert.ok(record.id===`fdc-${record.fdcId}`,`${record.name}: invalid USDA identity`);
    assert.strictEqual(record.nutritionBasis,'per 100 g',`${record.name}: invalid basis`);
    assert.ok(Object.keys(record.nutrition).length,`${record.name}: empty nutrition`);
    for(const [key,value] of Object.entries(record.nutrition)){
      assert.ok(referenceKeys.has(key),`${record.name}: unsupported nutrient ${key}`);
      assert.ok(Number.isFinite(value),`${record.name}: ${key} is not finite`);
      assert.ok(value>=0,`${record.name}: ${key} is negative (${value})`);
    }
  }
}
assert.strictEqual(referenceCount,index.total,'Reference index total mismatch');

console.log(`Nutrition data audit: PASS (${foods.length} built-in foods, ${recipes.length} recipes, ${referenceCount} USDA reference foods)`);
