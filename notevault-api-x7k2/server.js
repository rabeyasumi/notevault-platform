const mongoose = require('mongoose');
const config = require('./src/config');
const app = require('./src/app');
const User = require('./src/models/User');
const Note = require('./src/models/Note');
const Post = require('./src/models/Post');
const { ensureAdmin } = require('./src/seedAdmin');

const start = async () => {
  if (!config.mongoUri) throw new Error('MONGODB_URI is not set');
  if (!config.jwtSecret || config.jwtSecret.length < 32) throw new Error('JWT_SECRET must be set and at least 32 characters');

  await mongoose.connect(config.mongoUri);
  // Wait for the schema.index() definitions to be built before serving traffic.
  await Promise.all([User.init(), Note.init(), Post.init()]);
  await ensureAdmin();

  app.listen(config.port, () => console.log(`API listening on port ${config.port}`));
};

start().catch((err) => {
  console.error('Startup failed:', err.message);
  process.exit(1);
});
