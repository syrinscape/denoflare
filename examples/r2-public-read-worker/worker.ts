import { IncomingRequestCf, R2Object, R2ObjectBody, R2Range, R2GetOptions, R2Conditional, R2ListOptions } from './deps.ts';
import { computeDirectoryListingHtml } from './listing.ts';
import { WorkerEnv } from './worker_env.d.ts';

export default {

    async fetch(request: IncomingRequestCf, env: WorkerEnv): Promise<Response> {
        try {
            return await computeResponse(request, env);
        } catch (e) {
            if (typeof e === 'object' && e.message === 'The requested range is not satisfiable') {
                return new Response(e.message, { status: 416 });
            }
            return new Response(`${e.stack || e}`, { status: 500 });
        }
    }

};

//

declare global {

    interface ResponseInit {
        // non-standard cloudflare property, defaults to 'auto'
        encodeBody?: 'auto' | 'manual';
    }

}

//

const TEXT_PLAIN_UTF8 = 'text/plain; charset=utf-8';
const TEXT_HTML_UTF8 = 'text/html; charset=utf-8';

const INTERNAL_KEYS = new Set();
const INTERNAL_KEYS_PAGES = new Set([ '_headers' ]); // special handling for _headers, we'll process this later

async function computeResponse(request: IncomingRequestCf, env: WorkerEnv): Promise<Response> {
    const { bucket, pushId } = env;
    const flags = new Set((env.flags || '').split(',').map(v => v.trim()));
    const disallowRobots = flags.has('disallowRobots');
    const emulatePages = flags.has('emulatePages');
    const listDirectories = flags.has('listDirectories');

    const { method, url, headers } = request;
    console.log(`${method} ${url}`);
    if (pushId) console.log(`pushId: ${pushId}`);

    if (method !== 'GET' && method !== 'HEAD') {
        return new Response(`Method '${method}' not allowed`, { status: 405 });
    }

    const { pathname } = new URL(request.url);
    let key = pathname.substring(1); // strip leading slash

    // special handling for robots.txt, if configured
    if (disallowRobots && key === 'robots.txt') {
        return new Response(method === 'GET' ? 'User-agent: *\nDisallow: /' : undefined, { headers: { 'content-type': TEXT_PLAIN_UTF8 }});
    }

    let obj: R2Object | null = null;
    const getOrHead: (key: string, options?: R2GetOptions) => Promise<R2Object | null> = (key, options) => {
        console.log(`${method} ${key} ${JSON.stringify(options)}`);
        return method === 'GET' ? (options ? bucket.get(key, options) : bucket.get(key)) : bucket.head(key);
    };

    // hide keys considered "internal", like _headers if in pages mode
    const internalKeys = emulatePages ? INTERNAL_KEYS_PAGES : INTERNAL_KEYS;
    if (!internalKeys.has(key)) {
        // parse any conditional request options from the request headers
        let range = method === 'GET' ? tryParseRange(headers) : undefined;
        const onlyIf = method === 'GET' ? tryParseR2Conditional(headers) : undefined;

        // first, try to request the object at the given key
        obj = key === '' ? null : await getOrHead(key, { range, onlyIf });
        if (!obj && emulatePages) {
            if (key === '' || key.endsWith('/')) { // object not found, append index.html and try again (like pages)
                key += 'index.html';
                obj = await getOrHead(key, { range, onlyIf });
            } else { // object not found, redirect non-trailing slash to trailing slash (like pages) if index.html exists
                key += '/index.html';
                obj = await bucket.head(key);
                if (obj) {
                    return permanentRedirect({ location: pathname + '/' });
                }
            }
        }
        if (obj) {
            // choose not to satisfy range requests for encoded content
            // unfortunately we don't know it's encoded until after the first request
            if (range && computeHeaders(obj, range).has('content-encoding')) {
                console.log(`re-request without range`);
                range = undefined;
                obj = await bucket.get(key);
                if (obj === null) throw new Error(`Object ${key} existed for .get with range, but not without`);
            }
            return computeObjResponse(obj, range ? 206 : 200, range, onlyIf);
        }
    }

    // R2 object not found, try listing a directory, if configured
    if (listDirectories) {
        let prefix = pathname.substring(1);
        let redirect = false;
        if (prefix !== '' && !prefix.endsWith('/')) {
            prefix += '/';
            redirect = true;
        }
        const options: R2ListOptions = { delimiter: '/', limit: 1000, prefix };  // r2 bugs: max limit due to the delimitedPrefixes and truncated bugs
        console.log(`list: ${JSON.stringify(options)}`);
        const objects = await bucket.list(options);
        if (objects.delimitedPrefixes.length > 0 || objects.objects.length > 0) {
            console.log({ numPrefixes: objects.delimitedPrefixes.length, numObjects: objects.objects.length, truncated: objects.truncated });
            return redirect ? temporaryRedirect({ location: '/' + prefix }) : new Response(computeDirectoryListingHtml(objects, prefix), { headers: { 'content-type': TEXT_HTML_UTF8 } });
        }
    }

    // R2 response still not found, respond with 404
    if (emulatePages) {
        obj = await getOrHead('404.html');
        if (obj) {
            return computeObjResponse(obj, 404);
        }
    }
    return new Response(method === 'GET' ? 'not found' : undefined, { status: 404, headers: { 'content-type': TEXT_PLAIN_UTF8 } });
}

