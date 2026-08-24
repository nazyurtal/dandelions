# Putting the game online (from scratch)

This guide assumes you have never used GitHub before. By the end you will have a link
you can share, and you and a friend will be able to play together with a **room code**
even from different cities.

Time needed: about 15 minutes. Cost: nothing.

---

## Read this first (the important part)

The project has two pieces:

| Piece | What it does |
|---|---|
| `docs/index.html` | The game you see on screen |
| `server.js` | The **server**: it pairs the two players, generates the room code, and referees every move |

**GitHub alone is not enough.** GitHub stores your code, and it has a publishing
feature called GitHub Pages — but Pages can only show ready-made files, it cannot run
a program. Since `server.js` is a program, it will **not** run there: the page opens,
"Same device" mode works, but no room code is ever created.

So you will do two things:

1. **GitHub** — to store the code
2. **Render** — to actually run it (free, and it connects to GitHub)

---

## Part 1 — Put the code on GitHub

### Step 1: Create a GitHub account

1. Go to <https://github.com>.
2. Click **Sign up** in the top right.
3. Enter an email address, a password and a username.
4. Type in the verification code sent to your email.

Already have an account? Just click **Sign in**.

### Step 2: Create an empty repository

A "repository" is your project's folder on GitHub.

1. Click the **+** in the top right → **New repository**.
2. In **Repository name**, type: `dandelions`
3. Leave it set to **Public**. (This is the simplest option for free hosting.)
4. Do **not** tick "Add a README file" or any other box — leave it empty.
5. Click the green **Create repository** button.

### Step 3: Upload the files

You have the project folder on your computer. You are going to upload its contents.

1. On the page that just opened, click the **uploading an existing file** link.
   (If you cannot see it: **Add file** → **Upload files**.)
2. Open the project folder on your computer.
3. Select **the contents of the folder, not the folder itself**, and drag them into
   the browser window. These need to go up:
   - `server.js`
   - `package.json`
   - `README.md`
   - `render.yaml`
   - the `docs` folder (which contains `index.html` and a `fonts` folder)

> **Watch out:** when you drag the `docs` folder, everything inside comes with it.
> After uploading you should see `docs/index.html` and `docs/fonts/...` in the
> list. If you do not, drag the `docs` folder in again.

4. Click the green **Commit changes** button at the bottom of the page.

Your code is now on GitHub — but it is not running yet. That is the next part.

---

## Part 2 — Make it run (Render)

### Step 4: Create a Render account

1. Go to <https://render.com>.
2. Click **Get Started** or **Sign Up**.
3. Choose **continue with GitHub**, so Render can see your repositories.
4. If GitHub asks for permission, click **Authorize**.

### Step 5: Create the service

1. In the Render dashboard, click **New +** → **Web Service**.
2. Your GitHub repositories appear. Click **Connect** next to `dandelions`.
   - Not listed? Click **Configure account** and grant access to the repository.
3. Fill in the form like this:

   | Field | What to enter |
   |---|---|
   | **Name** | `dandelions` (any name works) |
   | **Region** | Whichever is closest to you |
   | **Branch** | `main` |
   | **Runtime** / **Language** | `Node` |
   | **Build Command** | **leave empty** |
   | **Start Command** | `node server.js` |
   | **Instance Type** | **Free** |

4. Click **Create Web Service** at the bottom.

### Step 6: Wait, then grab your link

Render downloads the code and starts it. You will see log lines scrolling past; this
takes a minute or two.

You are ready when this line appears:

```
Dandelions server running: http://localhost:10000
```

Near the top of the page there will be an address like:

```
https://dandelions.onrender.com
```

**That is the link you share.** Click it — the game should open.

---

## Part 3 — How two people play

1. Open the link.
2. In the popup, choose a **board size** (4x4, 5x5 or 6x6).
3. Click **"Create online room"**.
4. A six-character code appears, for example `X7K2QP`.
5. Send your friend both the **link** and the **code**.
6. Your friend opens the link → **"Join with code"** → types the code.
7. As soon as you are both connected the game starts. You play Dandelions, your
   friend plays Wind.

