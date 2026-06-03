# Lyrics Grabber

A GNOME Shell 50 extension that detects the currently playing song and shows
its lyrics in a panel popup.

It works in three steps:

1. **Detect the song** — reads the title/artist of the active player over MPRIS.
2. **Fetch the lyrics** — searches lrclib for `"<title> <artist>"` for lyrics.
3. **Show them** — displays the lyrics in a scrollable popup, opened from the
   music-note icon in the top panel.

## Project layout

| File                            | Responsibility                                            |
| ------------------------------- | --------------------------------------------------------- |
| `extension.js`                  | Entry point: the panel button, popup UI, and refresh flow |
| `mpris.js`                      | MPRIS / D-Bus: find the active player and read its track  |
| `lyrics.js`                     | Lyrics request/extraction                                 |
| `stylesheet.css`                | Popup styling                                             |
| `icons/music-note-symbolic.svg` | Panel icon                                                |
| `metadata.json`                 | Extension manifest                                        |

## Screenshot

<img width="445" height="595" alt="image" src="https://github.com/user-attachments/assets/1526ce38-c0fc-4768-b6c1-a73cf2fd917f" />

## Todo

- [ ] Add font size adjustment option
