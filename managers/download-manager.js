import { Peer } from '../connection/peer.js'
import { TorrentInfo } from '../torrent/torrentInfo.js'
import colors from 'colors'

export class DownloadManager {
  /**
   *
   * @param {TorrentInfo} torrent
   * @param {number} maxPeersNumber
   */
  constructor (torrent, maxPeersNumber) {
    this._torrent = torrent
    this.maxPeersNumber = maxPeersNumber
    this.peersListInfo = null
    this._connectedPeers = {}
    this._connectedPeersNumber = 0
    this._lastPeerIndex = 0
    this._refreshPeersInterval = null
  }

  async start () {
    const manager = this
    this.refreshPeers()
    this._refreshPeersInterval = setInterval(() => manager.refreshPeers(), manager.peersListInfo?.interval * 1000 || 900000)
  }

  async fetchPeersList () {
    this.peersListInfo = await this._torrent.makeAnnounceRequest()
  }

  async refreshPeers () {
    await this.fetchPeersList()
    this.refreshPeerConnections()
  }

  refreshPeerConnections () {
    const remainingConnections = this.maxPeersNumber - this._connectedPeersNumber
    for (let i = 0; i < remainingConnections; i++) {
      const newPeer = this._connectPeer(this._lastPeerIndex, this.peersListInfo)
      this._connectedPeers[this._lastPeerIndex] = newPeer
      this._increasePeerIndex()
      this._connectedPeersNumber++
    }
  }

  stop () {
    clearInterval(this._refreshPeersInterval)
    this._closeAllPeersConections()
  }

  _increasePeerIndex () {
    this._lastPeerIndex++
    if (this._lastPeerIndex >= this.peersListInfo.peers.length) this._lastPeerIndex = 0
  }

  _connectPeer (peerIdx) {
    console.log('Connecting to peer ', peerIdx)
    const peer = this._getPeer(peerIdx)
    peer.connect()

    peer.on('timeout', () => {
      console.log(colors.yellow('Peer timeout: ', peerIdx))
      this._handlePeerDisconnect(peerIdx)
    })

    peer.on('peer-error', () => this._handlePeerDisconnect(peerIdx))
    peer.on('choked', () => this._handlePeerDisconnect(peerIdx))

    return peer
  }

  _handlePeerDisconnect (peerIdx) {
    this._finishPeerConnection(peerIdx)
    this.refreshPeerConnections()
  }

  _getPeer (peerIdx) {
    const { ip, port } = this.peersListInfo.peers[peerIdx]
    const peerId = this.peersListInfo.peers[peerIdx]['peer id']
    return new Peer(ip, port, peerId, this._torrent)
  }

  _finishPeerConnection (peerIdx) {
    if (this._connectedPeers[peerIdx]) {
      delete this._connectedPeers[peerIdx]
      this._connectedPeersNumber--
    }
  }

  _closeAllPeersConections () {
    Object.keys(this._connectedPeers).forEach(peer => this._finishPeerConnection(peer))
  }
}
