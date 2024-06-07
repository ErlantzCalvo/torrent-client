import fs from 'node:fs'
import {encode, decode} from '../bencoding/index.js'
import {createHash} from 'node:crypto'

export class TorrentInfo {
    constructor(path) {
        if(path) {
            this.createTorrentFromFile(path)
        }
    }

    createTorrentFromFile(path) {
        const buffer = fs.readFileSync(path)
        const torrentObject = decode(buffer)
        
        const infoBencoded = encode(torrentObject.info)
        const infoHash = createHash('sha1').update(infoBencoded).digest('hex')
        torrentObject.infoHash = infoHash;
        Object.assign(this, torrentObject)
    }
}
