// postinstall patch: make the QQ music API always ask the musicu
// GetPlayLyricInfo endpoint for the translation (trans_t=2) and merge it
// into the getLyric response.
//
// Why: the primary /lyric/fcgi-bin/fcg_query_lyric_new.fcg endpoint returns
// an empty trans on success, and the library only falls back to the musicu
// endpoint when the primary payload has a negative business code — so even
// logged-in QQ users never received lyrics translations. This patch requests
// the musicu translation unconditionally (login-aware) and merges its trans
// field when the primary response has none.
//
// Runs automatically after every `npm install`; idempotent.
const fs = require('fs');
const path = require('path');

const targetFile = path.join(
  __dirname,
  '..',
  'node_modules',
  '@sansenjian',
  'qq-music-api',
  'dist',
  'services.cjs'
);

try {
  const source = fs.readFileSync(targetFile, 'utf-8');
  let patched = source;

  // 1. Enable translation on the musicu lyric request (was trans_t: 0).
  patched = patched.replace(/(trans_t: )0(,)/, '$12$2');

  // 2. Before the negative-bizcode fallback, always ask musicu for the
  //    translation and merge it when the primary payload lacks one.
  const marker = 'if (hasNegativeBizCode(payload)) try {';
  const mergeBlock = `// [patch-qmusic-lyric] always fetch musicu translation (login-aware) and merge it.\n\t\ttry {\n\t\t\tconst musicuPayload = await fetchLyricByMusicu({ songmid, songid, loginUin, cookie });\n\t\t\tif (musicuPayload && !hasNegativeBizCode(musicuPayload) && musicuPayload.trans && !payload.trans) {\n\t\t\t\tpayload.trans = musicuPayload.trans;\n\t\t\t}\n\t\t} catch {}\n\t\t`;
  if (!patched.includes('patch-qmusic-lyric')) {
    patched = patched.replace(marker, mergeBlock + marker);
  }

  if (patched !== source) {
    fs.writeFileSync(targetFile, patched);
    console.log('[patch-qmusic-lyric] applied');
  } else {
    console.log('[patch-qmusic-lyric] already applied or marker missing');
  }
} catch (error) {
  console.error('[patch-qmusic-lyric] failed:', error.message);
}
