import { Peer } from './peer.js' // eslint-disable-line
import { bytesToDecimal } from '../utils.js'
import { logMessageReceived } from '../logger/logger.js'

const MESSAGE_TYPES = {
  CHOKE: 0,
  UNCHOKE: 1,
  INTERESTED: 2,
  NOT_INTERESTED: 3,
  HAVE: 4,
  BITFIELD: 5,
  REQUEST: 6,
  PIECE: 7,
  CANCEL: 8
}

/**
 *
 * @param {Buffer} data
 * @param {Peer} peer
 */
export function handlePeerMessage (data, peer) {
  const message = parseMessage(data)
  logMessageReceived(`Message received from peer: ${getMessageTypeById(message.id)}}`)

  switch (message.id) {
    case MESSAGE_TYPES.CHOKE:
      peer.choke()
      break
    case MESSAGE_TYPES.UNCHOKE:
      peer.unchoke()
      break
    case MESSAGE_TYPES.INTERESTED:
      break
    case MESSAGE_TYPES.NOT_INTERESTED:
      break
    case MESSAGE_TYPES.HAVE: {
      const availablePiece = haveHandler(message.payload)
      peer.addAvailablePiece(availablePiece)
      if(!peer.requested) peer.requestNextBlock()
      break
    }
    case MESSAGE_TYPES.BITFIELD: {
      if (message.size === (message.payload.length + 1)) {
        const availablePieces = bitfieldHandler(message.payload)
        peer.setAvailablePieces(availablePieces)
        if(!peer.requested) peer.requestNextBlock()
      } else {
        peer.disconnect('peer-error', 'wrong bitfield size')
      }
      break
    }
    case MESSAGE_TYPES.REQUEST:
      break
    case MESSAGE_TYPES.PIECE:
      peer._handlePiece(message.payload)
      break
    case MESSAGE_TYPES.CANCEL:
      break
  }
}

/**
 *
 * @param {Buffer} data
 */
function parseMessage (data) {
  const message = {
    id: null,
    size: bytesToDecimal(data.subarray(0, 4)),
    payload: null
  }

  if (data.length < 5) return message

  message.id = data.readInt8(4)
  if (data.length > 5) message.payload = data.subarray(5)

  return message
}

export function buildKeepAliveMessage () {
  return Buffer.alloc(4)
}

/**
 * Get peer's available pieces
 * @param {Buffer} payload
 * @returns {number[]} Array of pieces' indexes available
 */
function haveHandler (payload) {
  return payload.readUInt32BE(0)
}

/**
 * Get peer's available pieces
 * @param {Buffer} payload
 * @returns {number[]} Array of pieces' indexes available
 */
function bitfieldHandler (payload) {
  const pieces = new Array(payload.length * 8)
  payload.forEach((byte, i) => {
    for (let j = 0; j < 8; j++) {
      if (byte % 2) {
        // has piece i * 8 + 7 - j
        pieces[i * 8 + 7 - j] = 1
      }
      byte = Math.floor(byte / 2)
    }
  })

  return pieces
}

function getMessageTypeById (msgId) {
  return Object.keys(MESSAGE_TYPES).find(type => MESSAGE_TYPES[type] === msgId)
}
