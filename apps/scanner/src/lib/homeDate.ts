/** «Вівторок, 14 липня» — weekday capitalized, per the scanner home design. */
export function homeDate(lang: string, now: Date = new Date()): string {
  const locale = lang === 'en' ? 'en-GB' : 'uk-UA';
  const s = now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
