# Reference data sources and update process

## Comprehensive Food Reference

The production food-reference files were normalized from **USDA FoodData Central Foundation Foods, April 2026** (downloaded July 29, 2026). FoodData Central data are in the U.S. public domain; USDA asks that FoodData Central be credited. Source: <https://fdc.nal.usda.gov/download-datasets/>.

The repository does not include the raw archive. `scripts/build-reference-data.js` accepts the official Foundation Foods JSON file, maps supported USDA nutrient IDs to the Tracker's named fields, omits unavailable values, assigns broad display groups, alphabetizes records, and writes compact group JSON plus `data/foods/food-index.json`. Update by downloading a newer official Foundation Foods JSON release and running:

```bash
node scripts/build-reference-data.js /path/to/FoodData_Central_foundation_food.json
node tests/food-reference.test.js
```

All food values in this static reference are reported per 100 g. Values absent from the source are omitted and displayed as “Not available”; they are not converted to zero. The Tracker has not independently laboratory-verified the USDA values. The Foundation Foods subset emphasizes analytically characterized commodity and minimally processed foods. It is broad but does not contain every food, brand, restaurant item, or cultural preparation.

The complete static reference is intentionally excluded from localStorage and Supabase state. When a reference food is logged, the selected quantity and a nutrition snapshot are stored in the existing daily-entry format, preserving historical totals if the static dataset changes. Existing built-ins remain available to recipes and the Today's Menu selector, while existing custom foods remain user state.

## Herbs and Spices culinary reference

The herb and spice names, concise taste descriptions, and suggested food pairings form a focused culinary pairing reference. They are maintained in `scripts/build-reference-data.js` and written to `data/herbs-spices/herbs.json` and `spices.json`.

This culinary dataset is separate from the USDA Food Reference nutrition dataset described above. Herbs and Spices records are not nutrition-entry records and are not offered by the Today's Menu selector unless a separately sourced USDA or built-in food record has the same ingredient.

Pairings reflect common culinary practice and focus on familiar foods and dishes. Every generated record contains only its stable identity and grouping fields, `taste`, `suggestedFoods`, and local image metadata. The generator rejects blank tastes or lists with fewer than five suggested foods.

## Images

`assets/herbs-spices/herb.svg` and `spice.svg` are lightweight original vector illustrations created for this project and dedicated under CC0-1.0. Every encyclopedia record has descriptive alt text and uses one of these local assets. Attribution metadata is in `data/herbs-spices/image-sources.json`. These are category illustrations rather than documentary botanical-identification photographs and must not be used to identify plants.
