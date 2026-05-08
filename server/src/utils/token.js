const jwt = require('jsonwebtoken');

function signToken(userId, role) {
  return jwt.sign(
    { sub: userId.toString(), role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { signToken };
