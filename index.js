import {TorrentInfo} from './torrent/torrentInfo.js'
import {Peer} from './connection/peer.js'

const torrentFile = new TorrentInfo('tests/torrent-files/debian.torrent')
// const torrentFile = new TorrentInfo('tests/torrent-files/big-buck-bunny.torrent')
// const torrentFile = new TorrentInfo('tests/torrent-files/TGD.torrent')

const peersInfo = await torrentFile.makeAnnounceRequest()
let currentPeer = 0

connectPeer(peersInfo.peers, currentPeer++)

const interval = setInterval(() => {
    console.log('Interval')
  }, 5000)

function connectPeer(peers, index) {
  console.log('Connecting to peer ', index)
  const peer = getPeer(peers, index)
  peer.connect()
  
  peer.on('timeout', ()=>{
    console.log('Peer timeout: ', index)
    connectPeer(peers, index + 1)
  })

  peer.on('peer-error', (error)=>{
    console.log('Peer connection error: ', index, error)
    connectPeer(peers, index + 1)
  })
}


function getPeer(peers, index) {
    const {ip, port} = peers[index]
    const peerId = peers[index]['peer id']
    return new Peer(ip, port, peerId, torrentFile.infoHash) 
}