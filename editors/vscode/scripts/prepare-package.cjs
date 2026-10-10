const fs = require('node:fs');
const path = require('node:path');

const extension = path.resolve(__dirname, '..');
const root = path.resolve(extension, '../..');

for (const filename of ['LICENSE', 'NOTICE']) {
  fs.copyFileSync(path.join(root, filename), path.join(extension, filename));
}
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
