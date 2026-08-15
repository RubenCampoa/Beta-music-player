// postinstall patch: forward the `cookie` query parameter into the service
// option headers on every API route.
//
// Why: the generic controller in server-CdzMPnXx.cjs calls every service with
// `option: {}`, but the services (getLyric, getMusicPlay, user APIs…) read the
// QQ cookie exclusively from `option.headers.Cookie` via getCookieFromOptions.
// The app sends `&cookie=...` in the query string, which lands in `params` and
// is silently ignored — so logged-in users never got VIP playback or lyric
// translations. This patch maps query.cookie → option.headers.Cookie.
//
// Runs automatically after every `npm install`; idempotent.
const fs = require('fs');
const path = require('path');

const distDir = path.join(
  __dirname,
  '..',
  'node_modules',
  '@sansenjian',
  'qq-music-api',
  'dist'
);

let targetFile = path.join(distDir, 'server-CdzMPnXx.cjs');
if (!fs.existsSync(targetFile) && fs.existsSync(distDir)) {
  const match = fs.readdirSync(distDir).find(f => f.startsWith('server-') && f.endsWith('.cjs'));
  if (match) targetFile = path.join(distDir, match);
}

try {
  const source = fs.readFileSync(targetFile, 'utf-8');
  const marker = 'option: {}';
  const context =
    'params,\n\t\t\t\t' + marker + '\n\t\t\t});';
  const replacement =
    'params,\n\t\t\t\toption: params.cookie ? { headers: { Cookie: params.cookie } } : {}\n\t\t\t});';

  let patched = source;
  if (!patched.includes('params.cookie ? { headers')) {
    if (!patched.includes(context)) {
      console.error('[patch-qmusic-cookie] marker context not found — library layout changed?');
      process.exit(0);
    }
    patched = patched.replace(context, replacement);
  }

  if (patched !== source) {
    fs.writeFileSync(targetFile, patched);
    console.log('[patch-qmusic-cookie] applied');
  } else {
    console.log('[patch-qmusic-cookie] already applied or marker missing');
  }
} catch (error) {
  console.error('[patch-qmusic-cookie] failed:', error.message);
}
