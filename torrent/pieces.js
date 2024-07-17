const PIECE_STATE = {
  NOT_REQUESTED: 0,
  REQUESTED: 1,
  DOWNLOADED: 2
}

export class Pieces {
  constructor (piecesNum) {
    this._pieces = new Array(piecesNum).fill(PIECE_STATE.NOT_REQUESTED)
  }

  request (pieceIndex) {
    if (pieceIndex < this._pieces.length) {
      this._pieces[pieceIndex] = PIECE_STATE.REQUESTED
    }
  }

  finished (pieceIndex) {
    if (pieceIndex < this._pieces.length) {
      this._pieces[pieceIndex] = PIECE_STATE.DOWNLOADED
    }
  }
}
