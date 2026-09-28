import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPaWebcamsSourcesFromCatalog } from '../../server/providers/cctv/sources.js';

const HLS =
  /^https:\/\/s\d+\.ipcamlive\.com\/streams\/[a-z0-9]+\/stream\.m3u8$/;
const STILL = /^https:\/\/www\.511pa\.com\/map\/Cctv\/\d+$/;

test('PA webcams pack plays public HLS and registers 511PA stills', (t) => {
  t.mock.method(console, 'log', () => {});
  const cameras = loadPaWebcamsSourcesFromCatalog();
  assert.equal(cameras.length, 86);
  const hls = cameras.filter((camera) => camera.feedType === 'hls');
  const stills = cameras.filter((camera) => camera.feedType === 'image');
  assert.equal(hls.length, 2);
  assert.equal(stills.length, 84);
  for (const camera of cameras) {
    assert.equal(camera.cityId, 'pa-webcams');
    assert.equal(Object.hasOwn(camera, 'videoUrl'), false);
    assert.equal(Object.hasOwn(camera, 'videoAuthRequired'), false);
  }
  for (const camera of hls) {
    assert.equal(camera.sourceKind, 'pa-webcams-hls');
    assert.match(camera.url, HLS);
    assert.equal(
      camera.snapshotUrl,
      camera.url.replace(/stream\.m3u8$/, 'snapshot.jpg'),
    );
  }
  for (const camera of stills) {
    assert.equal(camera.sourceKind, 'pa-webcams-511pa');
    assert.match(camera.url, STILL);
    assert.equal(camera.snapshotUrl, camera.url);
  }
});

test('PA webcams loader tolerates a missing catalog file', (t) => {
  t.mock.method(console, 'warn', () => {});
  assert.deepEqual(
    loadPaWebcamsSourcesFromCatalog({ sourceRoot: '/nonexistent' }),
    [],
  );
});

test('PA webcams loader skips youtube, page-only, and auth video rows', (t) => {
  t.mock.method(console, 'log', () => {});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gev-pa-webcams-'));
  fs.mkdirSync(path.join(dir, 'config'));
  fs.writeFileSync(
    path.join(dir, 'config', 'cctv_sources.pa-webcams.json'),
    JSON.stringify([
      {
        id: 'hls-ok',
        feedType: 'hls',
        url: 'https://s162.ipcamlive.com/streams/a2r93t2r8f5w71qho/stream.m3u8',
        snapshotUrl:
          'https://s162.ipcamlive.com/streams/a2r93t2r8f5w71qho/snapshot.jpg',
        lat: 39.9714,
        lon: -76.4929,
      },
      {
        id: 'still-ok',
        feedType: 'image',
        url: 'https://www.511pa.com/map/Cctv/4779',
        lat: 40.133139,
        lon: -75.192725,
        videoUrl: 'https://pa-se3.arcadis-ivds.com:8200/chan-2279/index.m3u8',
        videoAuthRequired: true,
      },
      {
        id: 'youtube',
        feedType: 'hls',
        url: 'https://www.youtube.com/live/i---Bn8Z4PU',
        lat: 39.9582,
        lon: -75.1731,
      },
      {
        id: 'page-only',
        feedType: 'image',
        url: 'https://www.fox29.com/allentown-webcam',
        lat: 40.6028,
        lon: -75.4714,
      },
      {
        id: 'out-of-state',
        feedType: 'image',
        url: 'https://www.511pa.com/map/Cctv/2',
        lat: 30.2,
        lon: -97.7,
      },
    ]),
  );
  const cameras = loadPaWebcamsSourcesFromCatalog({ sourceRoot: dir });
  assert.deepEqual(
    cameras.map((camera) => camera.id),
    ['hls-ok', 'still-ok'],
  );
  assert.equal(Object.hasOwn(cameras[1], 'videoUrl'), false);
});
