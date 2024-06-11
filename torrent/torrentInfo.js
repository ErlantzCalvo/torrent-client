import fs from 'node:fs'
import {encode, decode} from '../bencoding/index.js'
import {createHash} from 'node:crypto'
import {hexUrlEncoding} from '../utils.js'
import {createSocket} from 'node:dgram'

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

    async makeAnnounceRequest(port) {
        if(isHttpRequest(this.announce)) {
            return fetchHttpAnnounce(this.announce, port, this.infoHash)
        } else if (isUdpRequest(this.announce)) {
            return fetchUdpAnnounce(this.announce, port, this.infoHash)
        } else {
            throw new Error("Unknwon announcer protocol")
        }
        
    }
}

function isHttpRequest(urlStr) {
    let url = new URL(urlStr)
    return url.protocol === "http:" || url.protocol === "https:"
}

function isUdpRequest(urlStr) {
    let url = new URL(urlStr)
    return url.protocol === "udp:"
}

async function fetchHttpAnnounce(domain, port, info_hash) { 
    const connectionPort = port || 6881
    const infoHashEncoded = hexUrlEncoding(info_hash)
    const url = `${domain}?info_hash=${infoHashEncoded}&peer_id=-TR2940-k8hj0erlnatz&port=${connectionPort}`
    return fetch(url)
        .then(res => res.text())
        .then(text => {
            const buffer = Buffer.from(text, 'ascii')
            const result = decode(buffer)
            return result
        })
        .catch(err => console.log(err))
}

async function fetchUdpAnnounce(domain, port, info_hash) {
    const connectionPort = port || 6881
    const infoHashEncoded = hexUrlEncoding(info_hash)
    const url = `${domain}?info_hash=${infoHashEncoded}&peer_id=-TR2940-k8hj0erlnatz&port=${connectionPort}`
   const client = createSocket('udp4')
   let d = "udp://tracker.leechers-paradise.org"
   let p = "6969"
   client.on('message', function(error) {
    console.error(error)
   })

   client.send(`${domain}?info_hash=${infoHashEncoded}&peer_id=-TR2940-k8hj0erlnatz&port=${connectionPort}`, connectionPort, domain, 
    function(error){
        console.log(error)
   })
}
