const bcrypt = require('bcryptjs');
const { HttpError } = require('../middleware/error');

const BCRYPT_ROUNDS = 12;
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', BCRYPT_ROUNDS);

const isObjectId = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

// router.param handler: reject malformed ids with 400 before touching the database.
const idParam = (req, res, next, id) => {
  if (!isObjectId(id)) throw new HttpError(400, 'Invalid id');
  next();
};

const pick = (source, keys) => Object.fromEntries(keys.filter((k) => source[k] !== undefined).map((k) => [k, source[k]]));

// bcrypt only reads the first 72 bytes, so longer passwords are refused.
const assertValidPassword = (password) => {
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) {
    throw new HttpError(400, 'Password must be 8 to 72 characters');
  }
};

const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);

// Runs a comparison even when the user does not exist, so response time does not reveal valid emails.
const verifyPassword = async (password, hash) => {
  const matches = await bcrypt.compare(password, hash || DUMMY_HASH);
  return Boolean(hash) && matches;
};

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

// Shared by every find()-based list. Sorting is always by _id (newest first), which
// the default _id index or the trailing _id of a compound index can serve.
const paginate = async (Model, filter, query, { select = '-__v', populate } = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const hasFilter = Object.keys(filter).length > 0;

  let find = Model.find(filter).select(select).sort({ _id: -1 }).skip(skip).limit(limit).lean();
  if (populate) find = find.populate(populate);

  const [data, total] = await Promise.all([
    find,
    hasFilter ? Model.countDocuments(filter) : Model.estimatedDocumentCount(),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

module.exports = { isObjectId, idParam, pick, assertValidPassword, hashPassword, verifyPassword, parsePagination, paginate };
