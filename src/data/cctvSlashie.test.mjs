import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSlashieSourcesFromCatalog } from '../../server/providers/cctv/sources.js';

const STREAM =
  /^https:\/\/s\d+\.ipcamlive\.com\/streams\/[a-z0-9]+\/stream\.m3u8$/;

test('slashie test list plays Long Level Marina as public HLS', (t) => {
  t.mock.method(console, 'log', () => {});
  const cameras = loadSlashieSourcesFromCatalog();
  assert.deepEqual(
    cameras.map((camera) => camera.id),
    ['slashie-long-level-gas-pump', 'slashie-long-level-loading'],
  );
  for (const camera of cameras) {
    assert.equal(camera.feedType, 'hls');
    assert.equal(camera.cityId, 'slashie');
    assert.equal(camera.city, 'Wrightsville');
    assert.match(camera.url, STREAM);
    assert.equal(camera.snapshotUrl, camera.url.replace(/stream\.m3u8$/, 'snapshot.jpg'));
    assert.equal(camera.credit, 'https://www.longlevelmarina.com/webcams');
    assert.equal(Object.hasOwn(camera, 'videoUrl'), false);
  }
});
