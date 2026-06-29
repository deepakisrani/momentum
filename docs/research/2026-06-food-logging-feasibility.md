# Food / Calorie Logging — Open-Data Feasibility (Phase 3)

**Date:** 2026-06 · **Status:** Research only (not scheduled). Method: deep-research (24 sources, 24/25 claims adversarially verified, 1 refuted).
**Context:** Momentum is a Vite + React + TS PWA on Supabase/Postgres, offline-capable, India-based user. Goal: log food → calories/macros → feed dynamic calorie targets (ties into existing BMR/TDEE).

## Verdict
Feasible with a **hybrid open-data architecture**. No single open DB covers everything; combine three, each for what it's best at. Two things are genuinely hard: **legal clearance for Indian home-cooked-dish data**, and **barcode scanning on iOS Safari**.

## Sources evaluated

### Open Food Facts (OFF) — packaged/barcoded items (Indian + global) ✅ best fit
- **Coverage:** ~4M+ global products; **India ~10k (Sept 2024) → ~21k now** and growing fast (crowdsourced). Strongest open barcode source.
- **Access:** JSON REST API (`GET /api/v3.6/product/{barcode}.json`, same API as the official OFF app) **but** the API is for **1 call = 1 real user scan**, rate-limited (~15 req/min/IP product, 10/min search); scraping is blocked. For our own search index, the **supported path is the bulk dump** (CSV ~0.9 GB gz / ~9 GB raw, also JSONL / MongoDB / Parquet) with **14-day delta exports** for refresh.
- **Licensing:** ODbL + DbCL — **commercial use OK**, but **mandatory attribution** (link to openfoodfacts.org + license) and **share-alike**: if you publish a *derivative database* that merges OFF data, that DB must be released open under ODbL. Mitigation: keep OFF data as a **separable, attributed** component (a "collective" not "derivative" DB), don't blend it into a proprietary merged table. *(One 2-1 split on the exact scope of "combine" — worth a quick legal sanity check before the data model.)*
- **Quality gotcha:** Indian packaged entries often have **incomplete macros** (Indian producers under-disclose on labels; 21–52% labeling non-compliance in studies) → need a manual-entry fallback when a barcode hit is sparse.

### USDA FoodData Central — generic whole foods (rice, chicken, oats) ✅ easy
- Authoritative generic nutrition, **public domain** (no attribution/share-alike burden), API + bulk download. Cleanest source to layer in. *(Exact API key/rate-limit specifics not independently re-verified here — confirm at build time.)*

### Indian home-cooked dishes — ⚠️ the hard part (licensing)
- **IFCT 2017** (ICMR-NIN, Govt of India): authoritative (151 components, 528 foods) **but raw ingredients only (except eggs)** — gives raw rice/dal macros, not cooked-dish values — and **cannot be shipped in a product without NIN's written permission.** Hard blocker for direct use.
- **INDB** (Indian Nutrient Databank): **1,014 cooked composite recipes** (curries, breads, regional dishes) + 1,095 raw items, full macros — exactly the gap-filler — **but its GitHub repo has NO data license** (the paper's CC BY covers the article, not the dataset), and it's derived from IFCT, so it may inherit IFCT's restriction. **The assumption that INDB is CC-BY-shippable was specifically REFUTED (0-3).** Needs the authors to grant an explicit data license, or NIN permission.

### Closed/paid (only if open gaps hurt)
Nutritionix / FatSecret / Edamam are the realistic answer for **restaurant/takeaway** items (no good open source), but they're out of scope for an open-data build.

## Recommended architecture (hybrid)
1. **Import** a curated **OFF subset** (India + top global packaged) into **Supabase Postgres** with **full-text search**; refresh via OFF's **14-day deltas**. Keep it a separable, attributed table.
2. **Layer USDA** (public domain) for generic whole-food macros.
3. **Indian cooked dishes:** gate on licensing — clear INDB's data license *or* get NIN permission for IFCT, then import.
4. **Live OFF API** used *only* as a per-scan fallback for barcodes not yet in the local subset.
5. **Offline/PWA:** don't bundle the multi-GB DB — query Supabase online, cache **recently/frequently used items** client-side (IndexedDB) for offline logging.
6. **Barcode scanning:** `BarcodeDetector` API has **poor/absent iOS Safari support** → ship a **JS fallback** (ZXing / QuaggaJS) + camera-permission UX for the installed PWA.

## Biggest risks
1. **Indian cooked-dish licensing** (INDB no license / IFCT needs NIN permission) — the top blocker; resolve before relying on either.
2. **iOS barcode scanning** — needs a JS scanner fallback, not the native API.
3. **OFF share-alike** — keep OFF data separable + attributed; sanity-check the "combine" scope.
4. **Indian packaged macro gaps** — manual-entry fallback required.

## Rough effort (phased)
- **Phase A — core logging (no legal blockers):** OFF India+global subset + USDA imported to Supabase w/ FTS; food search + portion/quantity logging UI; manual-entry fallback; wire into the existing calorie-target math. *(The bulk of the value.)*
- **Phase B — barcode scan:** `BarcodeDetector` + ZXing/QuaggaJS fallback; camera UX.
- **Phase C — Indian home dishes:** *legal first* (INDB license / NIN permission), then import INDB recipes.
- **Later:** restaurant items via a paid API if the open gap proves painful.

## Open questions to close before building
- USDA FDC exact licensing / API key / rate limits / bulk format.
- `BarcodeDetector` on iOS Safari in 2026 — confirm fallback need + library choice.
- Will NIN grant IFCT permission, and/or will INDB authors add an explicit data license?
- Supabase footprint + FTS performance for the OFF subset, and delta-sync cadence/compute.

## Key sources
- OFF India 10k milestone — blog.openfoodfacts.org/.../open-food-facts-india-database-reaches-10k-product-milestone
- OFF data/dumps + API rules — world.openfoodfacts.org/data · openfoodfacts.github.io/openfoodfacts-server/api
- OFF terms/ODbL — world.openfoodfacts.org/terms-of-use · opendatacommons.org/licenses/odbl
- IFCT 2017 — nin.res.in/ebooks/IFCT2017.pdf
- INDB — github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB- · pmc.ncbi.nlm.nih.gov/articles/PMC11277795
- USDA FDC — fdc.nal.usda.gov/about-us
- Supabase FTS — supabase.com/docs/guides/database/full-text-search
- Barcode/iOS — caniuse.com/mdn-api_barcodedetector · scanbot.io/blog/popular-open-source-javascript-barcode-scanners
