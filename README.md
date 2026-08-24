# Dandelions

A two-player board game. One player grows dandelions, the other blows their seeds
across the field. Play on one device, or online with a room code.

No dependencies — the server uses only Node.js built-ins.

## Run it

Requires Node.js 18+.

```bash
node server.js
```

Open `http://localhost:8080`. Use `PORT=3000 node server.js` for a different port.

## Play

Pick a board size (4×4, 5×5 or 6×6), then choose a mode:

- **Same device** — take turns on one screen.
- **Create online room** — you get a six-character code to share.
- **Join with code** — enter a code you were given.

A room holds exactly two players. Whoever creates it plays Dandelions; the other
plays Wind.

## Rules

- **Dandelions** plants a flower on an empty square. One flower per row.
- **Wind** picks a direction; every flower casts seeds that way. Each direction
  blows only once.
- After all 8 directions have blown, Dandelions win if any square is still empty.
  If the field is full, Wind wins.

## Deploy

See **[DEPLOY.md](DEPLOY.md)**.

GitHub Pages can host the `docs/` folder, but it cannot run `server.js` — so only
same-device play works there, and the game greys out the online options
automatically. Room codes need a host that runs Node.js, such as Render.

## Security

The server is authoritative: every rule is validated server-side, so a modified
client cannot cheat.

- Each player gets a 32-byte random token, compared with `timingSafeEqual`.
- Rooms hold at most 2 players; a third request is rejected.
- Room codes come from `crypto.randomBytes` and omit confusable characters.
- Rate limits: 240 requests per IP per minute, 10 failed join attempts per IP per
  10 minutes.
- Request bodies capped at 2 KB; all input is type- and range-checked.
- Nothing is stored on disk and no personal data is collected. Rooms expire after
  2 hours, or 10 minutes with nobody connected.

If you expose the server to the internet, put it behind HTTPS — otherwise room
codes and tokens travel in the clear. Managed hosts like Render do this for you.
With Nginx, set `proxy_buffering off` so server-sent events work.

## Files

```
dandelions/
├── server.js       # server and game referee
├── package.json    # provides "npm start"
├── render.yaml     # optional Render config
├── docs/
│   ├── index.html  # the game (self-contained)
│   ├── .nojekyll   # stops GitHub Pages running Jekyll
│   └── fonts/      # Baskervville + Inter Tight
├── DEPLOY.md
└── README.md
```

## Languages

English, Türkçe, Français, Deutsch, 日本語, العربية. Arabic switches the page to
right-to-left, but the board and wind rose stay left-to-right so the compass
directions keep their meaning.

## Licence

Fonts are SIL Open Font License. Everything else is MIT.
