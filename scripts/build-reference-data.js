#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const sourcePath=process.argv[2];
if(!sourcePath)throw new Error('Usage: node scripts/build-reference-data.js <USDA Foundation Foods JSON>');
const root=path.resolve(__dirname,'..');
const foodsDir=path.join(root,'data','foods');
const hsDir=path.join(root,'data','herbs-spices');
const assetsDir=path.join(root,'assets','herbs-spices');
for(const dir of [foodsDir,hsDir,assetsDir])fs.mkdirSync(dir,{recursive:true});

const raw=JSON.parse(fs.readFileSync(sourcePath,'utf8')).FoundationFoods||[];
const nutrientMap={
  1008:'calories',1003:'proteinG',1005:'carbohydrateG',1079:'fiberG',2000:'sugarsG',1004:'fatG',1258:'saturatedFatG',1292:'monounsaturatedFatG',1293:'polyunsaturatedFatG',1253:'cholesterolMg',1093:'sodiumMg',1092:'potassiumMg',1087:'calciumMg',1089:'ironMg',1090:'magnesiumMg',1091:'phosphorusMg',1095:'zincMg',1098:'copperMg',1101:'manganeseMg',1103:'seleniumMcg',1106:'vitaminAMcgRAE',1162:'vitaminCMg',1114:'vitaminDMcg',1109:'vitaminEMg',1185:'vitaminKMcg',1165:'thiaminMg',1166:'riboflavinMg',1167:'niacinMg',1170:'pantothenicAcidMg',1175:'vitaminB6Mg',1177:'folateMcg',1178:'vitaminB12Mcg',1180:'cholineMg'
};
const groups=[
  ['Fruits',/fruit|apple|apricot|avocado|banana|berry|berries|cherry|date|fig|grape|guava|kiwi|lemon|lime|mango|melon|orange|papaya|peach|pear|pineapple|plum|pomegranate|raisin/i],
  ['Vegetables',/vegetable|artichoke|asparagus|beet|broccoli|cabbage|carrot|cauliflower|celery|cucumber|eggplant|kale|lettuce|mushroom|okra|onion|pepper|potato|spinach|squash|tomato|turnip|zucchini/i],
  ['Grains and Cereals',/grain|cereal|barley|cornmeal|flour|millet|oat|quinoa|rice|rye|wheat/i],
  ['Beans, Peas and Legumes',/bean|chickpea|hummus|lentil|pea,|soy|tofu/i],
  ['Meat',/beef|bison|lamb|pork|veal|venison/i],['Poultry',/chicken|duck|goose|turkey/i],
  ['Fish and Seafood',/fish|salmon|tuna|cod|crab|lobster|mussel|oyster|shrimp|clam|sardine|trout/i],
  ['Dairy',/cheese|milk|yogurt|cream/i],['Eggs',/egg/i],['Nuts and Seeds',/almond|cashew|nut|peanut|pistachio|seed|walnut/i],
  ['Fats and Oils',/oil|shortening|lard/i],['Beverages',/beverage|coffee|juice|tea|water/i],
  ['Breads and Baked Goods',/bread|cake|cookie|muffin|pastry|tortilla/i],['Soups and Stews',/soup|stew/i],
  ['Sauces, Condiments and Dressings',/sauce|dressing|ketchup|mayonnaise|mustard|salsa/i],['Snacks',/snack|chips|popcorn|pretzel/i],
  ['Sweets and Desserts',/candy|chocolate|dessert|ice cream|pudding|syrup/i],['Herbs and Spices',/herb|spice|basil|cinnamon|cilantro|dill|ginger|oregano|parsley|rosemary|thyme|turmeric/i],
  ['Prepared and Mixed Foods',/prepared|restaurant|pizza|sandwich|meal/i]
];
function groupFor(name){return (groups.find(([,pattern])=>pattern.test(name))||['Other'])[0];}
const slug=s=>s.toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const records=raw.filter(Boolean).map(food=>{
  const nutrition={};
  for(const item of food.foodNutrients||[]){const key=nutrientMap[item.nutrient&&item.nutrient.id];if(key&&Number.isFinite(item.amount)&&nutrition[key]===undefined)nutrition[key]=item.amount;}
  return {id:`fdc-${food.fdcId}`,fdcId:food.fdcId,name:food.description,group:groupFor(food.description),nutritionBasis:'per 100 g',nutrition};
}).filter(x=>x.name&&Object.keys(x.nutrition).length).sort((a,b)=>a.group.localeCompare(b.group)||a.name.localeCompare(b.name));
const byGroup=new Map();for(const record of records){if(!byGroup.has(record.group))byGroup.set(record.group,[]);byGroup.get(record.group).push(record);}
const files=[];for(const [group,items] of byGroup){const file=`${slug(group)}.json`;fs.writeFileSync(path.join(foodsDir,file),JSON.stringify(items));files.push({group,file,count:items.length});}
files.sort((a,b)=>a.group.localeCompare(b.group));
fs.writeFileSync(path.join(foodsDir,'food-index.json'),JSON.stringify({title:'Comprehensive Food Reference',source:'USDA FoodData Central Foundation Foods',version:'April 2026',basis:'per 100 g',total:records.length,groups:files},null,2)+'\n');

