import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../database.sqlite');
export const db = new Database(dbPath);

export function initDb() {
  const schema = fs.readFileSync(path.resolve(__dirname, './schema.sql'), 'utf-8');
  db.exec(schema);
}
