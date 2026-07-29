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

## Herb and Spice Encyclopedia

The initial names and culinary classifications are a curated educational list. General source context:

- USDA FoodData Central: nutrition terminology and available food-composition context, public domain.
- U.S. National Center for Complementary and Integrative Health, Herbs at a Glance: general traditional-use and safety framing, U.S. government information, <https://www.nccih.nih.gov/health/herbsataglance>.

Traditional-use statements are neutral historical summaries, not treatment claims. Nutrition objects remain empty when a reliable matching value was not selected; the interface displays those fields as unavailable. Future editors can add sourced records to `data/herbs-spices/herbs.json` or `spices.json` without changing screen code.

## Images

`assets/herbs-spices/herb.svg` and `spice.svg` are lightweight original vector illustrations created for this project and dedicated under CC0-1.0. Every encyclopedia record has descriptive alt text and uses one of these local assets. Attribution metadata is in `data/herbs-spices/image-sources.json`. These are category illustrations rather than documentary botanical-identification photographs and must not be used to identify plants.
