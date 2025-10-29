import dotenv from 'dotenv';
import app from './app.js';
import pool from './db.js';

dotenv.config({ path: './config.env' });

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});