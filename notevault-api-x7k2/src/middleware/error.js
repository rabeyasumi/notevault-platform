class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const notFound = (req, res) => res.status(404).json({ message: 'Route not found' });

const errorHandler = (err, req, res, next) => {
  if (err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  if (err.name === 'ValidationError') {
    const errors = Object.fromEntries(Object.entries(err.errors).map(([path, e]) => [path, e.message]));
    return res.status(400).json({ message: 'Validation failed', errors });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid value for ${err.path}` });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    return res.status(409).json({ message: `${field} is already in use` });
  }
  console.error(err);
  return res.status(500).json({ message: 'Internal server error' });
};

module.exports = { HttpError, notFound, errorHandler };
