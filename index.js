import colors from 'colors'
import { TorrentInfo } from './torrent/torrentInfo.js'
import { Peer } from './connection/peer.js'
import {Queue} from './managers/queue.js'

const torrentFile = new TorrentInfo('tests/torrent-files/debian.torrent', true)
// const torrentFile = new TorrentInfo('tests/torrent-files/big-buck-bunny.torrent')
// const torrentFile = new TorrentInfo('tests/torrent-files/test.torrent', true)

const peersInfo = await torrentFile.makeAnnounceRequest()
console.log(colors.green('Peers number:', peersInfo.peers?.length))

let currentPeer = 0
let piecesQueue = new Queue(torrentFile.getPiecesNumber())

connectPeer(peersInfo.peers, currentPeer++)

// const interval = setInterval(() => {
// console.log('Interval')
// }, 5000)

function connectPeer (peers, index) {
  console.log('Connecting to peer ', index)
  const peer = getPeer(peers, index)
  peer.connect()

  peer.on('timeout', () => {
    console.log('Peer timeout: ', index)
    if (index === peers.length) index = -1
    connectPeer(peers, index + 1)
  })

  peer.on('peer-error', (error) => {
    // console.log('Peer connection error: ', index, error)
    if (index === peers.length) index = -1
    connectPeer(peers, index + 1)
  })
}

function getPeer (peers, index) {
  const { ip, port } = peers[index]
  const peerId = peers[index]['peer id']
  return new Peer(ip, port, peerId, torrentFile.infoHash, piecesQueue)
}
