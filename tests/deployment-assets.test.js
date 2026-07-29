'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');

const config=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
assert.strictEqual(config.name,'nutrition-tracker');
assert.strictEqual(config.assets&&config.assets.directory,'.','Wrangler must deploy the repository root');

const assetRoot=path.resolve(config.assets.directory);
const required=[
  'index.html',
  'account.js',
  'data/herbs-spices/herbs.json',
  'data/herbs-spices/spices.json',
  'assets/herbs-spices/basil.webp',
  'assets/herbs-spices/image-unavailable.webp'
];
for(const relative of required)assert.ok(fs.existsSync(path.join(assetRoot,relative)),`deployment asset missing: ${relative}`);

const herbs=JSON.parse(fs.readFileSync(path.join(assetRoot,'data/herbs-spices/herbs.json'),'utf8'));
const spices=JSON.parse(fs.readFileSync(path.join(assetRoot,'data/herbs-spices/spices.json'),'utf8'));
const entries=[...herbs,...spices];
assert.strictEqual(herbs.length,33);
assert.strictEqual(spices.length,45);
assert.strictEqual(new Set(entries.map(entry=>entry.image)).size,78);
for(const entry of entries){
  assert.ok(!/^https?:\/\//i.test(entry.image),`${entry.name} must use a local image`);
  const imagePath=path.join(assetRoot,entry.image.replace(/^\//,''));
  assert.ok(fs.existsSync(imagePath),`deployment image missing: ${entry.image}`);
  assert.ok(fs.statSync(imagePath).size>0,`deployment image empty: ${entry.image}`);
}

console.log(`Deployment assets: PASS (${herbs.length} herbs, ${spices.length} spices, 78 local images)`);
