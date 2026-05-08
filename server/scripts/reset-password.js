require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.error('Usage: node scripts/reset-password.js <email> <newPassword>');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const users = mongoose.connection.collection('users');
  const passwordHash = await bcrypt.hash(password, 10);
  const result = await users.updateOne({ email: email.toLowerCase() }, { $set: { passwordHash } });

  console.log(
    JSON.stringify({
      email: email.toLowerCase(),
      matched: result.matchedCount,
      modified: result.modifiedCount,
    })
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
