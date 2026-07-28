import { REALTIME_TOPICS } from '@madiro/shared';
import { describe, expect, it } from 'vitest';

import { queryKeysFor } from '../src/lib/realtime';

describe('realtime → invalidation map', () => {
  it('кожен топік щось інвалідовує (жодна подія не «німа»)', () => {
    for (const topic of REALTIME_TOPICS) {
      expect(queryKeysFor(topic).length).toBeGreaterThan(0);
    }
  });

  it('нова чернетка оновлює чергу, бейдж і склад', () => {
    expect(queryKeysFor('intake-draft')).toEqual(
      expect.arrayContaining([['intake'], ['stock'], ['stats']]),
    );
  });

  it('продаж і повернення оновлюють статистику та склад', () => {
    for (const topic of ['sale', 'return', 'writeoff'] as const) {
      expect(queryKeysFor(topic)).toEqual(expect.arrayContaining([['stats'], ['stock']]));
    }
  });
});
