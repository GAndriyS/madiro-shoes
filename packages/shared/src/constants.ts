/** Shoe sizes are whole numbers only (see requirements-analysis, section 3.1). */
export const SIZE_MIN = 16;
export const SIZE_MAX = 50;

/**
 * Sizes the intake grid offers by default — the range this store actually
 * receives. It is narrower than SIZE_MIN..SIZE_MAX on purpose: those are the
 * bounds of a *valid* size, this is the set worth putting on a phone screen.
 * A scanned size outside the range is added to the grid rather than dropped,
 * so the range is a default, never a limit on what can be taken in.
 */
export const INTAKE_GRID_MIN = 35;
export const INTAKE_GRID_MAX = 41;

/**
 * Cap per size in one intake. Not a business rule — a typo guard: the quantity
 * is typed on a phone, and a stray digit would otherwise create 380 pairs that
 * someone has to delete one by one.
 */
export const MAX_PAIRS_PER_SIZE = 99;

/** Maximum tag photo size before compression (section 7, item 10). */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Customer-return guideline; later returns are not blocked (section 3.3, item 6). */
export const RETURN_GUIDELINE_DAYS = 14;

/** "Day" in statistics is computed in the store's timezone (section 7, item 11). */
export const STORE_TIMEZONE = 'Europe/Kyiv';
