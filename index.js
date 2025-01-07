import { TorrentInfo } from './torrent/torrentInfo.js'
import { DownloadManager } from './managers/download-manager.js'

const torrentFile = new TorrentInfo('tests/torrent-files/test.torrent', true)

const downloadManager = new DownloadManager(torrentFile, 50)
downloadManager.start()
