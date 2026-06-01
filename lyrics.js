// Lyrics fetching.
// The code now uses lrclib.net — a free, key-less lyrics API
// purpose-built for MPRIS-style players — which returns clean plain text.

import GLib from "gi://GLib";
import Soup from "gi://Soup";

const API_BASE = "https://lrclib.net/api";
const USER_AGENT =
  "Lyrics Grabber (GNOME Shell extension; https://github.com/sophiescodes/lyrics-grabber)";
const REQUEST_TIMEOUT_SECONDS = 15;

// --- Title/artist cleanup ---------------------------------------------------

// Player titles often carry suffixes that hurt matching, e.g.
// "Take My Hand - Joshua Tree Version" or "Song (Remastered 2011)". We strip
// those for a secondary lookup if the verbatim one misses.
function simplifyTitle(title) {
  return title
    .replace(
      /\s*[-–—]\s*[^-–—]*\b(version|remaster(ed)?|remix|live|edit|mix|mono|stereo|deluxe|acoustic)\b.*$/i,
      "",
    )
    .replace(
      /\s*\([^)]*\b(version|remaster(ed)?|remix|live|edit|mix|mono|stereo|deluxe|acoustic|feat\.?|ft\.?)\b[^)]*\)\s*/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

// --- Networking -------------------------------------------------------------

/** Creates a Soup.Session configured for our API requests. */
export function createSession() {
  const session = new Soup.Session();
  session.set_property("timeout", REQUEST_TIMEOUT_SECONDS);
  return session;
}

// Fetches a URL and returns {status, text}. Resolves for any HTTP status so
// callers can treat e.g. 404 (no lyrics) as "not found" rather than an error.
function fetchUrl(session, url) {
  return new Promise((resolve, reject) => {
    const message = Soup.Message.new("GET", url);
    message.get_request_headers().append("User-Agent", USER_AGENT);

    session.send_and_read_async(
      message,
      GLib.PRIORITY_DEFAULT,
      null,
      (sess, res) => {
        try {
          const bytes = sess.send_and_read_finish(res);
          const text = new TextDecoder("utf-8").decode(bytes.get_data());
          resolve({ status: message.get_status(), text });
        } catch (e) {
          reject(e);
        }
      },
    );
  });
}

async function fetchJson(session, url) {
  const { status, text } = await fetchUrl(session, url);
  if (status === Soup.Status.NOT_FOUND) return null;
  if (status !== Soup.Status.OK) throw new Error(`HTTP ${status}`);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// --- Lookups ----------------------------------------------------------------

function q(value) {
  return encodeURIComponent(value);
}

// Exact lookup by track + artist name.
async function lookupExact(session, title, artist) {
  const url = `${API_BASE}/get?track_name=${q(title)}&artist_name=${q(artist)}`;
  const record = await fetchJson(session, url);
  return record?.plainLyrics?.trim() || null;
}

// Fuzzy search; returns the first result that has plain lyrics.
async function lookupSearch(session, query) {
  const results = await fetchJson(session, `${API_BASE}/search?q=${q(query)}`);
  if (!Array.isArray(results)) return null;
  const hit = results.find((r) => r?.plainLyrics?.trim());
  return hit ? hit.plainLyrics.trim() : null;
}

/**
 * Looks up the lyrics for a song and returns them as plain text, or null when
 * none were found. Throws only on network/HTTP errors.
 */
export async function fetchLyrics(session, song) {
  const { title, artist } = song;
  const simple = simplifyTitle(title);

  // 1) Exact match on the verbatim title.
  let lyrics = await lookupExact(session, title, artist);

  // 2) Exact match on the simplified title (drops "- Live", "(Remaster)"…).
  if (!lyrics && simple && simple !== title)
    lyrics = await lookupExact(session, simple, artist);

  // 3) Fuzzy search as a last resort.
  if (!lyrics)
    lyrics = await lookupSearch(session, `${simple || title} ${artist}`.trim());

  return lyrics;
}
