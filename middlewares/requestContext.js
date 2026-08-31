const crypto = require('crypto');

function requestContext(req, res, next) {
  req.requestId = crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);

  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const end = process.hrtime.bigint();
    req.latencyMs = Number(end - start) / 1e6;
  });

  next();
}
98c4c6aeb4b36c4f0e63b2b774786c5f95cec2bc26bd8b1e073bb39ebe4bb34a
module.exports = { requestContext };
