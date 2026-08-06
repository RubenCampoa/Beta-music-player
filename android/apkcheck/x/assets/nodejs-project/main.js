const { server } = require('@neteasecloudmusicapienhanced/api')
const fs = require('fs')

const readyFile = process.argv[2]

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