Moves appear on both screens instantly.

---

## Three things worth knowing

**1. The first load can be slow.**
On the free plan the service goes to sleep after 15 minutes without use. Waking it up
takes 30–60 seconds. After that it is normal speed, and it will not happen mid-game
because you are actively using it.

**2. The address starts with HTTPS — that is good.**
Render issues a security certificate automatically, so your room code and session
token are encrypted in transit. (Running it on your own machine over `http://` gives
you no such protection, which is exactly why hosting it this way matters.)

**3. Changes deploy themselves.**
Edit a file on GitHub and save it; Render notices and updates the site on its own.
There is nothing to do by hand.

---

## If something goes wrong

| Symptom | Cause and fix |
|---|---|
| Render says "Build failed" / "Cannot find module" | `server.js` is not at the **top level** of the repository. Look at the repo on GitHub: `server.js` should be visible directly, not inside a folder. |
| Page loads but looks blank or unstyled | The `docs` folder did not upload. Check whether `docs/index.html` exists on GitHub; if not, repeat Step 3. |
| Fonts look wrong | The `docs/fonts` folder is missing. Upload it the same way. |
| "Room not found" | The service may have just woken up. Refresh the page and create a new room. Rooms are also deleted automatically after 2 hours. |
| Your friend sees "Room is full" | Two people are already in that room. Create a new one. |
| Nothing happens when the code is entered | Codes are 6 characters, uppercase letters and digits only. Easily confused characters (I, O, 1, 0) are never used. |
| GitHub Pages returns 404 even though the build is green | You are almost certainly opening the wrong address. Go to **Settings → Pages** and click **Visit site** in the green box instead of typing the URL. Renaming the repository changes the address. |
| GitHub Pages 404, and `docs/index.html` is missing on GitHub | Drag-and-drop skipped it. Re-upload, or use **Add file → Upload files** and drop `index.html` on its own. |

---

## Alternatives

Render is not the only option; the logic is the same everywhere — **the start command
must be `node server.js`**:

- **Glitch** (<https://glitch.com>) — quickest, works without GitHub
- **Fly.io**, **Railway**, **Koyeb** — similar setup

These sites redesign their interfaces from time to time. If the button names do not
match exactly, look for these three things: *connect a repository*, *start command*,
*free plan*.

---

## Option: play straight from GitHub (Pages)

If you only want the **"Same device"** mode — two people taking turns on one screen —
you can skip Render entirely and publish straight from GitHub. It takes about a minute.

1. Open your repository on GitHub.
2. Click **Settings** (top row of the repository, not your account settings).
3. In the left sidebar, click **Pages**.
4. Under **Source**, choose **Deploy from a branch**.
5. Set **Branch** to `main` and the folder to **`/docs`**, then click **Save**.
6. Wait a minute, then refresh the page. A green box appears at the top saying
   "Your site is live at …".

**Use the link in that green box — click "Visit site" rather than typing the address
yourself.** The URL contains your exact repository name, and guessing it wrong is the
most common reason for a 404. If you rename the repository later, the address changes
with it.

> **If the Pages build fails** (a red X on "pages build and deployment", with a Jekyll
> error in the log): GitHub tries to run your files through Jekyll, a blog engine this
> project does not need. The fix is a single empty file named `.nojekyll` inside the
> `docs` folder. It ships with the project — but files starting with a dot are hidden
> on most computers, so drag-and-drop usually skips it. Create it directly on GitHub:
> **Add file → Create new file**, type `docs/.nojekyll` as the name, leave the content
> empty, then **Commit changes**. The build reruns and succeeds.

**What works and what does not:** the game detects that there is no server behind it
and greys out the online options automatically, showing a short note explaining why. So you get
"Same device" play, all six languages, all three board sizes — but **no room codes**.
Generating a room code needs a running program, which GitHub Pages cannot do.

For online play with a code, follow Part 2 above. You can have both at the same time:
GitHub Pages for the quick same-device link, Render for the online version.
