import fs from 'node:fs'
import colors from 'colors'
import { encode, decode } from '../bencoding/index.js'
import { createHash } from 'node:crypto'
import { createFolder } from '../utils.js'
import { requestPeers } from '../connection/announceRequester.js'
import { Queue } from '../structures/queue.js'
import { BLOCK_LENGTH, DOWNLOAD_FOLDER } from '../constants.js'
import * as logger from '../logger/logger.js'

export class TorrentInfo {
  constructor (path, verbose) {
    if (path) {
      this.createTorrentFromFile(path)
      this._queue = new Queue(this)
      this._totalBytes = calculateTotalBytesLength(this.info)
      this._downloadedBytes = 0
      this.downloadPath = null
      createFolder(DOWNLOAD_FOLDER)
      this.file = this._getFile()

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
    let peersInfo = null
    let announceUrls = [this.announce.toString('utf8')]
    if (this['announce-list']) {
      announceUrls = this['announce-list']
    }

    announceUrls = announceUrls.map(url => {
      if(Array.isArray(url)) return url[0]
      return url
    })

    for (const announceUrl of announceUrls) {
      try {
        let newPeersInfo = await requestPeers(port, announceUrl, this)
        if(!peersInfo) peersInfo = newPeersInfo
        else if(newPeersInfo.peers) peersInfo.peers = peersInfo.peers.concat(newPeersInfo.peers)

        logger.info(`Retrieved ${peersInfo.peers.length} peers from announcers`)
      } catch (error) {}
    }

    if(peersInfo) return peersInfo
    process.exit(1)   
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

  /**
   *
   * @param {Buffer} piece the whole piece buffer to be checked
   * @param {number} pieceIndex The piece number
   * @returns true if the piece is correct, else false
   */
  isValidPiece (piece, pieceIndex) {
    const pieceHash = this.getPieceHash(pieceIndex)
    const filePieceHash = createHash('sha1').update(piece).digest('hex')

    return pieceHash === filePieceHash
  }

  getPieceHash (pieceIndex) {
    const begin = 20 * pieceIndex
    return this.info.pieces.subarray(begin, begin + 20).toString('hex')
  }

  getDownloadedPiecesNumber () {
    let piecesDownloadedCorrectly = 0
    const PIECE_NUMBER = this.getPiecesNumber()

    const fd = fs.openSync(this.downloadPath, 'r')

    for (let pieceIndex = 0; pieceIndex < PIECE_NUMBER; pieceIndex++) {
      const PIECE_SIZE = this.info['piece length']
      const buffer = Buffer.alloc(PIECE_SIZE)

      const bytesRead = fs.readSync(fd, buffer, 0, PIECE_SIZE, null)
      if (bytesRead === 0) return piecesDownloadedCorrectly

      if (this.isValidPiece(buffer, pieceIndex)) {
        piecesDownloadedCorrectly++
      }
    }

    return piecesDownloadedCorrectly
  }

  _getFile () {
    const filePath = this.downloadPath + '/' + this.info.name
    if (fs.existsSync(filePath)) {
      return this._setDownloadedPiecesOfFile(filePath, this.info)
    } else {
      return createFile(this.downloadPath, this.info)
    }
  }

  _setDownloadedPiecesOfFile () {
    if (this.info.files) {
      this.downloadPath = this.downloadPath + '/' + this.info.name + '/' + this.info.name + '.temp'      
    } else {
      this.downloadPath = this.downloadPath + '/' + this.info.name
    }
    const PIECE_NUMBER = this.getPiecesNumber()
    const torrent = this

    const fd = fs.openSync(this.downloadPath, 'r+')

    for (let pieceIndex = 0; pieceIndex < PIECE_NUMBER; pieceIndex++) {
      this._queue.push(pieceIndex)

      const PIECE_SIZE = this.info['piece length']
      const buffer = Buffer.alloc(PIECE_SIZE)

      const bytesRead = fs.readSync(fd, buffer, 0, PIECE_SIZE, null)
      if (bytesRead === 0) return fd

      if (this.isValidPiece(buffer, pieceIndex)) {
        const blocksNumber = this.getBlocksPerPiece(pieceIndex)

        for (let blockIndex = 0; blockIndex < blocksNumber; blockIndex++) {
          const BLOCK_SIZE = this.getBlockLength(pieceIndex, blockIndex)
          this._queue.setBlockDownloaded(pieceIndex, blockIndex * BLOCK_SIZE)
          torrent.setDownloadedPercentage(BLOCK_SIZE)
        }
      }
    }

    return fd
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


function createFile (downloadFolder, torrentInfo) {
  if (torrentInfo.files) {
    fs.mkdirSync(`${downloadFolder}/${torrentInfo.name}/`, { recursive: true })
    torrentInfo.downloadPath = `${downloadFolder}/${torrentInfo.name}/${torrentInfo.name}.temp`
    return fs.openSync(`${downloadFolder}/${torrentInfo.name}/${torrentInfo.name}.temp`, 'w')
  } else {
    torrentInfo.downloadPath = downloadFolder + '/' + torrentInfo.name
    return fs.openSync(downloadFolder + '/' + torrentInfo.name, 'w')
  }
}

function calculateTotalBytesLength (torrentInfo) {
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
