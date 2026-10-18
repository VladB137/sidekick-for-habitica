// A local stand-in for habitica.com's API, built on Habitica's OWN game code (via tools/harness),
// for end-to-end tests of the app without touching a real account. The state and routes live in
// tools/mock/habitica-mock.mjs (shared with the simulator); this serves them over HTTP.
//
//   npm run harness -- ../habitica && node tools/mock-server.mjs [--port 3001] [--class warrior] [--level 24] [--rate 30]
//   Credentials: User ID 00000000-0000-4000-8000-000000000001, API Token 00000000-0000-4000-8000-00000000c0de
//   Test hooks: POST /mock/reset?class=wizard&level=30, POST /mock/new-day, GET /mock/state,
//               POST /mock/set {stats, items, user, party, members, dropRoll}, POST /mock/fail {path, query?, status, error, message, times} ({clear: true} drops them),
//               POST /mock/score-elsewhere {taskId, direction} (a tap in another app), POST /mock/delete-task {taskId},
//               POST /mock/task {taskId, ...fields}, POST /mock/add-task {type, text, ...fields}, POST /mock/clear-tasks
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createMock, USER_ID, API_TOKEN } from './mock/habitica-mock.mjs';

const require = createRequire(import.meta.url);
const H = require('./harness/load.cjs');
const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map(s => s.trim().split(/\s+/)));
const PORT = Number(args.port || process.env.PORT || 3001);
const mock = createMock(H, { rate: Number(args.rate || 30), cls: args.class || 'warrior', level: Number(args.level || 24) }); // live server: 30 requests per 60 s per user

createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const out = await mock.handle({ method: req.method, path: req.url, headers: req.headers, body });
  res.writeHead(out.status, out.headers);
  res.end(out.body);
}).listen(PORT, '127.0.0.1', () => console.log(`mock Habitica (${H.version} game code) on http://127.0.0.1:${PORT}  user ${USER_ID} token ${API_TOKEN}`));
