const config = require('./config');
const User = require('./models/User');
const { assertValidPassword, hashPassword } = require('./utils/helpers');

// Render's free tier has no shell, so the first admin is created at startup from env vars.
// If the email already exists the account is left untouched.
const ensureAdmin = async () => {
  const { adminEmail, adminPassword } = config;
  if (!adminEmail || !adminPassword) return;

  assertValidPassword(adminPassword);
  const email = adminEmail.trim().toLowerCase();
  if (await User.exists({ email })) return;

  await User.create({ name: 'Administrator', email, role: 'admin', passwordHash: await hashPassword(adminPassword) });
  console.log(`Admin account created for ${email}`);
};

module.exports = { ensureAdmin };
