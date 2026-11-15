import type { APIRequestContext, Route } from '@playwright/test';

const contexts = new WeakMap<APIRequestContext, APIRequestContext>();
const requestMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch']);

function closedHeaders(...sources: (Record<string, string> | undefined)[]) {
  const headers: Record<string, string> = {};
  for (const source of sources) {
    for (const [name, value] of Object.entries(source ?? {})) headers[name.toLowerCase()] = value;
  }
  return { ...headers, connection: 'close' };
}

/** Test-owned Node API transport only; retain the original context's cookie jar. */
export function closeApi(api: APIRequestContext): APIRequestContext {
  const cached = contexts.get(api);
  if (cached) return cached;
  const wrapped = new Proxy(api, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      if (!requestMethods.has(String(property))) return value.bind(target);
      return async (input: Parameters<APIRequestContext['fetch']>[0], options: Parameters<APIRequestContext['fetch']>[1] = {}) => {
        const originalHeaders = typeof input === 'string' ? undefined : await input.allHeaders();
        return value.call(target, input, {
          ...options, headers: closedHeaders(originalHeaders, options.headers), maxRetries: 0,
        });
      };
    },
  });
  contexts.set(api, wrapped);
  contexts.set(wrapped, wrapped);
  return wrapped;
}

/** route.fetch uses Node API transport too; browser continue/fetch stays untouched. */
export async function closeRouteFetch(route: Route, options: Parameters<Route['fetch']>[0] = {}) {
  return route.fetch({
    ...options,
    headers: closedHeaders(await route.request().allHeaders(), options.headers),
    maxRetries: 0,
  });
}
