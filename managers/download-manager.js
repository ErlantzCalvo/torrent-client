import { Peer } from '../connection/peer.js'
import { TorrentInfo } from '../torrent/torrentInfo.js' // eslint-disable-line
import * as logger from '../logger/logger.js'
import { PriorityQueue } from '../structures/priorityQueue.js'
import { namesList } from '../constants.js'

export class DownloadManager {
  /**
   *
   * @param {TorrentInfo} torrent
   * @param {number?} maxPeersNumber
   */
  constructor (torrent, maxPeersNumber) {
    this._torrent = torrent
    this.maxPeersNumber = maxPeersNumber || Infinity
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

  checkDownload () {
    if (this._isDownloadComplete()) {
      // handle download complete
      this._closeAllPeersConections()
    }
  }

  _connectPeer (peerIdx) {
    const peer = this._getPeer(peerIdx)
    if (!peer) return null
    
    logger.info(`Connecting to peer ${peer.peerName}`)

    peer.connect()
    this._connectedPeers[peerIdx] = peer
    this._connectedPeersNumber++

    peer.on('timeout', () => {
      logger.warning('Peer timeout', peer.peerName)
      const timeout = 10000 / (this._connectedPeers[peerIdx]?.peerPerformance || 1)
      this._handlePeerDisconnectWithTimeout(peerIdx, 'timeout', timeout)
    })

    peer.on('peer-error', () => this._handlePeerError(peerIdx))
    peer.on('choked', () => this._handlePeerDisconnect(peerIdx, 'choked'))
    peer.on('block-request-timeout', () => this._handlePeerDisconnect(peerIdx, 'block-request-timeout'))
    peer.on('no-new-pieces', () => {
      this.checkDownload()
      this._handlePeerDisconnectWithTimeout(peerIdx, 'no-new-pieces', 3600000)
    })

    return peer
  }

  _handlePeerDisconnect (peerIdx, reason) {
    if (this._connectedPeers[peerIdx]) {
      const peerPriority = this._connectedPeers[peerIdx]?.peerPerformance
      this._finishPeerConnection(peerIdx, reason)
      this._setPeerAvailable(peerIdx, peerPriority)
    }
    this.refreshPeerConnections()
  }

  _handlePeerDisconnectWithTimeout (peerIdx, reason, timeout) {
    if (this._connectedPeers[peerIdx]) {
      const peerPriority = this._connectedPeers[peerIdx]?.peerPerformance
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
      const peerPriority = this._connectedPeers[peerIdx]?.peerPerformance
      this._finishPeerConnection(peerIdx, 'peer-error')
      this._setPeerAvailableAfterSeconds(peerIdx, peerPriority, 300)
    }
    this.refreshPeerConnections()
  }

  _getPeer (peerIdx) {
    if (!this.peersListInfo.peers[peerIdx]) return null
    const { ip, port } = this.peersListInfo.peers[peerIdx]
    const peerId = this.peersListInfo.peers[peerIdx]['peer id']
    const peerName = namesList[peerIdx]
    return new Peer(ip, port, peerId, this._torrent, peerName)
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

  _isDownloadComplete () {
    const downloadedPieces = this._torrent.getDownloadedPiecesNumber()
    return downloadedPieces === this._torrent.getPiecesNumber()
  }
}
