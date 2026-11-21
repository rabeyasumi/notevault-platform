// Full integration tests against a real MongoDB.
//  - default: downloads and starts an in-memory MongoDB (mongodb-memory-server)
//  - or set TEST_MONGODB_URI to use your own server / an Atlas test cluster (a throw-away database is created and dropped)
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'integration-test-secret-integration-test-secret';
process.env.CORS_ORIGIN = 'http://localhost:5173';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../src/app');
const User = require('../src/models/User');
const Note = require('../src/models/Note');
const Post = require('../src/models/Post');
const { hashPassword } = require('../src/utils/helpers');
const { usersByInterestPipeline, userPostsPipeline } = require('../src/pipelines');

const PASSWORD = 'correct-horse-battery';
let memoryServer;
let admin;
let alice;
let bob;
let carol;

const auth = (who) => ({ Authorization: `Bearer ${who.token}` });
const json = (res) => JSON.stringify(res);

const register = async (name, email, interests) => {
  const res = await request(app).post('/api/auth/register').send({ name, email, password: PASSWORD, interests });
  assert.equal(res.status, 201, json(res.body));
  return { id: res.body.user._id, token: res.body.token, email };
};

before(async () => {
  let uri = process.env.TEST_MONGODB_URI;
  if (!uri) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
  }
  await mongoose.connect(uri, { dbName: `notevault_test_${Date.now()}` });
  await Promise.all([User.init(), Note.init(), Post.init()]);

  const adminDoc = await User.create({
    name: 'Root Admin',
    email: 'admin@example.com',
    role: 'admin',
    passwordHash: await hashPassword(PASSWORD),
  });
  const login = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: PASSWORD });
  admin = { id: adminDoc.id, token: login.body.token };

  alice = await register('Alice', 'alice@example.com', ['Chess ', 'reading', 'chess']);
  bob = await register('Bob', 'bob@example.com', ['reading']);
  carol = await register('Carol', 'carol@example.com', ['hiking', 'chess']);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
});

describe('authentication', () => {
  it('register never returns the password hash and ignores a requested role', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Mallory', email: 'mallory@example.com', password: PASSWORD, role: 'admin' });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.role, 'user');
    assert.equal(res.body.user.passwordHash, undefined);
    const stored = await User.findById(res.body.user._id).select('+passwordHash');
    assert.match(stored.passwordHash, /^\$2[aby]\$12\$/); // bcrypt, cost 12, never the plain password
  });

  it('normalises interests (trim, lowercase, no duplicates)', async () => {
    const res = await request(app).get(`/api/users/${alice.id}`).set(auth(admin));
    assert.deepEqual(res.body.user.interests, ['chess', 'reading']);
  });

  it('duplicate email -> 409', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'Alice 2', email: 'ALICE@example.com', password: PASSWORD });
    assert.equal(res.status, 409);
  });

  it('login works, wrong password and unknown email -> 401', async () => {
    const ok = await request(app).post('/api/auth/login').send({ email: 'alice@example.com', password: PASSWORD });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.token);
    const wrong = await request(app).post('/api/auth/login').send({ email: 'alice@example.com', password: 'wrong-password' });
    assert.equal(wrong.status, 401);
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: PASSWORD });
    assert.equal(unknown.status, 401);
  });

  it('GET /api/auth/me returns the profile', async () => {
    const res = await request(app).get('/api/auth/me').set(auth(alice));
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'alice@example.com');
  });

  it('a deleted account stops working immediately even with a valid token', async () => {
    const temp = await register('Temp', 'temp@example.com');
    await User.findByIdAndDelete(temp.id);
    const res = await request(app).get('/api/auth/me').set(auth(temp));
    assert.equal(res.status, 401);
  });
});

