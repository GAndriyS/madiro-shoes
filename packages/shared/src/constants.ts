/** Shoe sizes are whole numbers only (see requirements-analysis, section 3.1). */
export const SIZE_MIN = 16;
export const SIZE_MAX = 50;

/** Maximum tag photo size before compression (section 7, item 10). */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Customer-return guideline; later returns are not blocked (section 3.3, item 6). */
export const RETURN_GUIDELINE_DAYS = 14;

/** "Day" in statistics is computed in the store's timezone (section 7, item 11). */
export const STORE_TIMEZONE = 'Europe/Kyiv';
