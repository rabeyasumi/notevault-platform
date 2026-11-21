require('dotenv').config({ quiet: true });

const stripSlash = (value) => value.trim().replace(/\/+$/, '');

module.exports = {
  port: Number(process.env.PORT) || 5001,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  corsOrigins: (process.env.CORS_ORIGIN || '').split(',').filter(Boolean).map(stripSlash),
  adminEmail: process.env.ADMIN_EMAIL,
  adminPassword: process.env.ADMIN_PASSWORD,
};