const herbs=['Basil','Bay leaf','Chervil','Chives','Cilantro','Dill','Epazote','Fennel fronds','Lavender','Lemon balm','Lemongrass','Marjoram','Mint','Oregano','Parsley','Rosemary','Sage','Savory','Sorrel','Tarragon','Thyme'];
const spices=['Allspice','Anise','Annatto','Asafoetida','Black pepper','Caraway','Cardamom','Cassia','Cayenne','Celery seed','Cinnamon','Clove','Coriander seed','Cumin','Fenugreek','Galangal','Ginger','Grains of paradise','Juniper berry','Mace','Mahlab','Mustard seed','Nigella','Nutmeg','Paprika','Poppy seed','Saffron','Sichuan pepper','Star anise','Sumac','Turmeric','White pepper'];
const details={
  Basil:{scientificName:'Ocimum basilicum',alternateNames:['Sweet basil'],culinaryUses:['Pesto','Tomato dishes','Soups','Salads'],keywords:['aromatic','digestion','tea','tomato','pesto']},
  'Bay leaf':{scientificName:'Laurus nobilis',alternateNames:['Bay laurel'],culinaryUses:['Soups','Stews','Sauces'],keywords:['aromatic','digestion','stew']},
  Cilantro:{scientificName:'Coriandrum sativum',alternateNames:['Coriander leaf','Chinese parsley'],culinaryUses:['Salsa','Curry','Salads'],keywords:['curry','aromatic','digestion']},
  Lavender:{scientificName:'Lavandula angustifolia',alternateNames:['English lavender'],culinaryUses:['Tea','Baked goods'],keywords:['tea','aromatic','sleep','relaxation']},
  Mint:{scientificName:'Mentha species',alternateNames:['Spearmint','Peppermint'],culinaryUses:['Tea','Salads','Sauces'],keywords:['tea','digestion','nausea','aromatic']},
  Ginger:{scientificName:'Zingiber officinale',alternateNames:['Ginger root'],culinaryUses:['Curry','Tea','Baked goods'],keywords:['curry','tea','nausea','digestion','anti-inflammatory']},
  Turmeric:{scientificName:'Curcuma longa',alternateNames:['Indian saffron'],culinaryUses:['Curry','Rice','Soups'],keywords:['curry','anti-inflammatory','traditional wellness']},
  'Black pepper':{scientificName:'Piper nigrum',alternateNames:['Peppercorn'],culinaryUses:['Seasoning','Sauces','Marinades'],keywords:['pepper','digestion','aromatic']},
  'White pepper':{scientificName:'Piper nigrum',alternateNames:['White peppercorn'],culinaryUses:['Seasoning','Light sauces','Soups'],keywords:['pepper','digestion']},
  Cayenne:{scientificName:'Capsicum annuum',alternateNames:['Red pepper'],culinaryUses:['Hot sauces','Curry','Seasoning'],keywords:['pepper','curry','warming']}
};
function encyclopediaRecord(name,type){
  const d=details[name]||{};const uses=d.culinaryUses||['Seasoning','Culinary preparations'];
  return {id:slug(name),name,type,alternateNames:d.alternateNames||[],scientificName:d.scientificName||'',description:`${name} is a recognized culinary ${type} used to add aroma, flavor, or color to foods.`,traditionalUses:[`${name} has been historically used in culinary and traditional practices.`,...(d.keywords&&d.keywords.includes('tea')?[`Traditionally prepared in foods or teas.`]:[])],culinaryUses:uses,usageKeywords:[...(d.keywords||[]),...uses.map(slug)],nutritionBasis:'per 100 g when available',nutrition:{},image:`assets/herbs-spices/${type}.svg`,imageAlt:`Stylized illustration representing ${name}`,sources:['USDA FoodData Central','NCCIH Herbs at a Glance (general safety context)']};
}
fs.writeFileSync(path.join(hsDir,'herbs.json'),JSON.stringify(herbs.map(x=>encyclopediaRecord(x,'herb')),null,2)+'\n');
fs.writeFileSync(path.join(hsDir,'spices.json'),JSON.stringify(spices.map(x=>encyclopediaRecord(x,'spice')),null,2)+'\n');
const svg=(label,color,shape)=>`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="300" viewBox="0 0 480 300" role="img"><rect width="480" height="300" rx="24" fill="#0f172a"/><g fill="${color}">${shape}</g><text x="240" y="270" fill="#e2e8f0" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28">${label}</text></svg>\n`;
fs.writeFileSync(path.join(assetsDir,'herb.svg'),svg('Culinary herb','#34d399','<path d="M240 218C126 177 134 72 218 82c12 2 22 7 30 14 15-31 69-38 90-5 31 51-28 111-98 127zm-5-5c-4-64 11-106 50-137" fill="none" stroke="#34d399" stroke-width="12" stroke-linecap="round"/>'));
fs.writeFileSync(path.join(assetsDir,'spice.svg'),svg('Culinary spice','#fbbf24','<circle cx="170" cy="142" r="45"/><circle cx="250" cy="120" r="55"/><circle cx="310" cy="166" r="42"/><path d="M125 206h230" stroke="#f59e0b" stroke-width="16" stroke-linecap="round"/>'));
fs.writeFileSync(path.join(hsDir,'image-sources.json'),JSON.stringify([{entries:'All herbs',localFilename:'assets/herbs-spices/herb.svg',creator:'Nutrition Tracker project',source:'Self-created vector illustration',license:'CC0-1.0'},{entries:'All spices',localFilename:'assets/herbs-spices/spice.svg',creator:'Nutrition Tracker project',source:'Self-created vector illustration',license:'CC0-1.0'}],null,2)+'\n');
console.log(`Wrote ${records.length} foods in ${files.length} groups, ${herbs.length} herbs, and ${spices.length} spices.`);
