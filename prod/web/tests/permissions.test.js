// The shared can() cases (prod/shared/permission-cases.json), run against
// web/js/state/permissions.js. server/tests/test_permissions.py runs the same
// cases against the server's can(). Run with `make check-web` (Node's test runner).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { can, PERMISSIONS } from '../js/state/permissions.js';
import cases from '../../shared/permission-cases.json' with { type: 'json' };

const ME = 'm-me';

/** A space where ME has the case's role (or isn't in it, for `as: null`). */
function spaceFor({ space, as }) {
  return {
    id: 'g-test',
    kind: space.kind,
    memberIds: as ? [ME] : ['m-someone-else'],
    roles: as ? { [ME]: as } : {},
    permissions: space.permissions ?? {},
  };
}

for (const c of cases.cases) {
  test(c.name, () => {
    assert.equal(can(spaceFor(c), ME, c.permission), c.expect);
  });
}

test('every case names a real permission', () => {
  const ids = new Set(PERMISSIONS.map((p) => p.id));
  for (const c of cases.cases) assert.ok(ids.has(c.permission), c.permission);
});
