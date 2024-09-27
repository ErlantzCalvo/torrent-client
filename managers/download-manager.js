import { Peer } from '../connection/peer.js'
import { TorrentInfo } from '../torrent/torrentInfo.js' // eslint-disable-line
import * as logger from '../logger/logger.js'
import { PriorityQueue } from '../structures/priorityQueue.js'

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
    this._availablePeersIndexes = new PriorityQueue()
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
    this.resetAvailablePeers()
    this.refreshPeerConnections()
  }

  refreshPeerConnections () {
    const remainingConnections = Math.min(this.maxPeersNumber - this._connectedPeersNumber, this._availablePeersIndexes.size())
    for (let i = 0; i < remainingConnections; i++) {
      const peerIdx = this._availablePeersIndexes.dequeue()
      this._connectPeer(peerIdx.node)
    }
  }

  stop () {
    clearInterval(this._refreshPeersInterval)
    this._closeAllPeersConections()
  }

  resetAvailablePeers () {
    this._availablePeersIndexes = new PriorityQueue()
    for (const peer in this.peersListInfo.peers) {
      this._availablePeersIndexes.enqueue(Number(peer), 0)
    }
  }

  _connectPeer (peerIdx) {
    logger.info(`Connecting to peer: ${peerIdx}`)
    const peer = this._getPeer(peerIdx)
    peer.connect()
    this._connectedPeers[peerIdx] = peer
    this._connectedPeersNumber++

    peer.on('timeout', () => {
      logger.warning(`Peer timeout: ${peerIdx}`)
      this._handlePeerDisconnectWithTimeout(peerIdx, 'timeout', 10000)
    })

    peer.on('peer-error', () => this._handlePeerError(peerIdx))
    peer.on('choked', () => this._handlePeerDisconnect(peerIdx, 'choked'))
    peer.on('block-request-timeout', () => this._handlePeerDisconnect(peerIdx, 'block-request-timeout'))
    peer.on('no-new-pieces', () => this._handlePeerDisconnect(peerIdx, 'no-new-pieces'))

    return peer
  }

  _handlePeerDisconnect (peerIdx, reason) {
    if (this._connectedPeers[peerIdx]) {
      const peerPriority = this._connectedPeers[peerIdx].piecesRequestsSent
      this._finishPeerConnection(peerIdx, reason)
      this._setPeerAvailable(peerIdx, peerPriority)
    }
    this.refreshPeerConnections()
  }

  _handlePeerDisconnectWithTimeout (peerIdx, reason, timeout) {
    if (this._connectedPeers[peerIdx]) {
      const peerPriority = this._connectedPeers[peerIdx].piecesRequestsSent
      this._finishPeerConnection(peerIdx, reason)
      this._setPeerAvailableAfterSeconds(peerIdx, peerPriority, timeout / 1000)
    }
    this.refreshPeerConnections()
  }

  /**
   * Waits 5 minutes until making the peer available again
   * @param {Number} peerIdx
   */
  _handlePeerError (peerIdx) {
    if (this._connectedPeers[peerIdx]) {
      const peerPriority = this._connectedPeers[peerIdx].piecesRequestsSent
      this._finishPeerConnection(peerIdx, 'peer-error')
      this._setPeerAvailableAfterSeconds(peerIdx, peerPriority, 300)
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

  _setPeerAvailable (peerIdx, priority) {
    this._availablePeersIndexes.enqueue(peerIdx, priority)
  }

  _setPeerAvailableAfterSeconds (peerIdx, priority, seconds) {
    setTimeout(() => {
      this._setPeerAvailable(peerIdx, priority)
    }, seconds * 1000)
  }

  _closeAllPeersConections () {
    Object.keys(this._connectedPeers).forEach(peer => this._finishPeerConnection(peer))
  }
}
