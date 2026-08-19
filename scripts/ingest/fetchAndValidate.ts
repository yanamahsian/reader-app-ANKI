// Ingestion's own fetch+validate step -- a plain Node HTTPS request,
// deliberately NOT src/features/reader/engine/bookTransport.ts's
// fetchBookFile(). Two real reasons to keep this separate rather than
// import that one:
//
//  1. bookTransport.ts's resolveDeliveryUrl() applies Gutenberg-
//     specific proxy rewriting for the BROWSER runtime. Ingestion
//     talks to providers directly, over a plain server-to-server
//     request -- there is no browser making this request, so there is
//     no CORS to route around in the first place, and no reason to
//     ever go through omnia-book-proxy here.
//  2. Keeping ingestion's own validation self-contained means a
//     future change to the browser runtime's delivery logic can never
//     silently change ingestion's behavior, and vice versa -- this
//     Stage's own instruction is explicit that ingestion must not go
//     through "bookTransport runtime routing".
//
// The validation criteria are deliberately the same ones
// fetchBookFile() already established (response.ok, real status,
// final URL after redirects, content-type, non-empty bytes, not an
// HTML error page, real ZIP signature for EPUB) -- same principles,
// independent implementation, because this runs in Node against a
// real provider host, not in a browser against a resolved delivery
// URL.

import { hasZipSignature } from "./zip";

export interface FetchAndValidateResult {
  bytes: Buffer;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  redirected: boolean;
}

export async function fetchAndValidate(
  url: string,
  expectedFormat: "epub" | "plaintext"
): Promise<FetchAndValidateResult> {

  let response: Response;

  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(`ingestion fetch failed for ${url}: ${(error as Error).message}`);
  }

  const finalUrl = response.url || url;
  const contentType = response.headers.get("content-type");

  if (!response.ok) {
    throw new Error(
      `ingestion fetch got HTTP ${response.status} for ${url} ` +
      `(final URL after redirects: ${finalUrl}, redirected=${response.redirected}, content-type: ${contentType ?? "n/a"})`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);

  if (bytes.length === 0) {
    throw new Error(
      `ingestion fetch got an empty body for ${url} (final URL: ${finalUrl}, HTTP ${response.status}, content-type: ${contentType ?? "n/a"})`
    );
  }

  const headSample = bytes.subarray(0, Math.min(bytes.length, 512)).toString("utf-8").trim().toLowerCase();

  if (headSample.startsWith("<!doctype html") || headSample.startsWith("<html")) {
    throw new Error(
      `ingestion fetch for ${url} (final URL: ${finalUrl}, HTTP ${response.status}, content-type: ${contentType ?? "n/a"}) ` +
      `returned an HTML page, not the expected ${expectedFormat} file -- likely an error/redirect/login page served with a 2xx status`
    );
  }

  if (expectedFormat === "epub" && !hasZipSignature(bytes)) {
    throw new Error(
      `ingestion fetch for ${url} (final URL: ${finalUrl}, HTTP ${response.status}, content-type: ${contentType ?? "n/a"}, ` +
      `${bytes.length} bytes) does not have a ZIP/EPUB signature -- refusing to treat it as a valid EPUB`
    );
  }

  return {
    bytes,
    requestedUrl: url,
    finalUrl,
    status: response.status,
    contentType,
    redirected: response.redirected
  };

}
