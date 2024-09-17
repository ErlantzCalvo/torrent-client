import EventEmitter from 'node:events'
import fs from 'node:fs'
import { createConnection } from 'node:net'
import { buildKeepAliveMessage, handlePeerMessage } from './message.js'
import { TorrentInfo } from '../torrent/torrentInfo.js' // eslint-disable-line
import { Queue } from '../managers/queue.js' // eslint-disable-line
import { BLOCK_LENGTH } from '../constants.js'

const SOCKET_CONNECTION_MAX_TIME = 15000 // 15s
const HANDSHAKE_MAX_TIME = 5000 // 5s
export class Peer extends EventEmitter {
  /**
   *
   * @param {string} ip
   * @param {number} port
   * @param {string} id
   * @param {TorrentInfo} torrent
   * @param {Queue} piecesQueue
   */
  constructor (ip, port, id, torrent, piecesQueue) {
    super()
    this.ip = ip
    this.port = port
    this.id = id
    this.torrent = torrent
    this.handshakeAchieved = false
    this.bitfield = null
    this.client = null
    this.connectionTimeout = null
    this.keepAliveInterval = null
    this.piecesQueue = piecesQueue
    this.choked = true
    this._availablePieces = []
    this.requested = null
  }

  connect () {
    const peer = this
    this.client = createConnection(this.port, this.ip)
    this.client.setTimeout(SOCKET_CONNECTION_MAX_TIME)

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
      this.connectionTimeout = setTimeout(() => {
        this.disconnect('timeout')
      }, HANDSHAKE_MAX_TIME)
      console.log('Connection request sent to peer ', this.id)
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
    this.disconnect('choked')
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
    this._availablePieces.push(piece)
    this.torrent.addPiecesToQueue([piece])
  }

  requestNextBlock () {
    for (let piece = 0; piece < this._availablePieces.length; piece++) {

      const pieceBlock = this.torrent.getAvailableBlockFromQueue(piece)
      
      // If piece is not in queue or is already processed go to next piece
      const pieceBlockIsAvailable = pieceBlock && !pieceBlock.requested && !pieceBlock.downloaded
      if (!pieceBlockIsAvailable) continue

      this._requestBlock(pieceBlock)
      pieceBlock.setRequested(20_000, () => this.disconnect('block-request-timeout'));
      this.requested = pieceBlock
      break
    }
    console.log('REQUESTED PIECE ', this.requested)
  }

  _handlePiece (payload) {
    // if is the last block of the current piece, do not continue asking for the piece
    const blockIndex = this.requested.begin / BLOCK_LENGTH
    const offset = this.requested.index * this.torrent.getPieceLength(this.requested.index) + this.requested.begin
    console.log(`Received block ${blockIndex + 1}/${this.torrent.getBlocksPerPiece(this.requested.index)} of piece ${this.requested.index} (offset: ${offset})`)

    fs.write(this.torrent.file, payload, 0, payload.length, offset, (err)=>{
      if(err) console.error(err)
    })
    this.requested.setDownloaded()
    this.torrent.setDownloadedPercentage(this.requested.length)
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

  disconnect (reason, data) {
    clearInterval(this.keepAliveInterval)
    if (reason) this.emit(reason, data)
    this.client.end()
  }
}

/**
 *
 * @param {Peer} peer
 * @param {Buffer} data
 */
function handleMessage (peer, data) {
  clearTimeout(peer.connectionTimeout)
  peer.connectionTimeout = null

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
    console.log('Connected to peer ', peer.id)
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
