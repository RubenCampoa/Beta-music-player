const fs = require('fs')
const os = require('os')
const path = require('path')

const readyFile = process.argv[2]

// Android 上 /tmp 不可写：api-enhanced 初始化时需要往 os.tmpdir() 写
// anonymous_token，这里将 tmpdir 改指向应用私有目录（必须在 require 前覆盖）
const writableTmp = readyFile ? path.dirname(readyFile) : __dirname
os.tmpdir = () => writableTmp

const { server } = require('@neteasecloudmusicapienhanced/api')

// The Android app talks to this process through loopback only.
server.serveNcmApi({
  port: 3000,
  host: '127.0.0.1',
  checkVersion: false,
}).then(() => {
  console.log('[EmbeddedNode] api-enhanced listening on 127.0.0.1:3000')
  if (readyFile) fs.writeFileSync(readyFile, 'ready', 'utf8')
}).catch((error) => {
  console.error('[EmbeddedNode] failed to start api-enhanced', error)
  process.exitCode = 1
})
