import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Build from an allowlisted source tree. Dependency tracing must never see local
// databases, credentials, browser profiles or migration reports, even on Windows.
const workspace = path.resolve('.');
const target = path.join(workspace, '.superdesign', 'production-source');
assert.equal(fs.realpathSync(workspace), workspace);
fs.mkdirSync(target, {recursive: true});
assert.equal(fs.realpathSync(target), target);
assert.equal(fs.readdirSync(target).length, 0, 'Use an empty production-source directory');
let count = 0;
function copy(relative) {
  const source = path.join(workspace, relative);
  const stat = fs.lstatSync(source);
  assert.ok(!stat.isSymbolicLink(), 'Deployment sources must not be symlinks');
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(source)) copy(path.join(relative, name));
    return;
  }
  assert.ok(stat.isFile());
  assert.ok(!/(?:^|[\\/])(?:\.env[^\\/]*|\.local-data|integration\.key|.*\.sqlite[^\\/]*|browser-profiles)(?:[\\/]|$)/i.test(relative));
  const destination = path.join(target, relative);
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.copyFileSync(source, destination);
  count++;
}
for (const file of ['package.json', 'package-lock.json', 'vercel.json', '.vercelignore', 'server.mjs', 'api', 'portal', 'dist', 'scripts/build-production.mjs', 'scripts/runtime.mjs']) copy(file);
// Project linkage contains IDs/settings; environment files are deliberately absent.
const link = JSON.parse(fs.readFileSync('.vercel/project.json', 'utf8'));
assert.equal(link.projectId, 'prj_QyDqJY6KRJ9WNfP9PZl0QsSFGv2h');
assert.equal(link.orgId, 'team_TZ6kt7hfXGYZ706TPP3oCT2Y');
fs.mkdirSync(path.join(target, '.vercel'));
fs.writeFileSync(path.join(target, '.vercel/project.json'), JSON.stringify(link));
console.log(JSON.stringify({state: 'production_sources_staged',files: count, directory: target}));
