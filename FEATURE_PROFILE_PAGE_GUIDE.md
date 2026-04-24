# Adding a Profile Page — Beginner's Walkthrough

This guide walks you through the profile-page feature I just added to AutoQuiz, end to end. Follow the steps in order. Nothing is skipped.

## What this feature does

- Adds a new page at `/profile` where any logged-in user can pick an avatar and change their display name.
- Adds a clickable name+avatar button in the top-right of the navbar that opens the profile page.
- Stores the chosen avatar URL in a new `avatar_url` column on the Supabase `profiles` table.

## What I changed for you

Three code files touched, one new file created:

| File | What happened |
|---|---|
| `backend/supabase_schema.sql` | Added `avatar_url` column to the `profiles` table |
| `frontend/src/pages/Profile.jsx` | **New file** — the profile page UI + save logic |
| `frontend/src/App.jsx` | Imported `Profile`, added the `/profile` route, made the navbar name clickable, showed the avatar |
| (none) | No backend route needed — the page writes directly to Supabase using the client you already have |

---

## Step 1 — Update your Supabase database

The page saves a new `avatar_url` field, so the database needs that column.

1. Go to your Supabase project dashboard → **SQL Editor** → **New query**.
2. Paste this and click **Run**:

   ```sql
   alter table profiles add column if not exists avatar_url text;
   ```

That's it. The `add column if not exists` part means it's safe to run even if you've already run it.

> I also updated `backend/supabase_schema.sql` so anyone setting the project up from scratch will get the column automatically.

## Step 2 — Run the app locally and try it

Open three terminal windows/tabs. In each, `cd` into your autoquiz folder first.

**Terminal 1 — backend:**
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

**Terminal 2 — Redis (only if not already running):**
```bash
docker-compose up -d redis
```

**Terminal 3 — frontend:**
```bash
cd frontend
npm install      # only needed the first time
npm run dev
```

Open `http://localhost:5173`, log in, and click your name in the top-right. You should see the new profile page. Pick an avatar, change your display name, hit **Save changes**. The page will reload and you'll see the avatar in the navbar.

## Step 3 — Understand the code (optional but good for you)

### `frontend/src/pages/Profile.jsx` — the new page

Key pieces:

- **`useAuth()`** gives you the logged-in user and their current profile.
- **`AVATAR_SEEDS`** is an array of 8 names. Each one becomes a URL like `https://api.dicebear.com/7.x/avataaars/svg?seed=violet`. DiceBear is a free avatar service — no signup, no API key. Each unique seed makes a unique cartoon face.
- **`useState`** holds the form values (`fullName`, `avatar`) and the UI state (`saving`, `saved`, `error`).
- **`handleSave`** runs when the form is submitted. It calls `supabase.from("profiles").update({...}).eq("id", user.id)` to write the new values, then reloads the page so the navbar picks up the change.

### `frontend/src/App.jsx` — the router

Two changes:

1. `<Route path="/profile" ... />` — this makes `/profile` a real URL in your app.
2. The right-side navbar is now a `<Link to="/profile">` so clicking your name opens the page.

### `backend/supabase_schema.sql` — the schema file

Added `avatar_url text` to the `profiles` table. The `alter table ... add column if not exists` line below it makes the change safe to apply to a database that already exists.

---

## Step 4 — Commit and push to GitHub

**You don't need a backend to push to GitHub — only the `git` command-line tool, which ships with macOS.**

Open a terminal and run these one at a time. I'll explain what each one does.

### 4a — See what changed
```bash
cd ~/Documents/GitHub/autoquiz
git status
```
This lists which files are modified or new. You should see:
- `modified: backend/supabase_schema.sql`
- `modified: frontend/src/App.jsx`
- `new file: frontend/src/pages/Profile.jsx`
- `new file: FEATURE_PROFILE_PAGE_GUIDE.md` (this file)

### 4b — Stage the changes (tell git which files to include in the commit)
```bash
git add backend/supabase_schema.sql frontend/src/App.jsx frontend/src/pages/Profile.jsx FEATURE_PROFILE_PAGE_GUIDE.md
```

Or, if you want to stage every change you made:
```bash
git add .
```

### 4c — Commit (save a snapshot with a message)
```bash
git commit -m "Add profile page with avatar picker and display name editor"
```

The `-m` is followed by a short message describing what this commit does. Good commit messages are short, present-tense, and describe the change ("Add …", "Fix …", "Refactor …").

### 4d — Push to GitHub (send your commits to the cloud)
```bash
git push
```

If this is the first time pushing this branch, git may tell you to run:
```bash
git push --set-upstream origin main
```
Just copy-paste whatever git suggests and run it.

### 4e — If git asks for a username / password

GitHub **no longer** accepts your account password from the command line. You need a **Personal Access Token** (PAT):

1. Go to github.com → click your avatar (top right) → **Settings**.
2. Scroll to the bottom left → **Developer settings**.
3. **Personal access tokens → Tokens (classic) → Generate new token (classic)**.
4. Give it a name ("Mac terminal"), pick **90 days**, check the **`repo`** scope.
5. Click **Generate token**. Copy the token (starts with `ghp_…`).
6. Back in your terminal, when git asks for:
   - **Username:** your GitHub username
   - **Password:** paste the token

macOS will usually remember it in Keychain so you only do this once.

## Step 5 — Verify on GitHub

Open your browser, go to `https://github.com/<your-username>/autoquiz`, and you should see the new commit at the top and the new `Profile.jsx` file under `frontend/src/pages/`.

---

## Common problems and fixes

**"Cannot find module './pages/Profile'"** — make sure the file is saved at `frontend/src/pages/Profile.jsx` (capital P, `.jsx` extension).

**Avatar images don't load** — DiceBear needs internet access. If you're offline the `<img>` will show a broken-image icon. The save still works.

**Save button gets stuck on "Saving…"** — open the browser devtools (Cmd+Option+I) → Console tab. Any red error usually means RLS on the `profiles` table is blocking the update. Your existing schema already has RLS configured; if you tightened it, make sure users can update their own row:
```sql
create policy "users update own profile"
  on profiles for update
  using (auth.uid() = id);
```

**Navbar doesn't show the new avatar after save** — the page auto-reloads after save to refresh the cached profile in `AuthContext`. If you navigated away before it reloaded, just refresh the browser (Cmd+R).

**`git push` says "rejected — fetch first"** — someone else (or past-you on another machine) pushed a commit you don't have. Run `git pull --rebase` first, then `git push`.

---

## What to try next

Now that you know the full loop (edit → run locally → commit → push), try small changes:

- Add a 9th and 10th avatar seed to the `AVATAR_SEEDS` array in `Profile.jsx`.
- Change the DiceBear style from `avataaars` to `bottts` (robots) or `pixel-art`.
- Add a "Cancel" button next to "Save" that navigates back without saving.

Each of these is a one-file change. Make the edit, test in the browser, then `git add` / `git commit -m "..."` / `git push`.
