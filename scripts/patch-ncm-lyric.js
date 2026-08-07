// postinstall patch: enable NetEase YRC (word-level karaoke lyrics) and
// translation in the bundled @neteasecloudmusicapienhanced/api lyric_new module.
//
// The module requests /api/song/lyric/v1 with tv: 0 / yv: 0, which makes the
// upstream omit the tlyric and yrc fields. Setting both to -1 (the same
// convention the package's own lyric.js uses for lrc) makes the API return
// tlyric + yrc so the app can render word-by-word karaoke lyrics.
//
// This runs automatically after every `npm install`; the replacement is
// idempotent (the target string no longer matches once patched).
const fs = require('fs');
const path = require('path');

const targetFile = path.join(
  __dirname,
  '..',
  'node_modules',
  '@neteasecloudmusicapienhanced',
  'api',
  'module',
  'lyric_new.js'
);

try {
  const source = fs.readFileSync(targetFile, 'utf-8');
  let patched = source;
  patched = patched.replace(/(\n\s*)tv: 0,/, '$1tv: -1,');
  patched = patched.replace(/(\n\s*)yv: 0,/, '$1yv: -1,');
  if (patched !== source) {
    fs.writeFileSync(targetFile, patched);
    console.log('[patch-ncm-lyric] Enabled tlyric + yrc (逐字歌词) in lyric_new.js');
  } else {
    console.log('[patch-ncm-lyric] lyric_new.js already patched (or pattern not found)');
  }
} catch (err) {
  console.warn('[patch-ncm-lyric] Skipped:', err.message);
}
