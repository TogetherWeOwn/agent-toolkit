import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, base, refused } from './helpers.mjs';

const variants = {
  'github.repo_read': [
    { mode: 'file', ref: 'main', path: 'README.md' },
    { mode: 'tree', ref: 'main' },
    { mode: 'ref', ref: 'heads/main' },
    { mode: 'compare', base: 'main', head: 'topic' },
  ],
  'github.rulesets_get': [{ page: 1, perPage: 10 }, { rulesetId: 1 }],
  'github.workflow_dispatch_allowlisted': [{ workflow: 'deploy-staging.yml', ref: 'main', inputs: {} }],
};

test('all nine tools have flat discovery schemas without weakening closed variants', async () => {
  const f = fixture();
  assert.equal(f.handlers.size, 9);
  for (const [name, { metadata }] of f.handlers) {
    const schema = metadata.parametersSchema;
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    assert.ok(schema.properties && Object.keys(schema.properties).length > 0, name);
    for (const key of ['oneOf', 'anyOf', 'allOf']) assert.equal(schema[key], undefined, `${name}: top-level ${key}`);
    for (const required of schema.required) assert.ok(Object.hasOwn(schema.properties, required));
    for (const args of variants[name] ?? []) {
      const input = { ...base, ...args };
      for (const required of schema.required) assert.ok(Object.hasOwn(input, required), `${name}: ${required}`);
      for (const key of Object.keys(input)) assert.ok(Object.hasOwn(schema.properties, key), `${name}: ${key}`);
    }
  }
  const invalid = [
    ['github.repo_read', {}],
    ['github.repo_read', { mode: 'file', ref: 'main' }],
    ['github.repo_read', { mode: 'file', path: 'README.md' }],
    ['github.repo_read', { mode: 'tree', ref: 'main', path: 'README.md' }],
    ['github.repo_read', { mode: 'compare', base: 'main' }],
    ['github.repo_read', { mode: 'compare', base: 'main', head: 'topic', ref: 'main' }],
    ['github.repo_read', { mode: 'unknown', ref: 'main' }],
    ['github.repo_read', { mode: 'ref', ref: 'main' }],
    ['github.rulesets_get', {}],
    ['github.rulesets_get', { page: 1 }],
    ['github.rulesets_get', { rulesetId: 1, page: 1, perPage: 10 }],
    ['github.rulesets_get', { rulesetId: 0 }],
    ['github.workflow_dispatch_allowlisted', {}],
    ['github.workflow_dispatch_allowlisted', { workflow: 'deploy.yml', ref: 'main', inputs: {} }],
    ['github.workflow_dispatch_allowlisted', { workflow: 'deploy-staging.yml', ref: 'topic', inputs: {} }],
  ];
  for (const [name, args] of invalid) {
    const g = fixture();
    refused(g, await g.call(name, { ...base, ...args }), 'validation.schema');
  }
  for (const [name, argsList] of Object.entries(variants)) {
    for (const args of argsList) {
      const g = fixture();
      refused(g, await g.call(name, { ...base, ...args, url: 'https://example.invalid' }), 'validation.schema');
    }
  }
});
