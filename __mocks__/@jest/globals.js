const {
  describe,
  it,
  test,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  jest: jestObj,
} = global;

module.exports = {
  describe: describe || (() => {}),
  it: it || test || (() => {}),
  test: test || it || (() => {}),
  expect: expect || (() => {}),
  beforeAll: beforeAll || (() => {}),
  beforeEach: beforeEach || (() => {}),
  afterAll: afterAll || (() => {}),
  afterEach: afterEach || (() => {}),
  jest: jestObj || {},
};
