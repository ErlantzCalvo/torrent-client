const QUEUE_STATES = {
    NOT_STARTED: 0,
    IN_PROCESS: 1,
    FINISHED: 2
}

export class Queue {
    /**
     * 
     * @param {number} size 
     */
    constructor(size) {
        if(size) this._queue = Array.from({length: size}, () => QUEUE_STATES.NOT_STARTED)
        else this._queue = []
    }

    start(n) {
        if(this._queue.length < n && this._queue[n] === QUEUE_STATES.NOT_STARTED) {
            this._queue[n] = QUEUE_STATES.IN_PROCESS
        }
    }

    get(n) {
        if(this._queue.length < n) {
            return this._queue[n]
        } else {
            return -1
        }
    }
}