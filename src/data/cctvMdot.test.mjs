import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCctvCatalog } from '../../server/providers/cctv/catalog.js';
import { MDOT_CCTV_URL } from '../../server/providers/cctv/constants.js';
import { loadMdotSourcesFromOpenData } from '../../server/providers/cctv/sources.js';

const HEALTHY_ID = '0000309302ce009e0052fa36c4235c0a';

function mdotRow(overrides = {}) {
  return {
    id: HEALTHY_ID,
    name: 'I-95N GP AT I-695',
    description: 'I-95 NB GP AT I-695, MP 63.9 (C024B)',
    lat: 39.350952,
    lon: -76.494608,
    commMode: 'ONLINE',
    opStatus: 'OK',
    cctvIp: 'strmr5.sha.maryland.gov',
    cameraCategories: ['Baltimore'],
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

test('MDOT registers a healthy CHART camera as pinned HLS plus a still', async (t) => {
  quiet(t);
  withEnv(t, { CCTV_MDOT_MAX_SOURCES: undefined });
  t.mock.method(globalThis, 'fetch', async () => jsonResponse([mdotRow()]));

  const [camera] = await loadMdotSourcesFromOpenData();
  assert.equal(camera.id, `mdot-${HEALTHY_ID}`);
  assert.equal(camera.provider, 'MDOT SHA');
  assert.equal(camera.cityId, 'maryland');
  assert.equal(camera.city, 'Baltimore');
  assert.equal(camera.feedType, 'hls');
  assert.equal(camera.sourceKind, 'mdot-chart');
  assert.equal(camera.headingDeg, 0);
  assert.equal(camera.headingConfidence, 'high');
  assert.equal(
    camera.url,
    `https://strmr5.sha.maryland.gov/rtplive/${HEALTHY_ID}/playlist.m3u8`,
  );
  assert.equal(
    camera.snapshotUrl,
    `https://chart.maryland.gov/wwwroot/thumbnails/${HEALTHY_ID}.jpg`,
  );
  assert.equal(
    camera.credit,
    `https://chart.maryland.gov/Video/GetVideo/${HEALTHY_ID}`,
  );
});

test('MDOT drops offline, failed, out-of-state, and unpinned stream rows', async (t) => {
  quiet(t);
  const rows = [
    mdotRow({ id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', commMode: 'OFFLINE' }),
    mdotRow({ id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', opStatus: 'COMM_FAILURE' }),
    mdotRow({ id: 'cccccccccccccccccccccccccccccccc', lat: 40.7, lon: -74.0 }),
    mdotRow({
      id: 'dddddddddddddddddddddddddddddddd',
      cctvIp: 'evil.example',
    }),
    mdotRow({
      id: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      cctvIp: 'strmr5.sha.maryland.gov.evil.com',
    }),
    mdotRow({ id: 'not-hex' }),
    mdotRow({ id: 'ffffffffffffffffffffffffffffffff' }),
  ];
  t.mock.method(globalThis, 'fetch', async () => jsonResponse(rows));

  const cameras = await loadMdotSourcesFromOpenData();
  assert.deepEqual(
    cameras.map((camera) => camera.id),
    ['mdot-ffffffffffffffffffffffffffffffff'],
  );
  assert.equal(cameras[0].feedType, 'hls');
});

test('MDOT returns no cameras when the catalog is not JSON', async (t) => {
  quiet(t);
  t.mock.method(globalThis, 'fetch', async () =>
    new Response('<html>unavailable</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    }),
  );
  assert.deepEqual(await loadMdotSourcesFromOpenData(), []);
});

test('MDOT orders cameras nearest an anchor first', async (t) => {
  quiet(t);
  const rows = [
    mdotRow({
      id: '11111111111111111111111111111111',
      name: 'I-68 western Maryland',
      description: 'I-68',
      lat: 39.4,
      lon: -79.4,
      cameraCategories: ['Western MD'],
    }),
    mdotRow({
      id: '22222222222222222222222222222222',
      name: 'I-95 at Baltimore',
      description: 'I-95',
      lat: 39.2904,
      lon: -76.6122,
    }),
  ];
  t.mock.method(globalThis, 'fetch', async () => jsonResponse(rows));
  const cameras = await loadMdotSourcesFromOpenData();
  assert.equal(cameras[0].id, 'mdot-22222222222222222222222222222222');
  assert.equal(cameras.length, 2);
});

test('CCTV_MDOT_ENABLED=0 skips the CHART request', async (t) => {
  quiet(t);
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-mdot-cctv-'));
  t.after(() => fs.rmSync(sourceRoot, { recursive: true, force: true }));
  withEnv(t, {
    CCTV_SOURCES_FILE: undefined,
    CCTV_SOURCES_JSON: undefined,
    CCTV_MDOT_ENABLED: '0',
  });
  const requested = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requested.push(String(url));
    return new Response('unavailable', { status: 503 });
  });

  assert.deepEqual(await createCctvCatalog({ sourceRoot })(), []);
  assert.equal(requested.includes(MDOT_CCTV_URL), false);
  assert.ok(requested.length > 0, 'the other live packs still load');
});
