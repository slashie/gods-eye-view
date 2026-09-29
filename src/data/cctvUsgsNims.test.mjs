import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCctvCatalog } from '../../server/providers/cctv/catalog.js';
import { USGS_NIMS_CAMERAS_URL } from '../../server/providers/cctv/constants.js';
import { loadUsgsNimsSourcesFromOpenData } from '../../server/providers/cctv/sources.js';

const CAM_ID = 'IL_Lick_Creek_near_Woodside';

function usgsRow(overrides = {}) {
  return {
    camId: CAM_ID,
    camName: 'Lick Creek near Woodside',
    lat: '39.71553889',
    lng: '-89.7024444',
    stateAbrv: 'IL',
    newestImageDT: new Date().toISOString(),
    hideCam: false,
    smallDir: 'https://evil.example/steal/',
    ...overrides,
  };
}

function withEnv(t, env) {
  for (const [name, value] of Object.entries(env)) {
    const previous = process.env[name];
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function quiet(t) {
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('USGS NIMS registers a fresh gauge as a pinned newest JPEG', async (t) => {
  quiet(t);
  t.mock.method(globalThis, 'fetch', async () => jsonResponse([usgsRow()]));
  const [camera] = await loadUsgsNimsSourcesFromOpenData();
  const imageUrl = `https://usgs-nims-images.s3.amazonaws.com/720/${CAM_ID}/${CAM_ID}_newest.jpg`;
  assert.equal(camera.id, `usgs-nims-${CAM_ID.toLowerCase()}`);
  assert.equal(camera.provider, 'USGS');
  assert.equal(camera.city, 'IL');
  assert.equal(camera.cityId, 'usgs-il');
  assert.equal(camera.feedType, 'image');
  assert.equal(camera.sourceKind, 'usgs-nims');
  assert.equal(camera.url, imageUrl);
  assert.equal(camera.snapshotUrl, imageUrl);
  assert.equal(camera.credit, 'https://waterdata.usgs.gov/');
  assert.equal(camera.lat, 39.71553889);
});

test('USGS NIMS drops hidden, stale, misplaced, and unsafe ids', async (t) => {
  quiet(t);
  const stale = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const rows = [
    usgsRow({ camId: 'hidden_gauge', hideCam: true }),
    usgsRow({ camId: 'stale_gauge', newestImageDT: stale }),
    usgsRow({ camId: 'ocean_gauge', lat: '0', lng: '0' }),
    usgsRow({ camId: '../etc/passwd' }),
    usgsRow({ camId: 'NM_EAGLE_LAKE_(SOUTH_12)', lat: '36.5', lng: '-105.2' }),
  ];
  t.mock.method(globalThis, 'fetch', async () => jsonResponse(rows));
  const cameras = await loadUsgsNimsSourcesFromOpenData();
  assert.deepEqual(
    cameras.map((camera) => camera.id),
    ['usgs-nims-nm_eagle_lake_(south_12)'],
  );
  assert.match(cameras[0].url, /^https:\/\/usgs-nims-images\.s3\.amazonaws\.com\/720\//);
});

test('USGS NIMS orders a camera nearest an anchor first', async (t) => {
  quiet(t);
  const rows = [
    usgsRow({
      camId: 'GU_far_gauge',
      lat: '13.5',
      lng: '144.8',
      stateAbrv: 'GU',
      camName: 'Guam gauge',
    }),
    usgsRow({
      camId: 'IL_chicago_gauge',
      lat: '41.8781',
      lng: '-87.6298',
      camName: 'Chicago gauge',
    }),
  ];
  t.mock.method(globalThis, 'fetch', async () => jsonResponse(rows));
  const cameras = await loadUsgsNimsSourcesFromOpenData();
  assert.equal(cameras[0].id, 'usgs-nims-il_chicago_gauge');
  assert.equal(cameras.length, 2);
});

test('CCTV_USGS_NIMS_ENABLED=0 skips the USGS request', async (t) => {
  quiet(t);
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-usgs-cctv-'));
  t.after(() => fs.rmSync(sourceRoot, { recursive: true, force: true }));
  withEnv(t, {
    CCTV_SOURCES_FILE: undefined,
    CCTV_SOURCES_JSON: undefined,
    CCTV_USGS_NIMS_ENABLED: '0',
  });
  const requested = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requested.push(String(url));
    return new Response('unavailable', { status: 503 });
  });
  assert.deepEqual(await createCctvCatalog({ sourceRoot })(), []);
  assert.equal(requested.includes(USGS_NIMS_CAMERAS_URL), false);
  assert.ok(requested.length > 0, 'the other live packs still load');
});
