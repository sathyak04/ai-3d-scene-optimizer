// Downloads CC0 glTF demo scenes from the Khronos sample assets repo.
// Run via: npm run download-scenes
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'scenes');

const SCENES = [
  {
    name: 'DamagedHelmet.glb',
    label: 'high-detail PBR asset',
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb',
  },
  {
    name: 'Soldier.glb',
    label: 'rigged character (heavier)',
    url: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Soldier.glb',
  },
  {
    name: 'Lantern.glb',
    label: 'multi-material lantern',
    url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Lantern/glTF-Binary/Lantern.glb',
  },
];

function download(url, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft <= 0) return reject(new Error(`Too many redirects: ${url}`));
        res.resume();
        return resolve(download(res.headers.location, dest, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', (err) => {
        fs.rmSync(dest, { force: true });
        reject(err);
      });
    });
    req.on('error', reject);
  });
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Downloading demo scenes to ${OUT_DIR}\n`);

  for (const scene of SCENES) {
    const dest = path.join(OUT_DIR, scene.name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`  ✓ ${scene.name} (cached, ${fmtBytes(fs.statSync(dest).size)})`);
      continue;
    }
    process.stdout.write(`  → ${scene.name} (${scene.label})... `);
    try {
      await download(scene.url, dest);
      console.log(`done (${fmtBytes(fs.statSync(dest).size)})`);
    } catch (err) {
      console.log(`FAILED`);
      console.error(`     ${err.message}`);
      process.exitCode = 1;
    }
  }
  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
