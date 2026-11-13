import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/components/UnifiedPartyStatementDocument.tsx', import.meta.url),
  'utf8'
);

test('customer statement invoice item table has no image column or inline thumbnail', () => {
  const tableStart = source.indexOf('<table className="w-full text-right report-sub-table border-collapse">');
  assert.ok(tableStart > 0, 'shared invoice item table missing');
  const tableEnd = source.indexOf('</table>', tableStart);
  assert.ok(tableEnd > tableStart, 'invoice item table closing tag missing');
  const table = source.slice(tableStart, tableEnd);
  assert.doesNotMatch(table, /<img\b|it\.imageThumbnail|<th[^>]*>صورة<\/th>/);
  assert.match(table, /<td colSpan=\{8\}/);
  assert.match(table, /\{iIdx \+ 1\}/);
});

test('attached images appear only below invoice items with a numbered badge on each photo', () => {
  const galleryStart = source.indexOf('showImageThumbnailsInStatement && row.items');
  assert.ok(galleryStart > 0, 'invoice gallery missing');
  const gallery = source.slice(galleryStart);
  assert.match(gallery, /parseThumbnails\(it\.imageThumbnail\)/);
  assert.match(gallery, /it\.attachments/);
  assert.match(gallery, /src=\{imgObj\.imgStr\}/);
  assert.match(gallery, /#\{imgObj\.itemSeq\}/);
  assert.doesNotMatch(gallery, /#\{imgObj\.itemSeq\} \{imgObj\.itemName\}/);
});
