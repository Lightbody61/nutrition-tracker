# Reference data sources and update process

## Curated food database

The production tracker uses a controlled built-in catalog rather than exposing the full USDA archives. Generic foods are checked against **USDA FoodData Central Foundation Foods, April 2026**, **SR Legacy, April 2018**, or **FNDDS 2021–2023, October 2024**. FoodData Central data are in the U.S. public domain; USDA asks that FoodData Central be credited. Source: <https://fdc.nal.usda.gov/download-datasets/>.

The raw USDA archives are not production food lists and are not included in the repository. Foundation, SR Legacy, and FNDDS overlap, contain distinct preparation variants, and do not report every nutrient for every record. They must not be concatenated directly into the selectable database.

Every built-in food must store all nutrient fields used by the Tracker. A zero is permitted only as an assigned numeric value; an absent property fails the nutrition audit. Generic USDA-derived foods should also record their FDC ID, source description, serving weight, and source dataset. Manufacturer-specific foods and supplements must use their product label rather than a generic USDA substitute. Recipes must be recalculated when ingredients, amounts, yield, or serving size changes.

The full USDA reference catalog is disabled in production to prevent cross-dataset duplicates and incomplete rows from appearing beside the curated foods. `data/foods/food-index.json` therefore contains no selectable USDA archive groups.

Run `node scripts/audit-nutrition-data.js` after any food or recipe edit. The audit rejects empty records, duplicate built-in names, any missing tracked nutrient property, nonnumeric or negative assigned values, inconsistent vitamin D/K component totals, invalid static-reference records, and index-count drift. Recipe values remain estimates when ingredient brands, optional ingredients, cooking yield, or serving weight can vary.

Logged entries continue to store nutrition snapshots, so historical totals do not change when the curated catalog is corrected. Custom foods remain user state and are not silently merged with the controlled built-in catalog.

## Herbs and Spices culinary reference

The herb and spice names, concise taste descriptions, and suggested food pairings form a focused culinary pairing reference. They are maintained in `scripts/build-reference-data.js` and written to `data/herbs-spices/herbs.json` and `spices.json`.

This culinary dataset is separate from the USDA Food Reference nutrition dataset described above. Herbs and Spices records are not nutrition-entry records and are not offered by the Today's Menu selector unless a separately sourced USDA or built-in food record has the same ingredient.

Pairings reflect common culinary practice and focus on familiar foods and dishes. Every generated record contains only its stable identity and grouping fields, `taste`, `suggestedFoods`, and local image metadata. The generator rejects blank tastes or lists with fewer than five suggested foods.

## Herbs and Spices images

Every Herbs and Spices entry uses its own local, original generated illustration of the culinary plant part or spice. The assets are optimized 360 x 240 WebP files; the interface lazy-loads them and uses `image-unavailable.webp` only when an individual image unexpectedly fails. The images are culinary reference illustrations, not botanical-identification photographs. Per-file source and usage records are in `HERB_SPICE_IMAGE_SOURCES.md`.
