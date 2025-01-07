import { randomBytes } from 'node:crypto'
import { hexUrlEncoding, bigNumsTo8BytesBufferConversor, bytesToDecimal } from '../utils.js'
import { createSocket } from 'node:dgram'
import { decode } from '../bencoding/index.js'
import * as logger from '../logger/logger.js'
import { URL } from 'node:url'

const UDP_RESPONSES = {
  connect: 0,
  announce: 1,
  error: 3
}

export async function requestPeers (port, url, torrent) {
  try {
    const result = await makeAnnounceRequest(url.toString('utf8'), port, torrent)
    return result
  } catch (err) {
    logger.error('Unable to get the peers from announcer: ' + url)
    throw new Error('Unable to get Peers')
  }
}

function isHttpRequest (urlStr) {
  const url = new URL(urlStr)
  return url.protocol === 'http:' || url.protocol === 'https:'
}

async function makeAnnounceRequest (url, port, torrent) {
  return new Promise((resolve, reject) => {
    fetchUdpAnnounce(url, torrent)
      .then(resolve)
      .catch(() => {
        fetchHttpAnnounce(url, port, torrent.infoHash)
          .then(resolve)
          .catch(reject)
      })
  })
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

// https://www.bittorrent.org/beps/bep_0015.html
async function fetchUdpAnnounce (domain, torrent, retries = 4) {
  return new Promise((resolve, reject) => {
    const url = new URL(domain)
    const message = buildUdpRequest()
    const client = createSocket('udp4')
    const transactionId = bytesToDecimal(message.subarray(12))
    let socketTimeout = null

    client.on('error', function (err) {
      console.error(err)
      this.close()
      reject(err)
    })

    sendUDPMessage(client, message, url, () => {
      socketTimeout = setTimeout(() => {
        if (retries > 0) fetchUdpAnnounce(domain, torrent, retries - 1).then(resolve).catch(reject)
        else reject('UDP timeout')
      }, 3000)
    })

    client.on('message', function (data) {
      const responseType = data.readUInt32BE(0)
      clearTimeout(socketTimeout)
      if (responseType === UDP_RESPONSES.connect) {
        const connectionInfo = handleConnectionResponse(data)

        if (isValidConnectResponse(data, connectionInfo, transactionId)) {
          const announcerequest = buildAnnounceRequest(connectionInfo.connectionId, torrent)
          sendUDPMessage(client, announcerequest, url, () => {
            socketTimeout = setTimeout(() => {
              if (retries > 0) fetchUdpAnnounce(domain, torrent, retries - 1).then(resolve).catch(reject)
              else reject(new Error('UDP timeout'))
            }, 30000)
          })
        } else {
          reject('UDP connection transaction ID does not match')
        }
      } else if (responseType === UDP_RESPONSES.announce) {
        const peersInfo = parseUDPAnnounceResponse(data)
        resolve(peersInfo)
      } else if (responseType === UDP_RESPONSES.error) {
        if (retries > 0) fetchUdpAnnounce(domain, torrent, retries - 1).then(resolve).catch(reject)
        else reject('UDP connection error')
      }
    })
  })
}

function sendUDPMessage (socket, message, url, callback = () => {}) {
  socket.send(message, 0, message.length, url.port, url.hostname, callback)
}

function buildUdpRequest () {
  const buffer = Buffer.allocUnsafe(16)

  // connectionId
  buffer.writeUInt32BE(0x417, 0)
  buffer.writeUInt32BE(0x27101980, 4)

  // action: 0 (connect)
  buffer.writeInt32BE(0, 8)

  // transaction id (random)
  randomBytes(4).copy(buffer, 12)
  return buffer
}

function handleConnectionResponse (response) {
  return {
    action: response.readUInt32BE(0),
    transactionId: response.readUInt32BE(4),
    connectionId: response.slice(8)
  }
}

function isValidConnectResponse (data, connectionInfo, transactionId) {
  return data.length >= 16 && connectionInfo.transactionId === transactionId
}

function buildAnnounceRequest (connectionId, torrent, port = 6881) {
  const buf = Buffer.allocUnsafe(98)

  // connection id
  connectionId.copy(buf, 0)
  // action
  buf.writeUInt32BE(1, 8)
  // transaction id
  randomBytes(4).copy(buf, 12)
  // info hash
  buf.write(torrent.infoHash, 16, 'hex')
  // torrentParser.infoHash(torrent).copy(buf, 16);
  // peerId
  randomBytes(20).copy(buf, 36)
  // downloaded
  Buffer.alloc(8).copy(buf, 56)
  // left
  buf.writeUint32BE(torrent._totalBytes, 64)

  const sizeIn8BytesBuff = bigNumsTo8BytesBufferConversor(torrent._totalBytes)

  sizeIn8BytesBuff.copy(buf, 64)
  // uploaded
  Buffer.alloc(8).copy(buf, 72)
  // event
  buf.writeUInt32BE(0, 80)
  // ip address
  buf.writeUInt32BE(0, 84)
  // key
  randomBytes(4).copy(buf, 88)
  // num want
  buf.writeInt32BE(-1, 92)
  // port
  buf.writeUInt16BE(port, 96)

  return buf
}

function parseUDPAnnounceResponse (data) {
  function group (iterable, groupSize) {
    const groups = []
    for (let i = 0; i < iterable.length; i += groupSize) {
      groups.push(iterable.slice(i, i + groupSize))
    }
    return groups
  }

  return {
    action: data.readUInt32BE(0),
    transactionId: data.readUInt32BE(4),
    leechers: data.readUInt32BE(8),
    seeders: data.readUInt32BE(12),
    peers: group(data.slice(20), 6).map(address => {
      return {
        ip: address.slice(0, 4).join('.'),
        port: address.readUInt16BE(4)
      }
    })
  }
}
