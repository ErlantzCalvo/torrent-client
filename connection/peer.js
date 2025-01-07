import EventEmitter from 'node:events'
import fs from 'node:fs'
import { createConnection } from 'node:net'
import { buildKeepAliveMessage, handlePeerMessage } from './message.js'
import { TorrentInfo } from '../torrent/torrentInfo.js' // eslint-disable-line
import { Queue } from '../structures/queue.js' // eslint-disable-line
import { BLOCK_LENGTH } from '../constants.js'
import * as logger from '../logger/logger.js'

const SOCKET_CONNECTION_MAX_TIME = 10000 // 10s
const MAX_TIME_BETWEEN_MESSAGES = 60000 // 15s
const HANDSHAKE_MAX_TIME = 10000 // 10s
const CHOKE_MAX_TIME = 120000 // 2 min
export class Peer extends EventEmitter {
  /**
   *
   * @param {string} ip
   * @param {number} port
   * @param {string} id
   * @param {TorrentInfo} torrent
   * @param {string} peerName
   */
  constructor (ip, port, id, torrent, peerName) {
    super()
    this.ip = ip
    this.port = port
    this.id = id
    this.peerName = peerName
    this.torrent = torrent
    this.handshakeAchieved = false
    this.client = null
    this.connectionTimeout = null
    this.keepAliveInterval = null
    this.choked = true
    this._availablePieces = Array.from({ length: torrent.getPiecesNumber() }, () => 0)
    this.requested = null
    this.peerPerformance = 1
  }

  connect () {
    const peer = this
    this.client = createConnection(this.port, this.ip)
    this._setSocketConnectionTimeout(SOCKET_CONNECTION_MAX_TIME)

    this.client.on('error', (err) => {
      this.disconnect('peer-error', err)
    })

    this.client.on('data', function (data) {
      handleMessage(peer, data)
    })

    this.client.on('timeout', () => {
      this.disconnect('timeout')
    })

    this.client.on('connect', () => {
      this.sendHandshake()
      // send keep alive message every 2 minutes
      this.keepAliveInterval = setInterval(() => this.sendKeepAlive(), 120000)
    })
  }

  sendHandshake () {
    if (this.client.readyState !== 'open') return this.disconnect('peer-error', 'Error making handshake request: socket connection is closed')

    const buff = Buffer.alloc(68, '', 'hex')
    buff.writeUInt8(19)
    buff.write('BitTorrent protocol', 1, 19, 'utf8')
    buff.write(this.torrent.infoHash, 28, 20, 'hex')
    if (this.id) buff.write(this.id, 48, 20, 'ascii')
    this.client.write(buff, (err) => {
      this._setSocketConnectionTimeout(HANDSHAKE_MAX_TIME)
      logger.info('Connection request sent to peer', this.peerName)
      if (err) {
        console.error('Error sending handshake: ', err)
      }
    })
  }

  sendKeepAlive () {
    this.client.write(buildKeepAliveMessage())
  }

  choke () {
    this.choked = true
    this._setSocketConnectionTimeout(CHOKE_MAX_TIME)
  }

  unchoke () {
    this.choked = false
    this.requestNextBlock()
  }

  setAvailablePieces (availablePieces) {
    this._availablePieces = availablePieces
    this.torrent.addPiecesToQueue(availablePieces)
  }

  addAvailablePiece (piece) {
    this._availablePieces[piece] = 1
    this.torrent.addPiecesToQueue([piece])
  }

  requestNextBlock () {
    for (let piece = 0; piece < this._availablePieces.length; piece++) {
      const pieceBlock = this.torrent.getAvailableBlockFromQueue(piece)

      // If piece is not in queue or is already processed go to next piece
      const pieceBlockIsAvailable = pieceBlock && !pieceBlock.requested && !pieceBlock.downloaded
      if (!pieceBlockIsAvailable) continue

      this._requestBlock(pieceBlock)
      pieceBlock.setRequested(20_000, () => {
        pieceBlock.requested = false
      })
      this.requested = pieceBlock
      logger.info(`REQUESTED PIECE: ${this.requested.index} - Begin ${this.requested.begin}`, this.peerName)
      break
    }

    if (!this.requested) this.disconnect('no-new-pieces')
  }

