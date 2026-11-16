import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertOriginalGraphAdmission } from './admission.mjs';

test('missing, expired and unapproved admission stop before synthetic acquisition', () => {
  const now = Date.parse('2026-11-16T12:00:00Z');
  for (const admission of [undefined, {}, { expiresAt: '2026-11-16T11:59:59Z' },
    { expiresAt: '2026-11-16T12:00:00Z' }, { expiresAt: '2026-11-17T12:00:00Z', approved: true }]) {
    let acquired = false;
    assert.throws(() => {
      assertOriginalGraphAdmission(admission, now);
      acquired = true;
    });
    assert.equal(acquired, false);
  }
});
