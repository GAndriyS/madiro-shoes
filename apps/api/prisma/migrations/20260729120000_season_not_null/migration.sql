-- Insulation becomes a value rather than an absence: «Без утеплення» is NONE.
--
-- A nullable season let one physical shoe live in two variants — the scanner
-- form always sends NONE, while other paths stored NULL — so find-or-create
-- split the stock and any price lookup keyed on the identity missed half of it.
--
-- Order matters. Setting NULL -> NONE first would violate
-- variants_style_color_material_season_key wherever both twins already exist
-- (Postgres treats NULL as distinct, which is exactly how the split happened),
-- so the duplicates are merged before the column is tightened.

-- The NULL-season variant and its NONE twin, matched on the rest of the identity.
-- IS NOT DISTINCT FROM so that a NULL material matches a NULL material.
CREATE TEMP TABLE season_merge ON COMMIT DROP AS
SELECT dup.id AS dup_id, keep.id AS keep_id
FROM variants dup
JOIN variants keep
  ON keep.style = dup.style
 AND keep.color = dup.color
 AND keep.material IS NOT DISTINCT FROM dup.material
 AND keep.season = 'NONE'
WHERE dup.season IS NULL;

-- The survivor keeps its own price and inherits one only if it never had any:
-- a confirmed price must not be overwritten by the twin's.
UPDATE variants keep
SET "purchasePrice" = dup."purchasePrice"
FROM season_merge m
JOIN variants dup ON dup.id = m.dup_id
WHERE keep.id = m.keep_id
  AND keep."purchasePrice" IS NULL
  AND dup."purchasePrice" IS NOT NULL;

-- Pairs (and with them their operations, which reference the pair, not the
-- variant) move to the survivor, so no stock or history is lost.
UPDATE pairs p
SET "variantId" = m.keep_id
FROM season_merge m
WHERE p."variantId" = m.dup_id;

DELETE FROM variants v
USING season_merge m
WHERE v.id = m.dup_id;

-- Whatever is left without insulation simply had none.
UPDATE variants SET season = 'NONE' WHERE season IS NULL;

ALTER TABLE "variants"
  ALTER COLUMN "season" SET NOT NULL,
  ALTER COLUMN "season" SET DEFAULT 'NONE';
