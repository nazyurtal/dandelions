# Dandelions — two-player online board game

A small strategy game for two people. One player grows dandelions, the other blows
their seeds across the field. Play on one device, or online with a **room code** —
only two people can ever be in a room.

Built with zero dependencies: the server uses nothing but Node.js built-ins.

---

## Putting it online

Step-by-step guide: **[DEPLOY.md](DEPLOY.md)** — from creating a GitHub account to
two people playing with a room code.

Short version: GitHub alone is not enough for online play. `server.js` is a program,
and GitHub Pages can only serve static files. Keep the code on GitHub and connect it to
a free host that can run Node.js, such as Render.

You *can* publish the `docs/` folder with GitHub Pages for a no-setup link — the game
detects the missing server, greys out the online options and offers same-device play only.
DEPLOY.md covers both routes.

## Running it locally

Requires Node.js 18 or newer. No packages to install.

```bash
cd dandelions
node server.js
```

Then open `http://localhost:8080` in a browser.

To use a different port: `PORT=3000 node server.js`

### Getting a second player connected

| Situation | What to do |
|---|---|
| Same computer | Open a second tab at `http://localhost:8080` |
| Same home/office network | Use the host machine's local IP: `http://192.168.1.x:8080` |
| Different city or country | Deploy the server somewhere (see DEPLOY.md) |

**How to play together:** On the opening screen, pick a **board size** — 4x4 (default),
5x5 or 6x6. One player taps **"Create online room"** and shares the six-character code
that appears. The other taps **"Join with code"** and enters it. The game starts once
both are connected. Whoever created the room plays **Dandelions**; the other plays
**Wind**. The room creator's board size applies to both, and the server validates every
move against it.

There is also a **"Same device"** mode for taking turns on one screen.

---

## Security

This was built to be safe to expose on the internet. What is in place:

**The server is the referee — the client is never trusted.**
Every rule is enforced server-side. Calling `plant()` or `wind()` from the browser
console, or hand-crafting a network request, does nothing; the server rejects it.
This is covered by the test suite.

**Authentication**
- Each player gets a 64-character secret token generated with `crypto.randomBytes(32)`.
- Every request requires that token, compared using `crypto.timingSafeEqual`
  (immune to timing attacks).
- Tokens live only in `sessionStorage` and disappear when the tab closes.

**Room access**
- Codes are generated with `crypto.randomBytes`, using an alphabet that excludes
  easily confused characters (I, L, O, 0, 1).
- A room holds **at most 2 players**; a third request gets `409 room_full`.
- Code guessing is limited to 10 failed attempts per IP per 10 minutes.
- Roles are fixed: the Wind player cannot plant flowers, and Dandelions cannot blow wind.

**Request hardening**
- 240 requests per IP per minute.
- Request bodies capped at 2 KB; anything that is not JSON is rejected.
- Every input is validated for type and range (coordinates, direction index, code format).
- Path traversal is blocked when serving static files.

**Browser security headers**
`Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`,
`Cross-Origin-Resource-Policy`.

**Data**
- Nothing is written to disk; everything lives in memory.
- No personal data is collected — no names, no email, no cookies.
- Rooms are deleted after 2 hours, or after 10 minutes with nobody connected.

### Exposing it to the internet

Plain HTTP is fine on a local network. If you put the server on the public internet,
**use HTTPS** — otherwise room codes and tokens travel in the clear. The easiest route
is a reverse proxy:

```
# Caddy - fetches a certificate automatically
game.yourdomain.com {
    reverse_proxy localhost:8080
}
```

With Nginx, disable buffering so server-sent events work:

```nginx
location / {
    proxy_pass http://localhost:8080;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_buffering off;          # required for SSE
    proxy_read_timeout 3600s;
}
```

Behind a reverse proxy, make sure `X-Forwarded-For` is passed through so rate limiting
sees the real client IP.

Hosts like Render handle HTTPS for you, so no extra work is needed there.

---

## Files

```
dandelions/
├── server.js          # server + game referee (no dependencies)
├── package.json       # provides "npm start" - used by hosting platforms
├── render.yaml        # optional ready-made Render config
├── docs/
│   ├── index.html     # the game itself
│   ├── .nojekyll      # tells GitHub Pages to skip Jekyll processing
│   └── fonts/         # Baskervville + Inter Tight, self-hosted
├── DEPLOY.md          # step-by-step guide to putting it online
└── README.md
```

---

## Languages

The interface ships in six languages: **English, Türkçe, Français, Deutsch, 日本語,
العربية**. Switch with the dropdown in the top right, or the matching one in the
lobby — the two stay in sync. English is the default.

Selecting Arabic flips the page to right-to-left (`dir="rtl"`), **but the board and the
wind rose stay left-to-right**. That is deliberate: directions are absolute, so the
north-west arrow has to sit in the top-left corner in every language, or the game logic
breaks.

Japanese and Arabic fall back to system fonts (Hiragino, Yu Gothic, Noto Sans JP /
Noto Sans Arabic); no extra files are downloaded for them.

## Typography

- Headings: **Baskervville** (SIL Open Font License)
- Body text, buttons, labels: **Inter Tight** (SIL Open Font License)
- Room code: system monospace

Font files ship with the project (`docs/fonts/`, about 284 KB of woff2) — nothing is
requested from Google Fonts or any other CDN. The game therefore looks right offline
and makes no third-party requests; the `font-src 'self'` rule enforces this.

Latin and latin-ext subsets are declared with separate `unicode-range` values, so the
browser only downloads what the page actually uses while still covering accented
characters. Only the weights in use are bundled (Baskervville 400/700 plus italic,
Inter Tight 400/600/700).

---

## Rules

- **Dandelions** plants a flower on an empty square. Only one flower per row.
- **Wind** picks a direction from the compass; every flower casts seeds that way.
  Each direction can blow only once.
- Once all 8 directions have blown, **Dandelions** win if any square is still empty.
  If the field is completely full, **Wind** wins.
- The board can be 4x4, 5x5 or 6x6. Smaller boards play fast and tense; larger ones
  reward planning.
