const { spawn } = require('child_process')
const path = require('path')

const ff = require('ffmpeg-static')
const font = path
  .normalize(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'))
  .replace(/\\/g, '/')
  .replace(/:/g, '\\:')
const line1 = 'Copyright\\@LionKing'
const line2 = 'Register AiMediaTank.com for no watermark'
const fontOpt = `fontfile=${font}:`
const t1 = `text='${line1}':`
const t2 = `text='${line2}':`
const vf = `format=yuv420p,drawtext=${fontOpt}${t1}fontsize=28:fontcolor=white@0.92:box=1:boxcolor=black@0.45:boxborderw=8:x=(w-text_w)/2:y=h-120,drawtext=${fontOpt}${t2}fontsize=22:fontcolor=white@0.88:box=1:boxcolor=black@0.45:boxborderw=6:x=(w-text_w)/2:y=h-68`

const args = [
  '-y',
  '-i',
  'tmp-test.mp4',
  '-map',
  '0:0',
  '-vf',
  vf,
  '-c:v',
  'libx264',
  '-preset',
  'fast',
  '-crf',
  '23',
  '-an',
  '-movflags',
  '+faststart',
  'tmp-out3.mp4',
]

const proc = spawn(ff, args)
let stderr = ''
proc.stderr.on('data', (d) => {
  stderr += d
})
proc.on('close', (code) => {
  console.log('exit', code)
  console.log(stderr.slice(-1500))
})
