const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const { HttpError } = require('./error');

const signToken = (user) =>
  jwt.sign({ sub: user.id }, config.jwtSecret, { algorithm: 'HS256', expiresIn: config.jwtExpiresIn });


const authenticate = async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }

  const user = await User.findById(payload.sub).select('-__v');
  if (!user) throw new HttpError(401, 'Account no longer exists');
  req.user = user;
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') throw new HttpError(403, 'Admin access required');
  next();
};

module.exports = { signToken, authenticate, requireAdmin };
