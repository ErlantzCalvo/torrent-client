import { Peer } from './peer.js'
import { bytesToDecimal } from '../utils.js'

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
      bitfieldHandler(message.payload)
      break
    case MESSAGE_TYPES.REQUEST:
      break
    case MESSAGE_TYPES.PIECE:
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

function bitfieldHandler (payload) {
  payload.forEach((byte, i) => {
    for (let j = 0; j < 8; j++) {
      if (byte % 2) console.log(byte)
      byte = Math.floor(byte / 2)
    }
  })
}
