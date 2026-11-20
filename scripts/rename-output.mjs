// vite emits dist/index.html; the deliverable is dist/cto-workbench.html.
import { renameSync, existsSync, readdirSync, statSync } from 'node:fs';
const from = 'dist/index.html';
const to = 'dist/cto-workbench.html';
if (!existsSync(from)) throw new Error('dist/index.html not found');
renameSync(from, to);
const others = readdirSync('dist').filter((f) => f !== 'cto-workbench.html');
if (others.length) throw new Error(`Build produced extra files: ${others.join(', ')}`);
console.log(`${to}: ${(statSync(to).size / 1024).toFixed(0)} KB`);
