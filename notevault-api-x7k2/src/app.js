const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoose = require('mongoose');
const config = require('./config');
const { notFound, errorHandler } = require('./middleware/error');

// Operators ($ne, $gt, ...) smuggled into query values are neutralised before they reach MongoDB.
mongoose.set('sanitizeFilter', true);

const app = express();

app.set('trust proxy', 1); // Render sits behind a proxy; needed for correct client IPs in rate limiting
app.use(helmet());
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '10kb' }));
app.use((req, res, next) => {
  req.body ??= {};
  next();
});

app.get('/health', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ status: dbUp ? 'ok' : 'database unavailable' });
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/notes', require('./routes/notes.routes'));
app.use('/api/posts', require('./routes/posts.routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
