const router = require('express').Router();
const User = require('../models/User');
const Note = require('../models/Note');
const Post = require('../models/Post');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { usersByInterestPipeline, userPostsPipeline } = require('../pipelines');
const { idParam, pick, assertValidPassword, hashPassword, parsePagination, paginate } = require('../utils/helpers');

router.param('id', idParam);

// ---- Public: posts are visible to everyone -------------------------------------------------
// Aggregation scenario 2 (pipeline in src/pipelines.js): one pipeline with one $lookup.
router.get('/:id/posts', async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [result] = await User.aggregate(userPostsPipeline(req.params.id, { skip, limit }));
  if (!result) throw new HttpError(404, 'User not found');

  res.json({
    user: { _id: result._id, name: result.name },
    data: result.posts.slice(0, limit),
    pagination: { page, limit, hasNextPage: result.posts.length > limit },
  });
});

// ---- Admin only ------------------------------------------------------------------------------
router.use(authenticate, requireAdmin);

// Aggregation scenario 1 (pipeline in src/pipelines.js): users grouped by interest, exactly one aggregate() call.
router.get('/by-interest', async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [result] = await User.aggregate(usersByInterestPipeline({ skip, limit }));
  const total = result.total[0]?.n ?? 0;
  res.json({ data: result.data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

router.get('/', async (req, res) => {
  res.json(await paginate(User, {}, req.query));
});

router.post('/', async (req, res) => {
  assertValidPassword(req.body.password);
  const user = await User.create({
    ...pick(req.body, ['name', 'email', 'role', 'interests']),
    passwordHash: await hashPassword(req.body.password),
  });
  res.status(201).json({ user });
});

router.get('/:id', async (req, res) => {
  const user = await User.findById(req.params.id).select('-__v');
  if (!user) throw new HttpError(404, 'User not found');
  res.json({ user });
});

router.patch('/:id', async (req, res) => {
  const user = await User.findById(req.params.id).select('+passwordHash');
  if (!user) throw new HttpError(404, 'User not found');

  const changes = pick(req.body, ['name', 'email', 'role', 'interests']);
  if (user._id.equals(req.user._id) && changes.role !== undefined && changes.role !== 'admin') {
    throw new HttpError(400, 'You cannot remove your own admin role');
  }
  user.set(changes);
  if (req.body.password !== undefined) {
    assertValidPassword(req.body.password);
    user.passwordHash = await hashPassword(req.body.password);
  }
  await user.save();
  res.json({ user });
});

router.delete('/:id', async (req, res) => {
  if (req.user._id.equals(req.params.id)) throw new HttpError(400, 'You cannot delete your own account');
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw new HttpError(404, 'User not found');
  await Promise.all([Note.deleteMany({ owner: user._id }), Post.deleteMany({ author: user._id })]);
  res.status(204).end();
});

module.exports = router;
