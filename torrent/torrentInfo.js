import fs from 'node:fs'
import colors from 'colors'
import { encode, decode } from '../bencoding/index.js'
import { createHash, randomBytes } from 'node:crypto'
import { hexUrlEncoding } from '../utils.js'
import { createSocket } from 'node:dgram'
import { URL } from 'node:url'

export class TorrentInfo {
  constructor (path, verbose) {
    if (path) {
      this.createTorrentFromFile(path)
      if (verbose) { this.printInfo() }
    }
  }

  createTorrentFromFile (path) {
    const buffer = fs.readFileSync(path)
    const torrentObject = decode(buffer)

    const infoBencoded = encode(torrentObject.info)
    const infoHash = createHash('sha1').update(infoBencoded).digest('hex')
    torrentObject.infoHash = infoHash
    Object.assign(this, torrentObject)
  }

  async makeAnnounceRequest (port) {
    if (isHttpRequest(this.announce)) {
      return fetchHttpAnnounce(this.announce, port, this.infoHash)
    } else if (isUdpRequest(this.announce)) {
      return fetchUdpAnnounce(this.announce, port, this.infoHash)
    } else {
      throw new Error('Unknwon announcer protocol')
    }
  }

  getPiecesNumber() { 
    if(this.info?.pieces?.length) {
        return this.info.pieces.length / 20
    } else {
        return -1
    }
  }

  printInfo () {
    if (this.info) {
      console.log(colors.green('Torrent content:'))
      if (this.info.files) {
        console.log(colors.green('\tFiles number:', this.info.files.length))
        console.log(colors.green('\tFiles:'))
        this.info.files.forEach(file => {
          console.log(colors.blue('\t\t', file.path.join('/'), `${file.length}B`))
        })
      } else {
        console.log(colors.green('\tFile:', this.info.name, `${this.info?.length}B`))
      }
      console.log(colors.green('\tPieces number:', this.info.pieces.length / 20))
      console.log(colors.green('\tPiece size:', `${this.info['piece length'] / 1024}KiB`))
    }
  }
}

function isHttpRequest (urlStr) {
  const url = new URL(urlStr)
  return url.protocol === 'http:' || url.protocol === 'https:'
}

function isUdpRequest (urlStr) {
  const url = new URL(urlStr)
  return url.protocol === 'udp:'
}

async function fetchHttpAnnounce (domain, port, infoHash) {
  const connectionPort = port || 6881
  const infoHashEncoded = hexUrlEncoding(infoHash)
  const url = `${domain}?info_hash=${infoHashEncoded}&peer_id=-TR2940-k8hj0erlnatz&port=${connectionPort}`
  return fetch(url)
    .then(res => res.text())
    .then(text => {
      const buffer = Buffer.from(text, 'ascii')
      const result = decode(buffer)
      return result
    })
    .catch(err => console.log(err))
}

async function fetchUdpAnnounce (domain, port, infoHash) {
  const client = createSocket('udp4')

  const url = new URL(domain)
  const message = buildUdpRequest()
  client.on('message', function (data) {
    console.log(data)
    const response = data.readUInt32BE(0)
    if (response === 0) { // connect

    } else if (response === 1) { // announce

    }
  })

  client.on('error', function (err) {
    console.error(err)
    this.close()
  })

  client.send(message, 0, message.length, url.port, url.hostname, function (err, res) {
    if (err) throw new Error('UDP connection error')
    console.log('UDP connection succed', res)
  })
}

function buildUdpRequest () {
  const buffer = Buffer.alloc(16)

  // connectionId
  buffer.writeUInt32BE(0x417, 0)
  buffer.writeUInt32BE(0x27101980, 4)

  // action: 0 (connect)
  buffer.writeInt32BE(0, 8)

  // transaction id (random)
  randomBytes(4).copy(buffer, 12)
  console.log(buffer)
  return buffer
}