  _handlePiece (payload) {
    const blockLength = this.torrent._queue.getBlockLength(payload.index, payload.begin)
    if (!blockLength) return
    const blockIndex = payload.begin / BLOCK_LENGTH

    this.peerPerformance += Math.sqrt(payload.block.length)
    const offset = payload.index * this.torrent.getPieceLength(payload.index) + payload.begin

    logger.info(`Received block ${blockIndex + 1}/${this.torrent.getBlocksPerPiece(payload.index)} of piece ${payload.index} (bytes: ${payload.block.length})`, this.peerName)

    fs.write(this.torrent.file, payload.block, 0, payload.block.length, offset, (err) => {
      if (err) console.error(err)
    })

    if (payload.block.length >= blockLength) {
      this.torrent._queue.setBlockDownloaded(payload.index, payload.begin)
    } else {
      const newBegin = payload.begin + payload.block.length
      const newlength = blockLength - payload.block.length
      this.torrent._queue.setBlockUnrequested(payload.index, payload.begin)
      this.torrent._queue.updateBlockInfo(payload.index, payload.begin, newlength, newBegin)
    }
    this.torrent.setDownloadedPercentage(payload.block.length)
    this.requested = null

    this.requestNextBlock()
  }

  _requestBlock (block) {
    if (this.choked) return false

    const buf = Buffer.alloc(17)
    buf.writeUInt32BE(13, 0)
    buf.writeUInt8(6, 4)
    buf.writeUInt32BE(block.index, 5)
    buf.writeUInt32BE(block.begin, 9)
    buf.writeUInt32BE(block.length, 13)

    this.client.write(buf)
  }

  _setSocketConnectionTimeout (timeout) {
    clearDisconnectionTimeout(this)
    this.connectionTimeout = setTimeout(() => {
      this.disconnect('timeout')
    }, timeout)
  }

  disconnect (reason, data) {
    this.client.end()
    this.client.destroy()
    if (this.requested) {
      this.requested.removeRequestedTimeout()
      this.requested.requested = false
    }
    clearKeepAliveInterval(this)
    clearDisconnectionTimeout(this)
    if (reason) this.emit(reason, data)
  }
}

/**
 *
 * @param {Peer} peer
 * @param {Buffer} data
 */
function handleMessage (peer, data) {
  peer._setSocketConnectionTimeout(MAX_TIME_BETWEEN_MESSAGES)

  if (!peer.handshakeAchieved) {
    validateHandshake(peer, data)
  } else {
    handlePeerMessage(data, peer)
    /*
            first 4 bytes indicate length -> 0 0 1 60 -> 100111100 -> 316
            316 bytes of payload. The first is the code
            Total: Buffer of length 320 (4 bytes length + 316 bytes payload)
        */
  }
}

/**
 *
 * @param {Peer} peer
 * @param {Buffer} data
 * @returns {boolean}
 */
function validateHandshake (peer, data) {
  if (!isTheSameInfoHash(data.subarray(28, 48), peer.torrent.infoHash)) {
    console.error(`Error connecting to peer ${peer.id}: Invalid info_hash`)
    peer.disconnect('peer-error', 'wrong-handshake')
  } else {
    peer.handshakeAchieved = true
    logger.info('Connected to peer', peer.peerName)
  }
}

/**
 *
 * @param {Buffer} data
 * @param {string} infoHash
 * @returns {boolean}
 */
function isTheSameInfoHash (bufA, infoHash) {
  const bufB = Buffer.from(infoHash, 'hex')
  for (let i = 0; i < 20; i++) {
    if (bufA.readUInt8(i) !== bufB.readUInt8(i)) {
      return false
    }
  }
  return true
}

function clearKeepAliveInterval (peer) {
  clearInterval(peer.keepAliveInterval)
  peer.keepAliveInterval = null
}

function clearDisconnectionTimeout (peer) {
  clearTimeout(peer.connectionTimeout)
  peer.connectionTimeout = null
}
