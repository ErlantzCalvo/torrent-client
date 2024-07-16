import { TorrentInfo } from './torrent/torrentInfo.js'
import { DownloadManager } from './managers/download-manager.js'

const torrentFile = new TorrentInfo('tests/torrent-files/debian.torrent', true)
// const torrentFile = new TorrentInfo('tests/torrent-files/big-buck-bunny.torrent')
// const torrentFile = new TorrentInfo('tests/torrent-files/test.torrent', true)


const downloadManager = new DownloadManager(torrentFile, 4)
downloadManager.start()