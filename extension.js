// Entry point: a panel button whose popup shows the lyrics for the song that
// is currently playing (detected via MPRIS, lyrics fetched from lrclib).

import GObject from "gi://GObject";
import GLib from "gi://GLib";
import St from "gi://St";
import Pango from "gi://Pango";
import Gio from "gi://Gio";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";

import { getCurrentSong, watchPlayers } from "./mpris.js";
import { createSession, fetchLyrics } from "./lyrics.js";

const LyricsIndicator = GObject.registerClass(
  class LyricsIndicator extends PanelMenu.Button {
    _init(extension) {
      super._init(0.5, "Lyrics Grabber");
      this._session = createSession();

      // cache already searched lyrics
      this._cacheKey = null;
      this._cacheText = null;

      this.add_child(
        new St.Icon({
          gicon: Gio.icon_new_for_string(
            `${extension.path}/icons/music-note-symbolic.svg`,
          ),
          style_class: "system-status-icon",
        }),
      );

      this._buildMenu();

      // load the lyrics if cached lyrics does not exist
      this.menu.connectObject(
        "open-state-changed",
        (_menu, isOpen) => {
          if (isOpen && this._cacheText === null)
            this._refresh().catch((e) => logError(e, "Lyrics Grabber"));
        },
        this,
      );

      // Fetch lyrics in the background whenever the playing song changes
      this._unwatch = watchPlayers(() => this._scheduleRefresh());
      this._scheduleRefresh();
    }

    // Coalesce bursts of D-Bus signals into a single refresh.
    _scheduleRefresh() {
      if (this._refreshId) return;

      this._refreshId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
        this._refreshId = 0;
        this._refresh().catch((e) => logError(e, "Lyrics Grabber"));
        return GLib.SOURCE_REMOVE;
      });
    }

    _buildMenu() {
      // Header: shows the detected "Title — Artist".
      this._headerItem = new PopupMenu.PopupMenuItem("Lyrics", {
        reactive: false,
        style_class: "lyrics-grabber-header",
      });
      this.menu.addMenuItem(this._headerItem);
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      // allow scrolling through the pop up when lyrics is too long
      this._lyricsLabel = new St.Label({
        style_class: "lyrics-grabber-body",
        text: "Click to load lyrics for the current song.",
      });

      // allows scrollview to see full height of the lyrics so it can scroll it
      this._lyricsLabel.clutter_text.line_wrap = true;
      this._lyricsLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

      this._box = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        y_expand: true,
      });
      this._box.add_child(this._lyricsLabel);

      this._scroll = new St.ScrollView({
        style_class: "lyrics-grabber-scroll",
        overlay_scrollbars: true,
        x_expand: true,
      });
      this._scroll.set_policy(St.PolicyType.NEVER, St.PolicyType.AUTOMATIC);
      this._scroll.add_child(this._box);

      const section = new PopupMenu.PopupMenuSection();
      section.actor.add_child(this._scroll);
      this.menu.addMenuItem(section);
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
        this._setStatus("Lyrics", `Could not read player: ${e.message}`);
        return;
      }

      if (!song) {
        this._setStatus("Lyrics", "No song is currently playing.");
        return;
      }

      const label = song.artist ? `${song.title} — ${song.artist}` : song.title;
      const key = `${song.title}␟${song.artist}`;

      // Reuse the cached lyrics while the same song is playing.
      if (key === this._cacheKey) {
        this._setStatus(label, this._cacheText);
        return;
      }

      // reset scroll position when the song has changed
      this._scroll.vadjustment.value = 0;

      this._setStatus(label, "Searching for lyrics…");

      try {
        const lyrics = await fetchLyrics(this._session, song);
        const text = lyrics ?? "No lyrics found for this song.";
        this._cacheKey = key;
        this._cacheText = text;
        this._lyricsLabel.text = text;
      } catch (e) {
        // Don't cache errors, so the next open retries.
        this._lyricsLabel.text = `Failed to fetch lyrics: ${e.message}`;
      }
    }

    destroy() {
      this.menu.disconnectObject(this);
      this._unwatch?.();
      this._unwatch = null;
      if (this._refreshId) {
        GLib.source_remove(this._refreshId);
        this._refreshId = 0;
      }
      this._session?.abort();
      this._session = null;
      super.destroy();
    }
  },
);

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