describe('notes (user role)', () => {
  const titles = ['first', 'second', 'third'];
  let aliceNotes = [];
  let bobNote;

  it('create notes', async () => {
    for (const title of titles) {
      const res = await request(app).post('/api/notes').set(auth(alice)).send({ title, content: `body of ${title}`, owner: bob.id });
      assert.equal(res.status, 201);
      assert.equal(res.body.note.owner, alice.id, 'owner must come from the token, not the body');
      aliceNotes.push(res.body.note);
    }
    const res = await request(app).post('/api/notes').set(auth(bob)).send({ title: 'bob private' });
    bobNote = res.body.note;
    assert.equal((await request(app).post('/api/notes').set(auth(bob)).send({ content: 'no title' })).status, 400);
  });

  it('lists only own notes, newest first, with pagination', async () => {
    const p1 = await request(app).get('/api/notes?limit=2&page=1').set(auth(alice));
    assert.deepEqual(p1.body.data.map((n) => n.title), ['third', 'second']);
    assert.deepEqual(p1.body.pagination, { page: 1, limit: 2, total: 3, totalPages: 2 });
    const p2 = await request(app).get('/api/notes?limit=2&page=2').set(auth(alice));
    assert.deepEqual(p2.body.data.map((n) => n.title), ['first']);
    const bobs = await request(app).get('/api/notes').set(auth(bob));
    assert.equal(bobs.body.pagination.total, 1);
  });

  it("another user's note looks like it does not exist (read, update, delete)", async () => {
    const id = aliceNotes[0]._id;
    assert.equal((await request(app).get(`/api/notes/${id}`).set(auth(bob))).status, 404);
    assert.equal((await request(app).patch(`/api/notes/${id}`).set(auth(bob)).send({ title: 'hacked' })).status, 404);
    assert.equal((await request(app).delete(`/api/notes/${id}`).set(auth(bob))).status, 404);
    assert.equal((await Note.findById(id)).title, 'first');
  });

  it('update and delete own note', async () => {
    const id = aliceNotes[0]._id;
    const upd = await request(app).patch(`/api/notes/${id}`).set(auth(alice)).send({ title: 'renamed', owner: bob.id });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.note.title, 'renamed');
    assert.equal(upd.body.note.owner, alice.id);
    assert.equal((await request(app).delete(`/api/notes/${id}`).set(auth(alice))).status, 204);
    assert.equal((await request(app).get(`/api/notes/${id}`).set(auth(alice))).status, 404);
  });

  it('users cannot use the admin "all notes" view; bad ids are rejected', async () => {
    assert.equal((await request(app).get('/api/notes/all').set(auth(alice))).status, 403);
    assert.equal((await request(app).get('/api/notes/xyz').set(auth(alice))).status, 400);
  });

  it('admin sees everyone\'s notes, can filter by owner, can read but not edit them', async () => {
    const all = await request(app).get('/api/notes/all').set(auth(admin));
    assert.equal(all.status, 200);
    assert.equal(all.body.pagination.total, 3); // alice 2 left + bob 1
    assert.ok(all.body.data[0].owner.name, 'owner is populated with name/email');

    const only = await request(app).get(`/api/notes/all?owner=${bob.id}`).set(auth(admin));
    assert.equal(only.body.pagination.total, 1);

    assert.equal((await request(app).get(`/api/notes/${bobNote._id}`).set(auth(admin))).status, 200);
    assert.equal((await request(app).patch(`/api/notes/${bobNote._id}`).set(auth(admin)).send({ title: 'x' })).status, 404);
    assert.equal((await request(app).get('/api/notes/all?owner[$ne]=x').set(auth(admin))).status, 400);
  });
});

