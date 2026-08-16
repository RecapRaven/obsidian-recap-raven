import { access, readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const versions = JSON.parse(await readFile('versions.json', 'utf8'));

if (packageJson.version !== manifest.version) {
  throw new Error('package.json and manifest.json versions must match.');
}
if (versions[manifest.version] !== manifest.minAppVersion) {
  throw new Error('versions.json must map the release to manifest.minAppVersion.');
}
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  throw new Error('Release versions must use numeric semantic versioning without a v prefix.');
}

await Promise.all([
  access('main.js'),
  access('manifest.json'),
  access('styles.css'),
  access(`.github/release-notes/${manifest.version}.md`),
]);
