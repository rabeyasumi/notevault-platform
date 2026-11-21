# NoteVault API

REST API for a note-taking platform with JWT authentication and role-based access control.
Stack: Node.js, Express 5, MongoDB with Mongoose, JWT, bcrypt (`bcryptjs`, cost 12).
The React client lives in the sibling folder `notevault-web-x7k2`.

## Requirements checklist

| Requirement | Where |
|---|---|
| User: create / update / delete / list own notes | `src/routes/notes.routes.js` |
| Admin inherits user rights, manages users (add, remove, update, list), views everyone's notes | `src/routes/users.routes.js`, `GET /api/notes/all` |
| MongoDB + Mongoose | `src/models/*` |
| JWT authentication | `src/middleware/auth.js` |
| Secure password hashing | `src/utils/helpers.js` (bcrypt, cost 12) |
| Indexes declared with `schema.index` | last lines of each file in `src/models/` |
| Pagination on every list | `paginate()` in `src/utils/helpers.js`, plus the two aggregations |
| Aggregation 1: users grouped by interest, one `aggregate()` call | `usersByInterestPipeline` in `src/pipelines.js` |
| Aggregation 2: posts of a user with a single `$lookup` | `userPostsPipeline` in `src/pipelines.js` |
| No unnecessary indexes | 4 custom indexes in total, justified below, asserted in `test/` |

## Indexing strategy

The default `_id` index exists on every collection and costs nothing extra, so the design leans on it wherever possible:
every list is sorted by `_id` descending. `_id` is an ObjectId that starts with a timestamp, so "newest first" needs no
separate `createdAt` index.

| Collection | Index (`schema.index`) | Queries it serves |
|---|---|---|
| `users` | `{ email: 1 }` unique | Login lookup (`findOne({ email })`) and the guarantee that an email is used once. |
| `users` | `{ interests: 1 }` (multikey) | The `$match` stage of Aggregation 1. |
| `notes` | `{ owner: 1, _id: -1 }` | "My notes" list (equality on owner, newest first, no in-memory sort), admin "notes of one user" (`?owner=`), and the cascade delete when a user is removed. |
| `posts` | `{ author: 1, _id: -1 }` | The foreign-field side of Aggregation 2's `$lookup` (equality on author, newest first), and the cascade delete. |

Everything else is served by the built-in `_id` index, so no extra index was created for it:

| Operation | Index used |
|---|---|
| Admin lists all users (`GET /api/users`) | `_id` |
| Admin lists all notes (`GET /api/notes/all`) | `_id` |
| Read one note / one user / own profile (`GET /api/notes/:id`, `/api/users/:id`, `/api/auth/me`) | `_id` |
| Update / delete a note (`{ _id, owner }`) | `_id` |
| Auth middleware loads the user from the token | `_id` |
| Aggregation 2 starting `$match` on the user | `_id` |

Deliberately not indexed: `role`, `name`, `createdAt`, note `title`, post `title`. No query in this API filters or sorts by them,
and each extra index slows every write and uses memory.

`paginate()` counts with `estimatedDocumentCount()` when there is no filter (metadata only, no scan) and with
`countDocuments(filter)` when there is one (index-backed).

## Aggregations

### 1. Users grouped by interest: `GET /api/users/by-interest` (admin)

One `User.aggregate(...)` call, nothing else touches the database for this endpoint:

```
$match   { interests: { $gt: '' } }   reads the interests_1 multikey index, skips users without interests
$project { name, interests }
$unwind  $interests                   one document per (user, interest)
$group   _id = interest, count, users[{ _id, name }]
$sort    { _id: 1 }                   groups in alphabetical order
$facet   data   -> $skip, $limit, $project
         total  -> $count             page of groups and the total number of groups in the same call
```

Example: `GET /api/users/by-interest?page=1&limit=10`

```json
{
  "data": [
    { "interest": "chess", "count": 2, "users": [{ "_id": "...", "name": "Alice" }, { "_id": "...", "name": "Carol" }] },
    { "interest": "reading", "count": 1, "users": [{ "_id": "...", "name": "Bob" }] }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 2, "totalPages": 1 }
}
```

Note: the `$match` can use the index, but `$unwind` and `$group` still read each matching document. Index use here is
limited to the first stage; the index does not make the grouping itself cheaper.

### 2. Posts of a user: `GET /api/users/:id/posts` (public)

Posts are visible to everyone, so this route needs no token. One pipeline with one `$lookup`:

```
$match   { _id: <userId> }            _id index; an unknown user returns no document -> 404
$project { name }
$lookup  from posts, localField _id, foreignField author,
         pipeline: [ $sort { _id: -1 }, $skip, $limit(limit + 1), $project ]
```

The equality on `author` is served by `posts { author: 1, _id: -1 }` and the same index already delivers the newest-first order,
so the sort inside the lookup is not done in memory. One extra post (`limit + 1`) is fetched to report `hasNextPage` without a
second query, so this endpoint returns `{ page, limit, hasNextPage }` instead of a total.
`$lookup` with both `localField/foreignField` and `pipeline` needs MongoDB 5.0 or newer (Atlas free tier is newer than that).

## Security notes

* Passwords: bcrypt, cost 12, 8-72 characters. The hash is `select: false` and removed from every JSON output.
  Login compares against a dummy hash when the email does not exist, so response time does not reveal valid emails.
* JWT (HS256, `JWT_EXPIRES_IN`, default 1 day) carries only the user id. **The role is read from the database on every request**,
  so demoting or deleting a user takes effect immediately.
* Public registration always creates role `user`. Only an admin can create admins. An admin cannot delete themselves or remove their own admin role,
  so the system always keeps at least one admin.
* A note that belongs to someone else answers `404`, not `403`, so ids cannot be probed. Admins can read every note but, as specified, only edit or delete their own.
* Mass assignment is blocked with an explicit whitelist per route (`pick`); `owner` and `author` always come from the token.
* `mongoose.set('sanitizeFilter', true)`, string checks on login, and ObjectId validation guard against NoSQL operator injection.
* `helmet`, CORS restricted to `CORS_ORIGIN`, a 10 kB JSON body limit, and a rate limit on login/register (50 per 15 minutes per IP).

## API summary

All list endpoints accept `?page=1&limit=10` (limit is capped at 50) and answer `{ data, pagination }`.

| Method and path | Access |
|---|---|
| `POST /api/auth/register`, `POST /api/auth/login` | public |
| `GET /api/auth/me` | any logged-in user |
| `GET/POST /api/notes`, `GET/PATCH/DELETE /api/notes/:id` | logged-in user (own notes; admin may also `GET` any note) |
| `GET /api/notes/all` (`?owner=<userId>`) | admin |
| `POST /api/posts` | logged-in user |
| `GET /api/users/:id/posts` | public |
| `GET /api/users/by-interest` | admin |
| `GET/POST /api/users`, `GET/PATCH/DELETE /api/users/:id` | admin |
| `GET /health` | public (503 while the database is down) |

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `MONGODB_URI` | yes | MongoDB / Atlas connection string |
| `JWT_SECRET` | yes | at least 32 characters (the server refuses to start otherwise) |
| `JWT_EXPIRES_IN` | no | default `1d` |
| `CORS_ORIGIN` | yes in production | frontend URL(s), comma separated, no trailing slash |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | recommended | first admin, created at startup if that email does not exist (an existing account with that email is left unchanged) |
| `PORT` | no | Render sets it automatically |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## Run locally

```bash
cp .env.example .env     # fill in MONGODB_URI, JWT_SECRET, ADMIN_*
npm install
npm run dev              # http://localhost:5001, check /health
```

## Tests

```bash
npm test
```
