import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

const archivePath = path.resolve('ops-hub-mvp.zip');
const targetDir = path.resolve('ops-hub-mvp');

if (!fs.existsSync(archivePath)) {
  throw new Error(`Missing archive: ${archivePath}`);
}

if (fs.existsSync(targetDir)) {
  fs.rmSync(targetDir, { recursive: true, force: true });
}

const zip = new AdmZip(archivePath);
zip.extractAllTo(process.cwd(), true);

const entryPoint = path.join(targetDir, 'standalone-demo.html');
if (!fs.existsSync(entryPoint)) {
  throw new Error('Archive extracted, but standalone-demo.html was not found.');
}

console.log('OPSBOARD MVP unpacked successfully.');
