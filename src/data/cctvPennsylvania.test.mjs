import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPennDotSourcesFromCatalog } from '../../server/providers/cctv/sources.js';

const STILL_URL = /^https:\/\/www\.511pa\.com\/map\/Cctv\/\d+$/;

test('PennDOT catalog registers statewide 511PA stills and drops video', (t) => {
  t.mock.method(console, 'log', () => {});
  const cameras = loadPennDotSourcesFromCatalog();
  assert.equal(cameras.length, 1395);
  const ids = new Set();
  for (const camera of cameras) {
    assert.equal(ids.has(camera.id), false, camera.id);
    ids.add(camera.id);
    assert.equal(camera.cityId, 'pennsylvania');
    assert.equal(camera.feedType, 'image');
    assert.equal(camera.sourceKind, 'penndot-511pa');
    assert.match(camera.url, STILL_URL);
    assert.equal(camera.snapshotUrl, camera.url);
    assert.equal(Object.hasOwn(camera, 'videoUrl'), false);
    assert.equal(Object.hasOwn(camera, 'videoAuthRequired'), false);
  }
});

test('PennDOT loader tolerates a missing catalog file', (t) => {
  t.mock.method(console, 'warn', () => {});
  assert.deepEqual(
    loadPennDotSourcesFromCatalog({ sourceRoot: '/nonexistent' }),
    [],
  );
});

test('PennDOT loader skips rows outside 511PA stills', (t) => {
  t.mock.method(console, 'log', () => {});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-penndot-'));
  fs.mkdirSync(path.join(dir, 'config'));
  fs.writeFileSync(
    path.join(dir, 'config', 'cctv_sources.pennsylvania.json'),
    JSON.stringify([
      {
        id: 'ok',
        url: 'https://www.511pa.com/map/Cctv/6122',
        lat: 40.0,
        lon: -76.7,
        videoUrl: 'https://example.invalid/live.m3u8',
        videoAuthRequired: true,
      },
      {
        id: 'off-host',
        url: 'https://evil.example/map/Cctv/1',
        lat: 40.0,
        lon: -76.7,
      },
      {
        id: 'out-of-state',
        url: 'https://www.511pa.com/map/Cctv/2',
        lat: 30.2,
        lon: -97.7,
      },
    ]),
  );
  const cameras = loadPennDotSourcesFromCatalog({ sourceRoot: dir });
  assert.deepEqual(
    cameras.map((camera) => camera.id),
    ['ok'],
  );
  assert.equal(Object.hasOwn(cameras[0], 'videoUrl'), false);
});