function unmodified(): Response {
    return new Response(undefined, { status: 304 });
}

function preconditionFailed(): Response {
    return new Response('precondition failed', { status: 412 });
}

function permanentRedirect(opts: { location: string }): Response {
    const { location } = opts;
    return new Response(undefined, { status: 308, headers: { 'location': location } });
}

function temporaryRedirect(opts: { location: string }): Response {
    const { location } = opts;
    return new Response(undefined, { status: 307, headers: { 'location': location } });
}

function isR2ObjectBody(obj: R2Object): obj is R2ObjectBody {
    return 'body' in obj;
}

function computeObjResponse(obj: R2Object, status: number, range?: R2Range, onlyIf?: R2Conditional): Response {
    let body: ReadableStream | undefined;
    if (isR2ObjectBody(obj)) {
        body = obj.body;
    } else if (onlyIf) {
        if (onlyIf.etagDoesNotMatch) return unmodified();
        if (onlyIf.uploadedAfter) return unmodified();
        if (onlyIf.etagMatches) return preconditionFailed();
        if (onlyIf.uploadedBefore) return preconditionFailed();
    }
    
    const headers = computeHeaders(obj, range);

    // non-standard cloudflare ResponseInit property indicating the response is already encoded
    // required to prevent the cf frontend from double-encoding it, or serving it encoded without a content-encoding header
    const encodeBody = headers.has('content-encoding') ? 'manual' : undefined;

    return new Response(body, { status, headers, encodeBody });
}

function computeHeaders(obj: R2Object, range?: R2Range): Headers {
    const headers = new Headers();

    // obj.size represents the full size, but seems to be clamped by the cf frontend down to the actual number of bytes in the partial response
    // exactly what we want
    headers.set('content-length', String(obj.size));

    headers.set('etag', obj.httpEtag); // the version with double quotes, e.g. "96f20d7dc0d24de9c154d822967dcae1"
    headers.set('last-modified', obj.uploaded.toUTCString()); // toUTCString is the http date format (rfc 1123)

    if (range) headers.set('content-range', `bytes ${range.offset}-${Math.min(range.offset + range.length - 1, obj.size)}/${obj.size}`);

    // obj.writeHttpMetadata(headers); // r2 bug: currently returns content-encoding and cache-control in content-disposition!
    // for now, don't trust any header except content-type
    // and try to move content-dispositions that look like known content-encoding or cache-control values
    const { contentType, contentLanguage, contentDisposition, contentEncoding, cacheControl, cacheExpiry } = obj.httpMetadata;
    if (contentType) headers.set('content-type', contentType);
    if (contentLanguage) headers.set('x-r2-content-language', contentLanguage);
    if (contentDisposition) {
        headers.set('x-r2-content-disposition', contentDisposition);
        if (contentDisposition === 'gzip') {
            headers.set('content-encoding', contentDisposition);
        }
        // max-age=31536000, no-transform, public
        if (/(private|public|maxage|max-age|no-transform|immutable)/.test(contentDisposition)) {
            headers.set('cache-control', contentDisposition);
        }
    }
    if (contentEncoding) headers.set('x-r2-content-encoding', contentEncoding);
    if (cacheControl) headers.set('x-r2-cache-control', cacheControl);
    if (cacheExpiry) headers.set('x-r2-cache-expiry', cacheExpiry.toISOString());
    return headers;
}

function tryParseRange(headers: Headers): R2Range | undefined {
    // cf bucket api only supports byte ranges with bounded start and end
    const m = /^bytes=(\d+)-(\d+)$/.exec(headers.get('range') || '');
    if (!m) return undefined;
    const offset = parseInt(m[1]);
    const length = parseInt(m[2]) - offset + 1;
    if (length < 1) return undefined;
    return { offset, length };
}

function tryParseR2Conditional(headers: Headers): R2Conditional | undefined {
    // r2 bug: onlyIf takes Headers, but processes them incorrectly (such as not allowing double quotes on etags)
    // so we need to do them by hand for now

    const ifNoneMatch = headers.get('if-none-match') || undefined;
    const etagDoesNotMatch = ifNoneMatch ? stripEtagQuoting(ifNoneMatch) : undefined;

    const ifMatch = headers.get('if-match') || undefined;
    const etagMatches = ifMatch ? stripEtagQuoting(ifMatch) : undefined;

    const ifModifiedSince = headers.get('if-modified-since') || undefined;
    // if-modified-since date format (rfc 1123) is at second resolution, uploaded is at millis resolution
    // workaround for now is to add a second to the provided value
    const uploadedAfter = ifModifiedSince ? addingOneSecond(new Date(ifModifiedSince)) : undefined; 

    const ifUnmodifiedSince = headers.get('if-unmodified-since') || undefined;
    const uploadedBefore = ifUnmodifiedSince ? new Date(ifUnmodifiedSince) : undefined;

    return etagDoesNotMatch || etagMatches || uploadedAfter || uploadedBefore ? { etagDoesNotMatch, etagMatches, uploadedAfter, uploadedBefore } : undefined;
}

function stripEtagQuoting(str: string): string {
    const m = /^(W\/)?"(.*)"$/.exec(str);
    return m ? m[2] : str;
}

function addingOneSecond(time: Date): Date {
    return new Date(time.getTime() + 1000);
}
