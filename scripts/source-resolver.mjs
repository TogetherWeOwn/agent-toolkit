import { registerHooks } from 'node:module';

const root = new URL('../', import.meta.url);

// Test-only aliases for the existing root and plugin tsc output layouts.
// Never redirect dependencies or a separate candidate checkout to this source.
export function sourceURL(url, parentURL) {
  if (!url.startsWith(root.href)) return url;
  const target = new URL(url);
  let path = target.href.slice(root.href.length).split(/[?#]/, 1)[0];
  const emitted = path.match(/^(?:plugins\/[^/]+\/)?dist\/((?:packages|plugins)\/[^/]+\/src\/.+)\.js$/);
  if (emitted) path = `${emitted[1]}.ts`;
  else if (parentURL && new URL(parentURL).pathname.endsWith('.ts') && /^(packages|plugins)\/[^/]+\/src\/.+\.js$/.test(path)) {
    path = path.replace(/\.js$/, '.ts');
  } else return url;
  const source = new URL(path, root);
  source.search = target.search;
  source.hash = target.hash;
  return source.href;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') || specifier.startsWith('file:')) {
      const url = new URL(specifier, context.parentURL).href;
      return nextResolve(sourceURL(url, context.parentURL), context);
    }
    return nextResolve(specifier, context);
  },
});
