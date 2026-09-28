import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCctvCatalog } from '../../server/providers/cctv/catalog.js';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const FILE = path.join(ROOT, 'config/cctv_sources.pennsylvania.json');
const STILL_URL = /^https:\/\/www\.511pa\.com\/map\/Cctv\/\d+$/;

test('Pennsylvania 511PA pack is statewide stills with no video metadata', () => {
  const rows = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  assert.equal(rows.length, 1395);
  const ids = new Set();
  for (const row of rows) {
    assert.equal(ids.has(row.id), false, row.id);
    ids.add(row.id);
    assert.equal(row.cityId, 'pennsylvania');
    assert.equal(row.feedType, 'image');
    assert.match(row.url, STILL_URL);
    assert.equal(row.snapshotUrl, row.url);
    assert.equal(row.credit, row.url);
    assert.match(row.license, /video streams require PennDOT license/);
    assert.equal(Object.hasOwn(row, 'videoUrl'), false);
    assert.equal(Object.hasOwn(row, 'videoAuthRequired'), false);
  }
});

test('CCTV_SOURCES_FILE registers the Pennsylvania stills and drops video fields', async (t) => {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  const saved = { ...process.env };
  try {
    process.env.CCTV_SOURCES_FILE = FILE;
    process.env.CCTV_FORCE_AUSTIN = '0';
    delete process.env.CCTV_SOURCES_JSON;
    const sources = await createCctvCatalog({
      sourceRoot: path.join(ROOT, 'absent-cctv-root'),
    })();
    assert.equal(sources.length, 1395);
    for (const source of sources) {
      assert.equal(source.feedType, 'image');
      assert.match(source.url, STILL_URL);
      assert.equal(source.snapshotUrl, source.url);
      assert.equal(source.videoUrl, undefined);
      assert.equal(source.videoAuthRequired, undefined);
      assert.equal(Object.hasOwn(source, 'videoUrl'), false);
    }
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  }
});
