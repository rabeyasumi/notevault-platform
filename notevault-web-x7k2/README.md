# NoteVault Web

React (Vite) client for the NoteVault API (`../notevault-api-x7k2`). Styling is intentionally minimal.

## Run locally

```bash
cp .env.example .env     # VITE_API_BASE_URL=http://localhost:5001
npm install
npm run dev              # http://localhost:5173
```

The backend must allow this origin in its `CORS_ORIGIN` (the backend example file already does).

## Deploy on Vercel

1. Import the repository in Vercel.
2. Project name: `notevault-web-x7k2`. Root Directory: `notevault-web-x7k2` (if the repository holds both folders). Framework preset: Vite (build `npm run build`, output `dist`).
3. Environment variable: `VITE_API_BASE_URL` = your Render URL, for example `https://notevault-api-x7k2.onrender.com` (no trailing slash, no `/api`).
   Vite writes this value into the build, so **redeploy after changing it**.
4. Copy the Vercel production URL into the backend's `CORS_ORIGIN` on Render (no trailing slash) and let Render redeploy.
   Vercel preview URLs are different origins; add them to `CORS_ORIGIN` (comma separated) only if you want to test previews.

## What is in the UI

* Register / log in. The new account always has the `user` role.
* **My notes**: create, edit, delete, paginated.
* **Posts**: write a public post, and browse posts of any user by id.
* Admin only: **Users** (add, edit, delete, paginated), **All notes** (with owner filter), **Users by interest**.
