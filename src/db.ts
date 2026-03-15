export interface Task {
  id: number;
  title: string;
  description: string | null;
  parent_id: number | null;
  deadline: string | null;
  reminder_at: string | null;
  priority: number; // 0, 1, 2, 3
  status: 'pending' | 'ongoing' | 'completed' | 'skipped';
  created_at: string;
}

import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;

export async function getDb() {
  if (db) return db;
  db = await Database.load('sqlite:todos.db');
  return db;
}

export async function initDb() {
  const _db = await getDb();
  
  // Create tasks table
  await _db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      parent_id INTEGER,
      deadline DATETIME,
      reminder_at DATETIME,
      priority INTEGER DEFAULT 3, -- 0: Urgent & Important, 1: Important, 2: Urgent, 3: Normal
      status TEXT DEFAULT 'pending', -- pending, ongoing, completed, skipped
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES tasks (id) ON DELETE CASCADE
    )
  `);
  
  console.log('Database initialized');
}
