import { decode } from './bencoding/decoder.js'
import {TorrentInfo} from './torrent/torrentInfo.js'
import {hexUrlEncoding} from './utils.js'

const torrentFile = new TorrentInfo('tests/torrent-files/test.torrent')
// const torrentFile = new TorrentInfo('tests/torrent-files/TGD.torrent')
const infoHashEncoded = hexUrlEncoding(torrentFile.infoHash)


const url = `${torrentFile.announce}?info_hash=${infoHashEncoded}&peer_id=-TR2940-k8hj0erlnatz&port=6881`
fetch(url, {
    headers: {"Content-Type": "text/html; charset=UTF-8"}
}).then(res => res.text())
.then(text => {
    console.log(text)
    const buffer = Buffer.from(text, 'ascii')
    const result = decode(buffer)
    console.log(result)
})
.catch(err => console.log(err))
