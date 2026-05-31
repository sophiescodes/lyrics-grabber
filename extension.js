// Entry point: a panel button whose popup shows the lyrics for the song that
// is currently playing (detected via MPRIS, fetched from Google).

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {getCurrentSong} from './mpris.js';
import {createSession, fetchLyrics} from './lyrics.js';

const LyricsIndicator = GObject.registerClass(
class LyricsIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'Lyrics Grabber');
        this._session = createSession();

        this.add_child(new St.Icon({
            gicon: Gio.icon_new_for_string(
                `${extension.path}/icons/music-note-symbolic.svg`),
            style_class: 'system-status-icon',
        }));

        this._buildMenu();

        // Reload the lyrics each time the popup is opened.
        this.menu.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen)
                this._refresh().catch(e => logError(e, 'Lyrics Grabber'));
        });
    }

    _buildMenu() {
        // Header: shows the detected "Title — Artist".
        this._headerItem = new PopupMenu.PopupMenuItem('Lyrics', {
            reactive: false,
            style_class: 'lyrics-grabber-header',
        });
        this.menu.addMenuItem(this._headerItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Body: scrollable, word-wrapped lyrics.
        this._lyricsLabel = new St.Label({
            style_class: 'lyrics-grabber-body',
            text: 'Click to load lyrics for the current song.',
        });
        this._lyricsLabel.clutter_text.line_wrap = true;

        const box = new St.BoxLayout({vertical: true});
        box.add_child(this._lyricsLabel);

        const scroll = new St.ScrollView({
            style_class: 'lyrics-grabber-scroll',
            overlay_scrollbars: true,
        });
        scroll.add_child(box);

        const scrollItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
        });
        scrollItem.add_child(scroll);
        this.menu.addMenuItem(scrollItem);
    }

    _setStatus(header, body) {
        this._headerItem.label.text = header;
        this._lyricsLabel.text = body;
    }

    async _refresh() {
        let song;
        try {
            song = await getCurrentSong();
        } catch (e) {
            this._setStatus('Lyrics', `Could not read player: ${e.message}`);
            return;
        }

        if (!song) {
            this._setStatus('Lyrics', 'No song is currently playing.');
            return;
        }

        const label = song.artist ? `${song.title} — ${song.artist}` : song.title;
        this._setStatus(label, 'Searching Google for lyrics…');

        try {
            const lyrics = await fetchLyrics(this._session, song);
            this._lyricsLabel.text = lyrics ??
                'No lyrics found on the Google results page for this song.';
        } catch (e) {
            this._lyricsLabel.text = `Failed to fetch lyrics: ${e.message}`;
        }
    }

    destroy() {
        this._session?.abort();
        this._session = null;
        super.destroy();
    }
});

export default class LyricsGrabberExtension extends Extension {
    enable() {
        this._indicator = new LyricsIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
