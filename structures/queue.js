import { TorrentInfo } from '../torrent/torrentInfo.js' // eslint-disable-line
import { BLOCK_LENGTH } from '../constants.js'

export class Queue {
  /**
     * Creates a queue for the blocks of the file
     * @param {TorrentInfo} torrent
     */
  constructor (torrent) {
    this.torrent = torrent
    this._queue = []
  }

  /**
     * Add the piece with the given index to the queue
     * Note: The piece is divided in blocks so, for each piece the queue might contain multiple elements (block)
     * @param {number} pieceIndex
     */
  push (pieceIndex) {
    if (this.torrent.info) {
      const nBlocks = this.torrent.getBlocksPerPiece(pieceIndex)
      for (let j = 0; j < nBlocks; j++) {
        // index is the piece index
        // begin is the block number of the piece + the size of the block
        // the length is the size of the block
        this._queue.push(new BlockInfo(pieceIndex, j * BLOCK_LENGTH, this.torrent.getBlockLength(pieceIndex, j), false, false))
      }
    }
  }

  /**
     * Returns and remove from queue all the blocks of the first queued piece
     * @returns {BlockInfo} blocks of the first piece
     */
  popUnrequestedPieceBlock (pieceIndex) {
    const idx = this._queue.findIndex(block => block.index === pieceIndex && !block.requested && !block.downloaded)
    if (idx > -1) {
      return this._queue[idx]
    } else {
      return null
    }
  }

  popRequestedPieceBlock () {
    const idx = this._queue.findIndex(block => !block.downloaded)
    if (idx > -1) {
      return this._queue[idx]
    } else {
      return null
    }
  }

  getBlockLength (pieceIndex, blockBegin) {
    const block = this._queue.find(block => pieceIndex === block.index && block.begin === blockBegin)
    return block?.length
  }

  setBlockRequested (blockInfo, timeout) {
    const block = this._queue.find(block => block.index === blockInfo.index && block.begin === blockInfo.begin)
    if (block) block.requested = true

    if (timeout) {
      setTimeout(() => {
        block.requested = false
      }, timeout)
    }
  }

  setBlockUnrequested (pieceIndex, blockBegin) {
    const block = this._queue.find(block => pieceIndex === block.index && block.begin === blockBegin)
    if (block) block.requested = false
  }

  setBlockDownloaded (pieceIndex, blockBegin) {
    const block = this._queue.find(block => pieceIndex === block.index && block.begin === blockBegin)
    if (block) block.downloaded = true
  }

  updateBlockInfo (pieceIndex, blockBegin, newlength, newBegin) {
    const block = this._queue.find(block => pieceIndex === block.index && block.begin === blockBegin)
    if (block) {
      block.length = newlength
      block.begin = newBegin
    }
  }

  pop () {
    return this._queue.shift()
  }

  has (pieceIndex) {
    return this._queue.some(piece => piece.index === pieceIndex)
  }

  hasUnrequestedblocks () {
    return this._queue.some(piece => !piece.downloaded && !piece.requested )
  }

  isPieceComplete (pieceIndex) {
    return this._queue.filter(block => block.index === pieceIndex)
      .every(block => block.downloaded)
  }
}

class BlockInfo {
  constructor (index, begin, length, requested, downloaded) {
    this.index = index
    this.begin = begin
    this.length = length
    this.requested = requested
    this.downloaded = downloaded
    this._requestTimeout = null
  }

  setRequested (timeout, callback) {
    this.requested = true

    if (timeout) {
      this._requestTimeout = setTimeout(() => {
        this.requested = false
        callback()
      }, timeout)
    }
  }

  setDownloaded () {
    this.downloaded = true
    this.removeRequestedTimeout()
  }

  removeRequestedTimeout () {
    clearTimeout(this._requestTimeout)
    this._requestTimeout = null
  }
}
