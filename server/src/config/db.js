const mongoose = require('mongoose');

function validateMongoUri(uri) {
  const u = uri.trim();
  const at = u.lastIndexOf('@');
  if (at === -1) return false;
  const afterAt = u.slice(at + 1).replace(/^\/+/, '');
  // Must have a hostname (not empty after @)
  return /^[a-zA-Z0-9.-]+/.test(afterAt);
}

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri?.trim()) {
    throw new Error('MONGODB_URI is not set');
  }
  if (!validateMongoUri(uri)) {
    throw new Error(
      'MONGODB_URI is missing the cluster host after @. Expected format: mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/DATABASE?retryWrites=true&w=majority (special characters in USER/PASS must be URL-encoded).'
    );
  }
  await mongoose.connect(uri);
  return mongoose.connection;
}

module.exports = { connectDB };
