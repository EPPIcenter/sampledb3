import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Database } from 'bun:sqlite';

const DB_PATH = path.resolve(__dirname, '../../sampledb_e2e.sqlite');
const API_PKG_PATH = path.resolve(__dirname, '../../../api');

export async function resetDatabase() {
    console.log('Resetting E2E database...');

    if (fs.existsSync(DB_PATH)) {
        console.log('Clearing existing data...');
        try {
            const db = new Database(DB_PATH);
            // Disable foreign keys to allow deleting in any order
            db.exec('PRAGMA foreign_keys = OFF');

            // Get all tables
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];

            for (const table of tables) {
                db.prepare(`DROP TABLE IF EXISTS "${table.name}"`).run();
            }

            // No need to reset sqlite_sequence as we dropped tables.

            db.exec('PRAGMA foreign_keys = ON');
            db.close();
            console.log('Data cleared.');

            // We used to skip push if tables existed, but that risks schema drift/missing tables.
            // So we will always proceed to push schema to be safe.
            // if (tables.length > 0) {
            //     return;
            // }
            console.log('Database file exists but is empty. Proceeding to push schema.');
        } catch (e) {
            console.error('Failed to truncate database:', e);
            throw e;
        }
    } else {
        console.log('Database does not exist, it will be created by push.');
    }

    console.log('Pushing schema to ensure up-to-date...');
    try {
        execSync(`DATABASE_PATH=${DB_PATH} bun exec drizzle-kit push`, {
            cwd: API_PKG_PATH,
            stdio: 'inherit',
            env: { ...process.env, DATABASE_PATH: DB_PATH }
        });
        console.log('Database schema synced.');
    } catch (error) {
        console.error('Failed to sync schema:', error);
        throw error;
    }
}