describe('user management (admin role)', () => {
  it('regular users are forbidden', async () => {
    for (const [method, url] of [['get', '/api/users'], ['post', '/api/users'], ['get', `/api/users/${bob.id}`], ['patch', `/api/users/${bob.id}`], ['delete', `/api/users/${bob.id}`], ['get', '/api/users/by-interest']]) {
      assert.equal((await request(app)[method](url).set(auth(alice)).send({})).status, 403, `${method} ${url}`);
    }
  });

  it('lists users with pagination and no password data', async () => {
    const res = await request(app).get('/api/users?limit=2').set(auth(admin));
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
    assert.ok(res.body.pagination.total >= 4);
    assert.ok(res.body.data.every((u) => u.passwordHash === undefined));
  });

  it('create, read, update (incl. password) and delete a user', async () => {
    const created = await request(app).post('/api/users').set(auth(admin)).send({ name: 'Dave', email: 'dave@example.com', password: PASSWORD, role: 'admin', interests: ['golf'] });
    assert.equal(created.status, 201);
    assert.equal(created.body.user.role, 'admin');
    const id = created.body.user._id;

    assert.equal((await request(app).post('/api/users').set(auth(admin)).send({ name: 'Weak', email: 'weak@example.com', password: '123' })).status, 400);
    assert.equal((await request(app).get(`/api/users/${id}`).set(auth(admin))).body.user.email, 'dave@example.com');

    const upd = await request(app).patch(`/api/users/${id}`).set(auth(admin)).send({ name: 'David', role: 'user', password: 'a-brand-new-password' });
    assert.equal(upd.body.user.name, 'David');
    assert.equal(upd.body.user.role, 'user');
    const login = await request(app).post('/api/auth/login').send({ email: 'dave@example.com', password: 'a-brand-new-password' });
    assert.equal(login.status, 200);

    assert.equal((await request(app).delete(`/api/users/${id}`).set(auth(admin))).status, 204);
    assert.equal((await request(app).get(`/api/users/${id}`).set(auth(admin))).status, 404);
  });

  it('an admin cannot delete or demote themselves', async () => {
    assert.equal((await request(app).delete(`/api/users/${admin.id}`).set(auth(admin))).status, 400);
    assert.equal((await request(app).patch(`/api/users/${admin.id}`).set(auth(admin)).send({ role: 'user' })).status, 400);
  });

  it('role changes apply immediately (token role is not trusted)', async () => {
    await request(app).patch(`/api/users/${bob.id}`).set(auth(admin)).send({ role: 'admin' });
    assert.equal((await request(app).get('/api/users').set(auth(bob))).status, 200);
    await request(app).patch(`/api/users/${bob.id}`).set(auth(admin)).send({ role: 'user' });
    assert.equal((await request(app).get('/api/users').set(auth(bob))).status, 403);
  });

  it('deleting a user also removes their notes and posts', async () => {
    const eve = await register('Eve', 'eve@example.com');
    await request(app).post('/api/notes').set(auth(eve)).send({ title: 'n' });
    await request(app).post('/api/posts').set(auth(eve)).send({ title: 'p', body: 'b' });
    assert.equal((await request(app).delete(`/api/users/${eve.id}`).set(auth(admin))).status, 204);
    assert.equal(await Note.countDocuments({ owner: eve.id }), 0);
    assert.equal(await Post.countDocuments({ author: eve.id }), 0);
  });
});

