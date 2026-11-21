const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { signToken, authenticate } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { pick, assertValidPassword, hashPassword, verifyPassword } = require('../utils/helpers');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

// Public sign-up always creates a plain "user"; roles are only assignable by an admin.
router.post('/register', authLimiter, async (req, res) => {
  assertValidPassword(req.body.password);
  const user = await User.create({
    ...pick(req.body, ['name', 'email', 'interests']),
    passwordHash: await hashPassword(req.body.password),
  });
  res.status(201).json({ user, token: signToken(user) });
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw new HttpError(400, 'Email and password are required');
  }
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
  if (!(await verifyPassword(password, user?.passwordHash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  res.json({ user, token: signToken(user) });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
