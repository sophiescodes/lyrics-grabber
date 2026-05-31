# Lyrics Grabber

A GNOME Shell 50 extension that detects the currently playing song and shows
its lyrics in a panel popup.

It works in three steps:

1. **Detect the song** — reads the title/artist of the active player over MPRIS.
2. **Fetch the lyrics** — searches Google for `"<title> <artist> lyrics google"`
   and scrapes the lyrics block Google renders inline on the results page.
3. **Show them** — displays the lyrics in a scrollable popup, opened from the
   music-note icon in the top panel.

## Project layout

| File                            | Responsibility                                            |
| ------------------------------- | --------------------------------------------------------- |
| `extension.js`                  | Entry point: the panel button, popup UI, and refresh flow |
| `mpris.js`                      | MPRIS / D-Bus: find the active player and read its track  |
| `lyrics.js`                     | Google search request + HTML-to-lyrics extraction         |
| `stylesheet.css`                | Popup styling                                             |
| `icons/music-note-symbolic.svg` | Panel icon                                                |
| `metadata.json`                 | Extension manifest                                        |

## Install

```sh
ln -sfn "$PWD" ~/.local/share/gnome-shell/extensions/lyrics-grabber@sophiathesenpai.gmail.com
```

Then log out and back in (Wayland can't reload the shell in place) and enable it:

```sh
gnome-extensions enable lyrics-grabber@sophiathesenpai.gmail.com
```

## Notes

Google does not offer an official API for its inline lyrics widget, so the
lyrics are scraped from the results page. The parser in `lyrics.js` keys off
the **"Lyrics"** header and **"Source"** credit lines rather than CSS classes,
which makes it resilient to Google's frequent markup changes — but scraping can
still break if Google changes that page significantly or rate-limits requests.
