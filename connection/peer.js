import EventEmitter from 'node:events'
import { createConnection } from 'node:net'
import { buildKeepAliveMessage, handlePeerMessage } from './message.js'

const SOCKET_CONNECTION_MAX_TIME = 3000 // 3s
const HANDSHAKE_MAX_TIME = 5000 // 5s
export class Peer extends EventEmitter {
  constructor (ip, port, id, infoHash, piecesQueue) {
    super()
    this.ip = ip
    this.port = port
    this.id = id
    this.infoHash = infoHash
    this.handshakeAchieved = false
    this.bitfield = null
    this.client = null
    this.connectionTimeout = null
    this.keepAliveInterval = null
    this.piecesQueue = piecesQueue
    this.choked = false
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
      this.connectionTimeout = setTimeout(() => {
        this.disconnect('timeout')
      }, HANDSHAKE_MAX_TIME)

      // send keep alive message every 2 minutes
      this.keepAliveInterval = setInterval(() => this.sendKeepAlive(), 120000)
    })
  }

  sendHandshake () {
    if (this.client.readyState !== 'open') throw new Error('Connection is not open')

    const buff = Buffer.alloc(68, '', 'hex')
    buff.writeUInt8(19)
    buff.write('BitTorrent protocol', 1, 19, 'utf8')
    buff.write(this.infoHash, 28, 20, 'hex')
    if (this.id) buff.write(this.id, 48, 20, 'ascii')
    this.client.write(buff, (err) => {
      console.log('Connection request sent to peer ', this.id)
      if (err) {
        console.error('Error sending handshake: ', err)
      }
    })
  }

  sendKeepAlive () {
    this.client.write(buildKeepAliveMessage)
  }

  choke() {
    this.choked = true
    this.disconnect('choked');
  }

  unchoke() {
    this.choked = false
    // TO DO: request piece
  }

  requestPiece(pieceIndex) {

  }

  disconnect (reason, data) {
    clearInterval(this.keepAliveInterval)
    if(reason) this.emit(reason, data)
    this.client.end()
  }
}

/**
 *
 * @param {Peer} peer
 * @param {Buffer} data
 */
function handleMessage (peer, data) {
  console.log('Data received from peer: ', data)
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
  if (!isTheSameInfoHash(data.subarray(28, 48), peer.infoHash)) {
    console.error(`Error connecting to peer ${peer.id}: Invalid info_hash`)
    throw new Error(`Error connecting to peer ${peer.id}: Invalid info_hash`)
  } else {
    clearTimeout(peer.connectionTimeout)
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
