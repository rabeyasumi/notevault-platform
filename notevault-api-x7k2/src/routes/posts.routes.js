const router = require('express').Router();
const Post = require('../models/Post');
const { authenticate } = require('../middleware/auth');
const { pick } = require('../utils/helpers');

router.post('/', authenticate, async (req, res) => {
  const post = await Post.create({ ...pick(req.body, ['title', 'body']), author: req.user._id });
  res.status(201).json({ post });
});

module.exports = router;
