// Photos of scene B. GeonicDB drops the notification of an entity change
// larger than about 230 KB (its event bus limit), so photos never go into the
// broker: they are kept in R2 under the request's id, the request entity
// carries their keys, and the bridge's call to Pointsman gets the photos
// themselves (inlinePhotos, the fetch the bridge uses). Deleted with the
// request; the bucket's lifecycle rule deletes anything left after a day.

import type { Env } from './env';

const KEY = /^photos\/[0-9a-f-]{36}\/[1-3]\.(jpg|png|webp)$/;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const TYPE: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const isPhotoKey = (k: unknown): k is string => typeof k === 'string' && KEY.test(k);

/** Stores checked data URLs (requests.ts parseConcern); returns their keys, in order. */
export async function storePhotos(bucket: R2Bucket, uuid: string, photos: string[]): Promise<string[]> {
  return Promise.all(photos.map(async (url, i) => {
    const [, type, b64] = /^data:([^;]+);base64,(.*)$/.exec(url)!;
    const key = `photos/${uuid}/${i + 1}.${EXT[type!]}`;
    await bucket.put(key, Uint8Array.from(atob(b64!), (c) => c.charCodeAt(0)), { httpMetadata: { contentType: type! } });
    return key;
  }));
}

/** Deletes the photos of a request (by the uuid in its id). */
export async function deletePhotos(bucket: R2Bucket, uuid: string): Promise<void> {
  const listed = await bucket.list({ prefix: `photos/${uuid}/` });
  if (listed.objects.length > 0) await bucket.delete(listed.objects.map((o) => o.key));
}

async function dataUrl(bucket: R2Bucket, key: string): Promise<string | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  const bytes = new Uint8Array(await obj.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${TYPE[key.split('.').pop()!]};base64,${btoa(bin)}`;
}

/**
 * The fetch the bridge uses: a decide request to Pointsman for `profile`
 * gets the photos in place of their keys (state.photos.value); everything
 * else is passed on unchanged. A photo that is gone is left out.
 */
export function inlinePhotos(fetcher: typeof fetch, env: Pick<Env, 'PHOTOS_BUCKET' | 'POINTSMAN_URL'>, profile: string): typeof fetch {
  const target = `${env.POINTSMAN_URL.replace(/\/+$/, '')}/v1/decide/${profile}`;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!env.PHOTOS_BUCKET || !url.startsWith(target) || typeof init?.body !== 'string') return fetcher(input, init);
    let body: { state?: { photos?: { value?: unknown } } };
    try {
      body = JSON.parse(init.body) as typeof body;
    } catch {
      return fetcher(input, init);
    }
    const keys = body.state?.photos?.value;
    if (!Array.isArray(keys) || keys.length === 0) return fetcher(input, init);
    const urls = (await Promise.all(keys.filter(isPhotoKey).map((k) => dataUrl(env.PHOTOS_BUCKET!, k)))).filter((u): u is string => u !== null);
    body.state!.photos!.value = urls;
    return fetcher(input, { ...init, body: JSON.stringify(body) });
  }) as typeof fetch;
}
