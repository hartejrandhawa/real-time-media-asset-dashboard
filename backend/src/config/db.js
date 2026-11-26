const mysql = require('mysql2/promise');
require('dotenv').config({ quiet: true });

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'appuser',
  password: process.env.DB_PASSWORD || 'apppassword',
  database: process.env.DB_NAME || 'media_asset_dashboard',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Return DATETIMEs as JS Dates in UTC so the frontend can localise them.
  timezone: 'Z',
});

// Run `fn(conn)` inside a transaction: commit on success, roll back on any
// throw. Used wherever we write an asset row and its audit-log row together,
// so the audit trail can never disagree with the data.
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = pool;
module.exports.withTransaction = withTransaction;