describe('aggregation 1: users grouped by interest', () => {
  it('groups users per interest', async () => {
    const res = await request(app).get('/api/users/by-interest').set(auth(admin));
    assert.equal(res.status, 200);
    const byInterest = Object.fromEntries(res.body.data.map((g) => [g.interest, g.users.map((u) => u.name).sort()]));
    assert.deepEqual(byInterest, {
      chess: ['Alice', 'Carol'],
      hiking: ['Carol'],
      reading: ['Alice', 'Bob'],
    });
    assert.equal(res.body.data.find((g) => g.interest === 'chess').count, 2);
    assert.deepEqual(res.body.data.map((g) => g.interest), ['chess', 'hiking', 'reading']); // sorted
  });

  it('paginates the groups', async () => {
    const res = await request(app).get('/api/users/by-interest?limit=2&page=2').set(auth(admin));
    assert.deepEqual(res.body.data.map((g) => g.interest), ['reading']);
    assert.deepEqual(res.body.pagination, { page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it('a page past the end answers with an empty list', async () => {
    const res = await request(app).get('/api/users/by-interest?page=99').set(auth(admin));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
  });
});

describe('aggregation 2: posts of a user via $lookup', () => {
  it('requires login to write a post', async () => {
    assert.equal((await request(app).post('/api/posts').send({ title: 't', body: 'b' })).status, 401);
  });

  it('is public, newest first, paginated, and hides the author field', async () => {
    for (const n of [1, 2, 3]) {
      const res = await request(app).post('/api/posts').set(auth(alice)).send({ title: `post ${n}`, body: `text ${n}`, author: bob.id });
      assert.equal(res.status, 201);
    }
    await request(app).post('/api/posts').set(auth(bob)).send({ title: 'bob post', body: 'x' });

    const p1 = await request(app).get(`/api/users/${alice.id}/posts?limit=2`); // no Authorization header
    assert.equal(p1.status, 200);
    assert.equal(p1.body.user.name, 'Alice');
    assert.deepEqual(p1.body.data.map((p) => p.title), ['post 3', 'post 2']);
    assert.deepEqual(p1.body.pagination, { page: 1, limit: 2, hasNextPage: true });
    assert.equal(p1.body.data[0].author, undefined);

    const p2 = await request(app).get(`/api/users/${alice.id}/posts?limit=2&page=2`);
    assert.deepEqual(p2.body.data.map((p) => p.title), ['post 1']);
    assert.equal(p2.body.pagination.hasNextPage, false);
  });

  it('unknown user -> 404, user without posts -> empty list', async () => {
    assert.equal((await request(app).get('/api/users/64b7f0c2a1b2c3d4e5f60718/posts')).status, 404);
    const none = await request(app).get(`/api/users/${carol.id}/posts`);
    assert.equal(none.status, 200);
    assert.deepEqual(none.body.data, []);
  });
});

describe('indexes', () => {
  const names = async (Model) => (await Model.collection.indexes()).map((i) => i.name).sort();

  it('the database holds exactly the intended indexes, nothing extra', async () => {
    assert.deepEqual(await names(User), ['_id_', 'email_1', 'interests_1']);
    assert.deepEqual(await names(Note), ['_id_', 'owner_1__id_-1']);
    assert.deepEqual(await names(Post), ['_id_', 'author_1__id_-1']);
  });

  const plan = (explain) => JSON.stringify(explain);

  it('"my notes" list is an index scan with no in-memory sort', async () => {
    const p = plan(await Note.find({ owner: alice.id }).sort({ _id: -1 }).limit(10).explain('queryPlanner'));
    assert.match(p, /IXSCAN/);
    assert.match(p, /owner_1__id_-1/);
    assert.doesNotMatch(p, /"stage":"SORT"/);
  });

  it('admin all-notes list and single reads use the _id index; login uses email_1', async () => {
    assert.match(plan(await Note.find({}).sort({ _id: -1 }).limit(10).explain('queryPlanner')), /_id_/);
    assert.match(plan(await Note.findOne({ _id: alice.id }).explain('queryPlanner')), /IXSCAN|IDHACK/);
    assert.match(plan(await User.findOne({ email: 'alice@example.com' }).explain('queryPlanner')), /email_1/);
  });

  it('aggregation 1 reads the interests_1 index in its $match stage', async () => {
    const explain = await User.aggregate(usersByInterestPipeline({ skip: 0, limit: 10 })).explain('queryPlanner');
    assert.match(plan(explain), /interests_1/);
  });

  it('aggregation 2 uses the posts { author, _id } index for the $lookup', async () => {
    const explain = await User.aggregate(userPostsPipeline(alice.id, { skip: 0, limit: 10 })).explain('executionStats');
    assert.match(plan(explain), /author_1__id_-1/);
  });
});
