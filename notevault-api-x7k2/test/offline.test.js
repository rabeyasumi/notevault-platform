// Tests that need no database: index definitions, auth guards, input validation, pipeline shape.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'offline-test-secret-offline-test-secret';
process.env.CORS_ORIGIN = 'http://localhost:5173/';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/models/User');
const Note = require('../src/models/Note');
const Post = require('../src/models/Post');
const { usersByInterestPipeline, userPostsPipeline } = require('../src/pipelines');

// JSON.stringify keeps key order, which matters for compound indexes.
const declared = (Model) => Model.schema.indexes().map(([fields, options]) => [JSON.stringify(fields), options]);

describe('declared indexes (schema.index) - nothing unnecessary', () => {
  it('users: unique email + multikey interests only', () => {
    assert.deepEqual(declared(User), [
      ['{"email":1}', { unique: true }],
      ['{"interests":1}', {}],
    ]);
  });
  it('notes: only { owner, _id: -1 }', () => {
    assert.deepEqual(declared(Note), [['{"owner":1,"_id":-1}', {}]]);
  });
  it('posts: only { author, _id: -1 }', () => {
    assert.deepEqual(declared(Post), [['{"author":1,"_id":-1}', {}]]);
  });
  it('no field uses index:true / unique:true shortcuts that would hide an index', () => {
    for (const Model of [User, Note, Post]) {
      for (const [name, path] of Object.entries(Model.schema.paths)) {
        assert.equal(path.options.index, undefined, `${Model.modelName}.${name}`);
        assert.equal(path.options.unique, undefined, `${Model.modelName}.${name}`);
      }
    }
  });
});

describe('aggregation pipelines', () => {
  it('scenario 1 is one pipeline with $match, $unwind, $group and no $lookup', () => {
    const stages = usersByInterestPipeline({ skip: 0, limit: 10 }).map((s) => Object.keys(s)[0]);
    assert.deepEqual(stages, ['$match', '$project', '$unwind', '$group', '$sort', '$facet']);
  });
  it('scenario 2 contains exactly one $lookup, joined on the indexed author field', () => {
    const pipeline = userPostsPipeline('64b7f0c2a1b2c3d4e5f60718', { skip: 0, limit: 5 });
    const lookups = pipeline.filter((s) => s.$lookup);
    assert.equal(lookups.length, 1);
    assert.equal(lookups[0].$lookup.foreignField, 'author');
    assert.equal(lookups[0].$lookup.from, 'posts');
  });
});

describe('guards that run before any database access', () => {
  it('GET /health answers 503 while the database is not connected', async () => {
    const res = await request(app).get('/health');
    assert.equal(res.status, 503);
  });
  it('unknown route -> 404 JSON', async () => {
    const res = await request(app).get('/api/nope');
    assert.equal(res.status, 404);
  });
  it('protected routes without a token -> 401', async () => {
    for (const [method, url] of [
      ['get', '/api/auth/me'],
      ['get', '/api/notes'],
      ['post', '/api/notes'],
      ['get', '/api/notes/all'],
      ['get', '/api/users'],
      ['get', '/api/users/by-interest'],
      ['post', '/api/posts'],
    ]) {
      const res = await request(app)[method](url);
      assert.equal(res.status, 401, `${method} ${url}`);
    }
  });
  it('garbage, expired and wrongly signed tokens -> 401', async () => {
    const good = jwt.sign({ sub: '64b7f0c2a1b2c3d4e5f60718' }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    const forged = jwt.sign({ sub: '64b7f0c2a1b2c3d4e5f60718' }, 'some-other-secret-some-other-secret');
    const none = jwt.sign({ sub: '64b7f0c2a1b2c3d4e5f60718' }, '', { algorithm: 'none' });
    for (const token of ['garbage', good, forged, none]) {
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 401);
    }
  });
  it('weak or oversized passwords are refused before hashing', async () => {
    for (const password of ['short', 'x'.repeat(80), 12345678, undefined]) {
      const res = await request(app).post('/api/auth/register').send({ name: 'Ann', email: 'ann@example.com', password });
      assert.equal(res.status, 400);
    }
  });
  it('login with non-string credentials (NoSQL operator attempt) -> 400', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    assert.equal(res.status, 400);
  });
  it('malformed JSON body -> 400 JSON error', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{bad');
    assert.equal(res.status, 400);
  });
  it('public posts route rejects a malformed user id with 400', async () => {
    const res = await request(app).get('/api/users/not-an-id/posts');
    assert.equal(res.status, 400);
  });
  it('CORS allows the configured origin (trailing slash ignored) and not others', async () => {
    const ok = await request(app).get('/api/nope').set('Origin', 'http://localhost:5173');
    assert.equal(ok.headers['access-control-allow-origin'], 'http://localhost:5173');
    const bad = await request(app).get('/api/nope').set('Origin', 'https://evil.example');
    assert.equal(bad.headers['access-control-allow-origin'], undefined);
  });
});
