// MPRIS helpers: discover media players on the session bus and read the
// currently playing track's title and artist.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const MPRIS_BUS_PREFIX = 'org.mpris.MediaPlayer2.';
const MPRIS_OBJECT_PATH = '/org/mpris/MediaPlayer2';
const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';

/** Promise wrapper around an async D-Bus method call on the session bus. */
function dbusCall(busName, objectPath, iface, method, params) {
    return new Promise((resolve, reject) => {
        Gio.DBus.session.call(
            busName, objectPath, iface, method, params, null,
            Gio.DBusCallFlags.NONE, -1, null,
            (conn, res) => {
                try {
                    resolve(conn.call_finish(res));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

/** Returns the list of bus names that expose an MPRIS player. */
async function listPlayers() {
    const reply = await dbusCall(
        'org.freedesktop.DBus', '/org/freedesktop/DBus',
        'org.freedesktop.DBus', 'ListNames', null);
    const [names] = reply.deepUnpack();
    return names.filter(n => n.startsWith(MPRIS_BUS_PREFIX));
}

/**
 * Reads a single org.mpris.MediaPlayer2.Player property from a player.
 *
 * Properties.Get returns type "(v)" — a tuple wrapping a boxed variant. We use
 * recursiveUnpack() (not deepUnpack()) so the inner variant is fully unwrapped
 * into native JS values; deepUnpack() would leave it as a GVariant.
 */
async function getProperty(busName, prop) {
    const reply = await dbusCall(
        busName, MPRIS_OBJECT_PATH, PROPS_IFACE, 'Get',
        new GLib.Variant('(ss)', [PLAYER_IFACE, prop]));
    const [value] = reply.recursiveUnpack();
    return value;
}

/** Converts a raw MPRIS Metadata dict into {title, artist} (or null). */
function metadataToSong(metadata) {
    if (!metadata)
        return null;

    const title = metadata['xesam:title'];
    if (!title)
        return null;

    const artistVal = metadata['xesam:artist'];
    let artist = '';
    if (Array.isArray(artistVal))
        artist = artistVal.join(', ');
    else if (typeof artistVal === 'string')
        artist = artistVal;

    return {title: title.toString(), artist: artist.toString()};
}

/**
 * Returns {title, artist} for the active player. Prefers a player whose
 * PlaybackStatus is "Playing"; otherwise falls back to the first player that
 * exposes usable metadata. Returns null when nothing is available.
 */
export async function getCurrentSong() {
    const players = await listPlayers();
    if (players.length === 0)
        return null;

    let fallback = null;
    for (const busName of players) {
        let song = null;
        try {
            song = metadataToSong(await getProperty(busName, 'Metadata'));
        } catch {
            continue;
        }
        if (!song)
            continue;

        let status = '';
        try {
            status = `${await getProperty(busName, 'PlaybackStatus')}`;
        } catch {
            // Player doesn't expose a status; treat it as a fallback candidate.
        }

        if (status === 'Playing')
            return song;
        if (!fallback)
            fallback = song;
    }
    return fallback;
}
