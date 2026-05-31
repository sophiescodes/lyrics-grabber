// Lyrics fetching: query Google for "<song> <artist> lyrics google" and
// extract the lyrics block from the results page.
//
// The word "google" is appended to the query on purpose: it nudges Google
// into rendering its own inline lyrics widget on the results page, which is
// what we scrape below.

import GLib from 'gi://GLib';
import Soup from 'gi://Soup';

// A normal desktop user agent, plus a consent cookie so we land directly on
// the results page instead of Google's consent interstitial.
const USER_AGENT =
    'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';
const CONSENT_COOKIE =
    'CONSENT=YES+cb; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVuIAEaBgiA_LyaBg';

const REQUEST_TIMEOUT_SECONDS = 15;

// --- HTML -> text -----------------------------------------------------------

function decodeEntities(text) {
    return text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/** Converts HTML into newline-separated plain text, preserving line breaks. */
function htmlToText(html) {
    const stripped = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(div|p|li|tr|h\d|span)>/gi, '\n')
        .replace(/<[^>]+>/g, '');

    return decodeEntities(stripped)
        .split('\n')
        .map(line => line.replace(/[ \t ]+/g, ' ').trim())
        .join('\n');
}

// --- Lyrics extraction ------------------------------------------------------

/**
 * Extracts the lyrics from a Google results page. Google renders the lyrics
 * widget as a block of lines preceded by a "Lyrics" header and followed by a
 * "Source" credit, so we slice the plain text between those two markers. This
 * is resilient to Google's frequently-changing CSS class names.
 *
 * Returns the lyrics string, or null when no lyrics block is present.
 */
export function extractLyrics(html) {
    const lines = htmlToText(html).split('\n');

    // The "Source: …" credit line; search from the end to skip earlier noise.
    let sourceIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (/^Source\b/i.test(lines[i].trim())) {
            sourceIdx = i;
            break;
        }
    }
    if (sourceIdx === -1)
        return null;

    // The "Lyrics" header most closely preceding the Source line.
    let lyricsIdx = -1;
    for (let i = sourceIdx - 1; i >= 0; i--) {
        if (/^Lyrics$/i.test(lines[i].trim())) {
            lyricsIdx = i;
            break;
        }
    }
    if (lyricsIdx === -1)
        return null;

    const body = lines.slice(lyricsIdx + 1, sourceIdx);
    // Trim blank lines at the edges, but keep interior blanks (stanza breaks).
    while (body.length && body[0].trim() === '')
        body.shift();
    while (body.length && body[body.length - 1].trim() === '')
        body.pop();

    const lyrics = body.join('\n').trim();
    return lyrics.length ? lyrics : null;
}

// --- Networking -------------------------------------------------------------

/** Creates a Soup.Session configured for our Google requests. */
export function createSession() {
    const session = new Soup.Session();
    session.set_property('timeout', REQUEST_TIMEOUT_SECONDS);
    return session;
}

function fetchUrl(session, url) {
    return new Promise((resolve, reject) => {
        const message = Soup.Message.new('GET', url);
        const headers = message.get_request_headers();
        headers.append('User-Agent', USER_AGENT);
        headers.append('Accept-Language', 'en-US,en;q=0.9');
        headers.append('Cookie', CONSENT_COOKIE);

        session.send_and_read_async(
            message, GLib.PRIORITY_DEFAULT, null, (sess, res) => {
                try {
                    const bytes = sess.send_and_read_finish(res);
                    if (message.get_status() !== Soup.Status.OK) {
                        reject(new Error(`HTTP ${message.get_status()}`));
                        return;
                    }
                    resolve(new TextDecoder('utf-8').decode(bytes.get_data()));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

/**
 * Searches Google for the song's lyrics and returns them as a string, or
 * null when none were found. Throws on network errors.
 */
export async function fetchLyrics(session, song) {
    const query = `${song.title} ${song.artist} lyrics google`.trim();
    const url = `https://www.google.com/search?hl=en&q=${encodeURIComponent(query)}`;
    return extractLyrics(await fetchUrl(session, url));
}
