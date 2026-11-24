import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const mongoUri = process.env.MONGODB_URI?.trim();
const databaseName = process.env.MONGODB_DB_NAME?.trim();
const args = process.argv.slice(2);
const command = args[0];
const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');

function runMongoTool(tool: 'mongodump' | 'mongorestore', toolArgs: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, toolArgs, { stdio: 'inherit' });
    child.once('error', (error) => reject(new Error(`Unable to start ${tool}: ${error.message}`)));
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${tool} failed${signal ? ` with signal ${signal}` : ` (exit ${code})`}.`));
      }
    });
  });
}

async function main(): Promise<void> {
  if (!mongoUri || !databaseName) {
    throw new Error('Set MONGODB_URI and MONGODB_DB_NAME before running a backup or restore.');
  }

  if (command === 'backup') {
    const backupRoot = path.resolve(args[1] || path.join('.data', 'backups', timestamp));
    fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
    await runMongoTool('mongodump', [
      '--uri',
      mongoUri,
      '--db',
      databaseName,
      '--out',
      backupRoot,
    ]);
    console.info(`[CafeOS] MongoDB backup written to ${backupRoot}`);
    return;
  }

  if (command === 'restore') {
    const backupRoot = args[1] ? path.resolve(args[1]) : '';
    if (!backupRoot || !fs.existsSync(path.join(backupRoot, databaseName))) {
      throw new Error(`Provide a mongodump folder containing "${databaseName}/".`);
    }
    if (!args.includes('--confirm')) {
      throw new Error('Restore replaces matching database collections. Re-run with --confirm.');
    }
    if (!args.includes('--drop')) {
      throw new Error('Restore drops matching target collections. Re-run with both --confirm and --drop.');
    }
    await runMongoTool('mongorestore', [
      '--uri',
      mongoUri,
      '--nsInclude',
      `${databaseName}.*`,
      '--drop',
      backupRoot,
    ]);
    console.info(`[CafeOS] MongoDB restore completed from ${backupRoot}`);
    return;
  }

  throw new Error(
    'Usage: npm run db:backup [backup-folder] | npm run db:restore -- <backup-folder> --confirm --drop'
  );
}

main().catch((error: unknown) => {
  console.error('[CafeOS] MongoDB backup/restore failed:', error);
  process.exitCode = 1;
});
