import { Peer } from './peer.js'
import { bytesToDecimal } from '../utils.js'
import colors from 'colors'

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
  console.log(colors.cyan('Message received from peer: ', message.id))

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
    case MESSAGE_TYPES.HAVE:
      break
    case MESSAGE_TYPES.BITFIELD:
      const availablePieces = bitfieldHandler(message.payload)
      peer.setAvailablePieces(availablePieces)
      break
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
function bitfieldHandler (payload) {
  const pieces = []
  payload.forEach((byte, i) => {
    for (let j = 0; j < 8; j++) {
      if (byte % 2) {
        // has piece i * 8 + 7 - j
        pieces.push(i * 8 + 7 - j)
      }
      byte = Math.floor(byte / 2)
    }
  })

  return pieces
}
