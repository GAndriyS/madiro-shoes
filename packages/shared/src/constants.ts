/** Розміри взуття — лише цілі числа (див. requirements-analysis, розділ 3.1). */
export const SIZE_MIN = 16;
export const SIZE_MAX = 50;

/** Максимальний розмір фото бірки до стиснення (розділ 7, п. 10). */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/** Орієнтир для повернення від покупця; пізніші повернення не блокуються (розділ 3.3, п. 6). */
export const RETURN_GUIDELINE_DAYS = 14;

/** «День» у статистиці рахується за часом магазину (розділ 7, п. 11). */
export const STORE_TIMEZONE = 'Europe/Kyiv';
