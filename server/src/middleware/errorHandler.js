function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  const status = err.status || err.statusCode || 500;
  const message =
    status === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error';
  if (status >= 500) {
    // Keep detailed logs server-side for debugging.
    console.error(err);
  }
  res.status(status).json({ message });
}

module.exports = { errorHandler };
