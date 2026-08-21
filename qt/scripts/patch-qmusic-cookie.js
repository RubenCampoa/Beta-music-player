// postinstall patch: forward the incoming Cookie header into generic service
// option headers.
//
// Why: the generic controller in server-CdzMPnXx.cjs calls every service with
// `option: {}`, but some services read the QQ cookie exclusively from
// `option.headers.Cookie`. The native client deliberately keeps credentials
// out of request URLs and sends them in the standard Cookie header instead.
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
  const oldReplacement =
    'params,\n\t\t\t\toption: params.cookie ? { headers: { Cookie: params.cookie } } : {}\n\t\t\t});';
  const replacement =
    'params,\n\t\t\t\toption: (ctx.get("Cookie") || params.cookie) ? { headers: { Cookie: ctx.get("Cookie") || params.cookie } } : {}\n\t\t\t});';

  let patched = source;
  if (!patched.includes('ctx.get("Cookie") || params.cookie')) {
    if (patched.includes(oldReplacement)) {
      patched = patched.replace(oldReplacement, replacement);
    } else if (patched.includes(context)) {
      patched = patched.replace(context, replacement);
    } else {
      throw new Error('marker context not found — library layout changed');
    }
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
