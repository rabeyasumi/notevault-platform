const router = require('express').Router();
const Note = require('../models/Note');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { HttpError } = require('../middleware/error');
const { idParam, isObjectId, pick, paginate } = require('../utils/helpers');

router.param('id', idParam);
router.use(authenticate);

// Admin only: every note in the system, optionally narrowed with ?owner=<userId>.
router.get('/all', requireAdmin, async (req, res) => {
  const filter = {};
  if (req.query.owner !== undefined) {
    if (!isObjectId(req.query.owner)) throw new HttpError(400, 'Invalid owner id');
    filter.owner = req.query.owner;
  }
  res.json(await paginate(Note, filter, req.query, { populate: { path: 'owner', select: 'name email' } }));
});

// Own notes (admins included).
router.get('/', async (req, res) => {
  res.json(await paginate(Note, { owner: req.user._id }, req.query));
});

router.post('/', async (req, res) => {
  const note = await Note.create({ ...pick(req.body, ['title', 'content']), owner: req.user._id });
  res.status(201).json({ note });
});

// Users can only read their own notes; admins can read any. A foreign note looks like a missing one (404).
router.get('/:id', async (req, res) => {
  const filter = req.user.role === 'admin' ? { _id: req.params.id } : { _id: req.params.id, owner: req.user._id };
  const note = await Note.findOne(filter).select('-__v');
  if (!note) throw new HttpError(404, 'Note not found');
  res.json({ note });
});

// Only the owner can change or delete a note, admins included.
router.patch('/:id', async (req, res) => {
  const note = await Note.findOne({ _id: req.params.id, owner: req.user._id });
  if (!note) throw new HttpError(404, 'Note not found');
  note.set(pick(req.body, ['title', 'content']));
  await note.save();
  res.json({ note });
});

router.delete('/:id', async (req, res) => {
  const note = await Note.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
  if (!note) throw new HttpError(404, 'Note not found');
  res.status(204).end();
});

module.exports = router;
