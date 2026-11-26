// Errors thrown with an HTTP status are safe to show to the client.
// Anything else is treated as an unexpected 500 and its details stay in the
// server logs, so SQL errors and stack traces never leak to the browser.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}

// Express 5 forwards rejected promises from async handlers to this middleware,
// so routes can just `throw` instead of wrapping everything in try/catch.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // body-parser marks malformed JSON etc. with status + expose
  if (err.expose && err.status && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ error: 'Internal server error' });
}

module.exports = { HttpError, errorHandler };
