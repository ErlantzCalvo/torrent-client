import { TorrentInfo } from "../torrent/torrentInfo.js"
import { BLOCK_LENGTH } from '../constants.js'

export class Queue {
    /**
     * Creates a queue for the blocks of the file
     * @param {TorrentInfo} torrent 
     */
    constructor(torrent) {
        this.torrent = torrent
        this._queue = []
    }

    /**
     * Add the piece with the given index to the queue
     * Note: The piece is divided in blocks so, for each piece the queue might contain multiple elements (block)
     * @param {number} pieceIndex 
     */
    push(pieceIndex) {
        if(this.torrent.info){
            const nBlocks = this.torrent.getBlocksPerPiece(pieceIndex)
            for(let j = 0; j < nBlocks; j++) {
                // index is the piece index
                // begin is the block number of the piece + the size of the block
                // the length is the size of the block
                this._queue.push(new BlockInfo(pieceIndex, j * BLOCK_LENGTH, this.torrent.getBlockLength(pieceIndex, j)))
            }
        }
    }

    /**
     * Returns and remove from queue all the blocks of the first queued piece
     * @returns {BlockInfo} blocks of the first piece
     */
    popPieceBlock(pieceIndex) {
        let idx = this._queue.findIndex(block => block.index === pieceIndex)
        if(idx > -1) {
            let block = this._queue[idx]
            this._queue.splice(idx, 1)
            return block
        } else {
            return null
        }
    }

    pop() {
        return this._queue.shift()
    }

    has(pieceIndex) {
        return this._queue.some(piece => piece.index === pieceIndex)
    }
}

class BlockInfo {
    constructor(index, begin, length) {
        this.index = index
        this.begin = begin
        this.length = length
    }
}