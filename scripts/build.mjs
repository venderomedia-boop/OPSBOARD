import fs from 'node:fs';
import path from 'node:path';

const src = path.resolve('src');
const dist = path.resolve('dist');
if (!fs.existsSync(src)) throw new Error(`Missing source directory: ${src}`);
fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(src, dist, { recursive: true });
if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Build completed without dist/index.html');
console.log('OPSBOARD source build completed.');
