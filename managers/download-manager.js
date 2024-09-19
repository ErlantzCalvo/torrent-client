import { Peer } from '../connection/peer.js'
import { TorrentInfo } from '../torrent/torrentInfo.js' // eslint-disable-line
import * as logger from '../logger/logger.js'

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
    this._refreshPeersInterval = null
    this._availablePeersIndexes = []
  }

  async start () {
    const manager = this
    this.refreshPeers()
    this._refreshPeersInterval = setInterval(() => manager.refreshPeers(), manager.peersListInfo?.interval * 1000 || 900000)
  }

  async fetchPeersList () {
    this.peersListInfo = await this._torrent.requestTorrentPeers()
    this.maxPeersNumber = Math.min(this.maxPeersNumber, this.peersListInfo.peers.length)
  }

  async refreshPeers () {
    this._closeAllPeersConections()
    this._connectedPeers = {}
    this._connectedPeersNumber = 0

    await this.fetchPeersList()
    this._availablePeersIndexes = Array.from(this.peersListInfo.peers, (_, idx) => idx)
    this.refreshPeerConnections()
  }

  refreshPeerConnections () {
    const remainingConnections = Math.min(this.maxPeersNumber - this._connectedPeersNumber, this._availablePeersIndexes.length)
    for (let i = 0; i < remainingConnections; i++) {
      const peerIdx = this._availablePeersIndexes.shift()
      this._connectPeer(peerIdx)
    }
  }

  stop () {
    clearInterval(this._refreshPeersInterval)
    this._closeAllPeersConections()
  }

  _connectPeer (peerIdx) {
    logger.info(`Connecting to peer: ${peerIdx}`)
    const peer = this._getPeer(peerIdx)
    peer.connect()
    this._connectedPeers[peerIdx] = peer
    this._connectedPeersNumber++

    peer.on('timeout', () => {
      logger.warning(`Peer timeout: ${peerIdx}`)
      this._handlePeerDisconnect(peerIdx, 'timeout')
    })

    peer.on('peer-error', () => this._handlePeerError(peerIdx))
    peer.on('choked', () => this._handlePeerDisconnect(peerIdx, 'choked'))
    peer.on('block-request-timeout', () => this._handlePeerDisconnect(peerIdx, 'block-request-timeout'))

    return peer
  }

  _handlePeerDisconnect (peerIdx, reason) {
    if (this._connectedPeers[peerIdx]) {
      this._finishPeerConnection(peerIdx, reason)
      this._setPeerAvailable(peerIdx)
    }
    this.refreshPeerConnections()
  }

  /**
   * Waits 5 minutes until making the peer available again
   * @param {Number} peerIdx
   */
  _handlePeerError (peerIdx) {
    if (this._connectedPeers[peerIdx]) {
      this._finishPeerConnection(peerIdx, 'peer-error')
      this._setPeerAvailableAfterSeconds(peerIdx, 300)
    }
    this.refreshPeerConnections()
  }

  _getPeer (peerIdx) {
    const { ip, port } = this.peersListInfo.peers[peerIdx]
    const peerId = this.peersListInfo.peers[peerIdx]['peer id']
    return new Peer(ip, port, peerId, this._torrent)
  }

  _finishPeerConnection (peerIdx, reason) {
    delete this._connectedPeers[peerIdx]
    this._connectedPeersNumber--
  }

  _setPeerAvailable (peerIdx) {
    this._availablePeersIndexes.push(peerIdx)
  }

  _setPeerAvailableAfterSeconds (peerIdx, seconds) {
    setTimeout(() => {
      this._setPeerAvailable(peerIdx)
    }, seconds * 1000)
  }

  _closeAllPeersConections () {
    Object.keys(this._connectedPeers).forEach(peer => this._finishPeerConnection(peer))
  }
}
