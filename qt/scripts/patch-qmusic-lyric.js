// postinstall patch: make the QQ music API always ask the musicu
// GetPlayLyricInfo endpoint for QRC word timing plus translation, and merge
// both into the getLyric response.
//
// Why: the primary /lyric/fcgi-bin/fcg_query_lyric_new.fcg endpoint returns
// an empty trans on success, and the library only falls back to the musicu
// endpoint when the primary payload has a negative business code — so even
// logged-in QQ users never received QRC or translated lyrics. This patch
// requests both unconditionally (login-aware), keeps encrypted QRC intact for
// the renderer to decrypt, and merges the richer payload.
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

  // 1. Enable translation and QRC word timing.
  if (!/\btrans:\s*1,\s*\n\s*trans_t:/.test(patched)) {
    patched = patched.replace(
      /(\n\s*)(trans_t:\s*)\d+(,)/,
      (_match, indent, key, comma) => `${indent}trans: 1,${indent}${key}0${comma}`
    );
  } else {
    patched = patched.replace(/(trans_t:\s*)\d+(,)/, (_match, key, comma) => `${key}0${comma}`);
  }

  if (!/\bqrc:\s*1,\s*\n\s*qrc_t:/.test(patched)) {
    patched = patched.replace(
      /(\n\s*)(qrc_t:\s*)\d+(,)/,
      (_match, indent, key, comma) => `${indent}qrc: 1,${indent}${key}0${comma}`
    );
  }
  patched = patched.replace(/(crypt:\s*)\d+(,)/, (_match, key, comma) => `${key}1${comma}`);

  // The package normally Base64-decodes lyric blindly. QRC is encrypted hex,
  // so preserve it for qrc-decoder in the renderer.
  patched = patched.replace(
    'const lyricString = decodeLyricField(resData?.lyric);',
    'const lyricString = (Number(resData?.qrc) === 1 || Number(resData?.crypt) === 1) && typeof resData?.lyric === "string" ? resData.lyric : decodeLyricField(resData?.lyric);'
  );
  patched = patched.replace(
    'const lyricString = Number(resData?.qrc) === 1 && typeof resData?.lyric === "string" ? resData.lyric : decodeLyricField(resData?.lyric);',
    'const lyricString = (Number(resData?.qrc) === 1 || Number(resData?.crypt) === 1) && typeof resData?.lyric === "string" ? resData.lyric : decodeLyricField(resData?.lyric);'
  );

  // 1b. Decrypt QRC hex on the server so the Qt client (which has no
  // qrc-decoder) receives plain QRC/LRC text for the Qt client.
  const normalizeDecl = 'var normalizeLyricResponse = (resData, isFormat) => {\n\tconst lyricString =';
  if (patched.includes(normalizeDecl)) {
    patched = patched.replace(normalizeDecl, 'var normalizeLyricResponse = (resData, isFormat) => {\n\tlet lyricString =');
    const lyricLineMarker = '\tconst lyric = isFormat && lyricString ? lyricParse(lyricString) : lyricString;\n\treturn {';
    const lyricLineBlock = '\tif (typeof lyricString === "string" && /^[0-9a-fA-F]+$/.test(lyricString) && lyricString.length % 16 === 0) {\n\t\ttry {\n\t\t\tconst { decryptQrc } = require("qrc-decoder");\n\t\t\tconst decoded = decryptQrc(lyricString);\n\t\t\tif (decoded && decoded.trim()) {\n\t\t\t\tlyricString = decoded;\n\t\t\t}\n\t\t} catch {}\n\t}\n';
    if (patched.includes(lyricLineMarker) && !patched.includes('require("qrc-decoder")')) {
      patched = patched.replace(lyricLineMarker, lyricLineBlock + lyricLineMarker);
    }
  }

  // 1c. Keep a Qt-compatible string lyric under `data` so older Qt builds
  // that read `response.data.lyric` keep working after the sidecar patch.
  const returnMarker = '\treturn {\n\t\t...resData,\n\t\tlyric\n\t};';
  if (patched.includes(returnMarker)) {
    patched = patched.replace(returnMarker,
      '\treturn {\n\t\t...resData,\n\t\tlyric,\n\t\tdata: {\n\t\t\tlyric: lyricString,\n\t\t\ttrans: typeof resData?.trans === "string" ? resData.trans : ""\n\t\t}\n\t};');
  }

  // 2. Before the negative-bizcode fallback, always ask musicu for richer
  //    QRC + translation data and replace the plain primary lyric when found.
  const marker = 'if (hasNegativeBizCode(payload)) try {';
  const mergeBlock = `// [patch-qmusic-lyric] always fetch musicu QRC + translation (login-aware).\n\t\ttry {\n\t\t\tconst musicuPayload = await fetchLyricByMusicu({ songmid, songid, loginUin, cookie });\n\t\t\tif (musicuPayload && !hasNegativeBizCode(musicuPayload)) {\n\t\t\t\tif (Number(musicuPayload.qrc) === 1 && musicuPayload.lyric) {\n\t\t\t\t\tpayload.lyric = musicuPayload.lyric;\n\t\t\t\t\tpayload.qrc = 1;\n\t\t\t\t\tpayload.crypt = musicuPayload.crypt ?? 1;\n\t\t\t\t\tpayload.qrc_t = musicuPayload.qrc_t;\n\t\t\t\t}\n\t\t\t\tif (musicuPayload.trans) payload.trans = musicuPayload.trans;\n\t\t\t}\n\t\t} catch {}\n\t\t`;
  const existingMerge = /\/\/ \[patch-qmusic-lyric\][\s\S]*?\n\t\t} catch \{\}\n\t\t(?=if \(hasNegativeBizCode\(payload\)\) try \{)/;
  if (existingMerge.test(patched)) {
    patched = patched.replace(existingMerge, mergeBlock);
  } else {
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
