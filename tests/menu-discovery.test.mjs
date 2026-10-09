import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire, Module } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const file = path.resolve('src/components/all-apps-switcher.tsx');
const source = fs.readFileSync(file, 'utf8');
// Exercise the actual pure catalog and launch functions without mounting React.
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = new Set(['launcherCatalogProduct', 'appLaunchUrl']);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text));
assert.equal(functions.length, 2);
const module = new Module(file);
module._compile(ts.transpileModule(functions.map(node => node.getText(ast)).join('\n'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, file);
const { launcherCatalogProduct, appLaunchUrl } = module.exports;
const app = { key: 'relay', name: 'Relay', url: 'https://relay.axxes.club', status: 'live', workspaceLaunch: true };

test('cached private, Stock and identity entries never enter discovery', () => {
  for (const status of ['live', 'beta']) {
    for (const key of ['manifest', 'stock', 'webmaster', 'wm', 'handshake', 'account', 'MANIFEST', 'WebMaster']) {
      assert.equal(launcherCatalogProduct({ ...app, key, status }), null);
    }
    for (const url of ['https://wm.axxes.app', 'https://manifest.axxes.club', 'https://stock.axxes.app', 'https://handshake.axxes.club']) {
      assert.equal(launcherCatalogProduct({ ...app, key: 'legacy', url, status }), null);
    }
  }
  for (const url of ['http://relay.axxes.club', 'https://user:password@relay.axxes.club', 'not a URL']) {
    assert.equal(launcherCatalogProduct({ ...app, url }), null);
  }
  assert.equal(launcherCatalogProduct({ ...app, status: 'soon' }), null);
  assert.match(source, /setApps\(data\.products\.flatMap/);
  assert.match(source, /const entry = launcherCatalogProduct\(app\)/);
});

test('neutral Pay copy preserves service keys, workspace launch and direct operational access', () => {
  const legacy = Object.freeze({ ...app, key: 'tollbooth', name: 'AXXES Pay', url: 'https://tollbooth.axxes.club' });
  const entry = launcherCatalogProduct(legacy);
  assert.equal(entry.name, 'Payments');
  assert.equal(entry.key, legacy.key);
  assert.equal(entry.url, legacy.url);
  assert.equal(legacy.name, 'AXXES Pay');
  const copy = launcherCatalogProduct({ ...legacy, tagline: 'AXXES Pay checkout', description: 'AXXES Pay and AXXES Payments' });
  assert.equal(copy.tagline, 'Payments checkout');
  assert.equal(copy.description, 'Payments and AXXES Payments');
  assert.equal(launcherCatalogProduct({ ...legacy, name: 'AXXES Payments' }).name, 'AXXES Payments');
  const tenant = '12345678-1234-1234-1234-123456789012';
  assert.equal(appLaunchUrl(entry, tenant), `https://tollbooth.axxes.club/api/organization/open?tenant=${tenant}`);
  assert.equal(appLaunchUrl({ ...app, key: 'manifest', url: 'https://manifest.axxes.club' }), 'https://manifest.axxes.club/');
});
