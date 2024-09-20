import fs from 'node:fs'
import colors from 'colors'
import { encode, decode } from '../bencoding/index.js'
import { createHash, randomBytes } from 'node:crypto'
import { hexUrlEncoding } from '../utils.js'
import { createSocket } from 'node:dgram'
import { URL } from 'node:url'
import { Queue } from '../managers/queue.js'
import { BLOCK_LENGTH } from '../constants.js'

export class TorrentInfo {
  constructor (path, verbose) {
    if (path) {
      this.createTorrentFromFile(path)
      this._queue = new Queue(this)
      this.file = createFile(this.info)
      this._totalBytes = getTotalBytesLength(this.info)
      this._downloadedBytes = 0

      if (verbose) { this.printInfo() }
    }
  }

  createTorrentFromFile (path) {
    const buffer = fs.readFileSync(path)
    const torrentObject = decode(buffer)

    const infoBencoded = encode(torrentObject.info)
    const infoHash = createHash('sha1').update(infoBencoded).digest('hex')
    torrentObject.infoHash = infoHash
    console.log(torrentObject.info)
    Object.assign(this, torrentObject)
  }

  async requestTorrentPeers (port) {
    let announceUrls = [this.announce]
    if (this['announce-list']) {
      announceUrls = this['announce-list']
    }
    for (const announceUrl of announceUrls) {
      let result
      try {
        console.log('requesting ' + announceUrl)
        result = await makeAnnounceRequest(announceUrl, port, this.infoHash)
        return result
      } catch (error) {
        // console.error('no success:', error)
      }
    }

    return {
      interval: 900000,
      peers: []
    }
  }

  getPiecesNumber () {
    if (this.info?.pieces?.length) {
      return this.info.pieces.length / 20
    } else {
      return -1
    }
  }

  /**
   * returns the size of the given piece in Bytes
   * @param {number} pieceIndex
   */
  getPieceLength (pieceIndex) {
    if (!this.info) return -1

    const pieceLength = this.info['piece length']
    if (pieceIndex < this.getPiecesNumber()) {
      return pieceLength
    } else {
      // return the length of the last piece
      return this.info.length % pieceLength
    }
  }

  /**
   * returns the size of the given block for the given piece in Bytes
   * @param {number} blockIndex
   */
  getBlockLength (pieceIndex, blockIndex) {
    if (!this.info) return -1

    const pieceLength = this.getPieceLength(pieceIndex)
    const lastPieceLength = pieceLength % BLOCK_LENGTH
    const lastPieceIndex = Math.floor(pieceLength / this.BLOCK_LEN)

    if (blockIndex === lastPieceIndex) {
      return lastPieceLength
    } else {
      return BLOCK_LENGTH
    }
  }

  getBlocksPerPiece = (pieceIndex) => {
    const pieceLength = this.getPieceLength(pieceIndex)
    return Math.ceil(pieceLength / BLOCK_LENGTH)
  }

  /**
   *
   * @returns the total number of block that compose this torrent
   */
  getBlocksNumber () {
    return Math.floor(this.info.length / BLOCK_LENGTH)
  }

  getAvailableBlockFromQueue (pieceIndex) {
    return this._queue.popPieceBlock(pieceIndex)
  }

  /**
   * Add pieces to queue if the pieces are not already there
   * @param {number[]} pieces
   */
  addPiecesToQueue (pieces) {
    for (let piece = 0; piece < pieces.length; piece++) {
      if (!this._queue.has(piece) && pieces[piece] === 1) this._queue.push(piece)
    }
  }

  isLastBlockOfPiece (pieceIndex, blockIndex) {
    const blocksNumber = this.getBlocksPerPiece(pieceIndex)
    return blockIndex === (blocksNumber - 1)
  }

  setDownloadedPercentage (bytes) {
    this._downloadedBytes += bytes
    this._printDownloadProgress()
  }

  _printDownloadProgress () {
    const percentage = (this._downloadedBytes / this._totalBytes) * 100
    console.log(colors.magenta(`Download progress: ${percentage.toFixed(3)}%`))
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

function makeAnnounceRequest (url, port, infoHash) {
  if (isHttpRequest(url)) {
    return fetchHttpAnnounce(url, port, infoHash)
  } else if (isUdpRequest(url)) {
    return fetchUdpAnnounce(url, port, infoHash)
  } else {
    throw new Error('Unknwon announcer protocol')
  }
}

async function fetchHttpAnnounce (domain, port, infoHash) {
  const connectionPort = port || 6881
  const infoHashEncoded = hexUrlEncoding(infoHash)
  const url = `${domain}?info_hash=${infoHashEncoded}&peer_id=-TR2940-k8hj0erlantz&port=${connectionPort}`
  return fetch(url)
    .then(res => res.text())
    .then(text => {
      const buffer = Buffer.from(text, 'ascii')
      return decode(buffer)
    })
}

async function fetchUdpAnnounce (domain, port, infoHash) {
  return new Promise((resolve, reject) => {
    const url = new URL(domain)
    const message = buildUdpRequest()
    const client = createSocket('udp4')

    client.on('error', function (err) {
      console.error(err)
      this.close()
      reject(err)
    })

    client.send(message, 0, message.length, url.port, url.host, function (err, res) {
      if (err) reject('UDP connection error')
      else console.log('UDP connection succed', res)
    })

    client.on('message', function (data) {
      const response = data.readUInt32BE(0)
      if (response === 0) { // connect

      } else if (response === 1) { // announce

      }
      resolve(data)
    })
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

function createFile (torrentInfo) {
  const dir = 'Downloads'
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }

  if (torrentInfo.files) {
    torrentInfo.files.forEach(file => {
      const fileName = file.path?.pop()
      const filePath = file.path?.join('/')
      fs.mkdirSync(dir + '/' + filePath, { recursive: true })
      return fs.openSync(dir + '/' + filePath + '/' + fileName, 'w')
    })
  } else {
    return fs.openSync(dir + '/' + torrentInfo.name, 'w')
  }
}

function getTotalBytesLength (torrentInfo) {
  if (torrentInfo.files) {
    let size = 0
    torrentInfo.files.forEach(file => {
      size += file.length
    })

    return size
  } else {
    return torrentInfo.length
  }
}
