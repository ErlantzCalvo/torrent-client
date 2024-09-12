# Torrent client from scratch

This project is a lightweight torrent client built from scratch in NodeJS. This project aims to provide a clear understanding of how a torrent client works by implementing the core features and functionalities from the ground up. This project serves as a learning tool and a base for further development.

## Table of Contents

- [Introduction](#introduction)
- [Features](#features)
- [Technical Overview](#technical-overview)
- [Installation](#installation)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)

## Introduction

A torrent client is a software application that allows users to download and upload files using the BitTorrent protocol. This protocol distributes the load of downloading large files by splitting them into smaller pieces and sharing these pieces among multiple users (peers). Each peer in the network can download pieces from others and upload pieces they already have, making the process efficient and fast.

## Features

- Manage torrent files and metadata
- Connect to torrent trackers
- Download files from multiple peers

## Technical Overview

The following sections provide a step-by-step explanation of how the torrent client works.

### 1. Parsing the Torrent File

The first step in the process is to parse the `.torrent` file. This file contains metadata about the files to be downloaded, including:

- **Announce URL**: The URL of the tracker.
- **Info Hash**: A SHA-1 hash of the torrent's info dictionary, used to uniquely identify the torrent.
- **File Information**: Details about the files included in the torrent, such as names, sizes, and piece length.
  
This information is [bencoded](https://en.wikipedia.org/wiki/Bencode) inside the `.torrent` file, so the first step is to retrieve this information from the file decoding it. 

#### 1.1 Bencode format
The Bencode encoding supports four types of data values: integers, strings, lists and dictionaries. So a file encoded in this way can be easily converted to JSON format.

The encoding works as follows:
- An integer is encoded as i<integer encoded in base ten ASCII>e. Leading zeros are not allowed.
- A byte string (a sequence of bytes, not necessarily characters) is encoded as <length>:<contents>. I.e.: *The string "spam" would be encoded as 4:spam*.
- A list of values is encoded as l<contents>e . The contents consist of the bencoded elements of the list, in order, concatenated.
- A dictionary is encoded as d<contents>e. The elements of the dictionary are encoded with each key immediately followed by its value. All keys must be byte strings and must appear in lexicographical order.

Let's see how the `test.torrent` file under the `tests/torrent-files/` folder is decoded:

  The raw file looks like this: `d8:announce41:https://academictorrents.com/announce.php13:announce-listll41:https://academictorrents.com/announce.phpel46:https://ipv6.academictorrents.com/announce.phpel42:udp://tracker.opentrackr.org:1337/announceee10:created by25:Transmission/2.92 (14714)13:creation datei1495908054e8:encoding5:UTF-84:infod5:filesld6:lengthi17614527e4:pathl6:images35:LOC_Main_Reading_Room_Highsmith.jpgeed6:lengthi1682177e4:pathl6:images22:melk-abbey-library.jpgeed6:lengthi20e4:pathl6:READMEeee4:name11:test_folder12:piece lengthi32768e6:pieces11780:......`
  
  1) d8 is telling us that the object starts with a dictionary whose first property is an 8-character string, so we create a dictionary and add a property to it whith the next 8 characters as name: 
  `
  {
    "announce":
  }
  `
  
  2) After those 8 characters, comes a number (41), so we know that a string of 41 characters length is coming. That string will be our previous property value:
  `
  {
    "announce": "https://academictorrents.com/announce.php" 
  }
  `
  
  3) The next value starts with a number (13), so again, we know it's a string (13 characters) and a property of our dictionary:
  `
  {
  "announce": "https://academictorrents.com/announce.php",
  "announce-list" : 
  }
  `
  
  4) For the value of this property, the starting charactes is an `l`, so list is coming:
  `
   {
   "announce": "https://academictorrents.com/announce.php",
   "announce-list" : []
   }
   `
   
   5) Note that the following character is another `l`, so inside this list, it will be another list:
   `
      {
      "announce": "https://academictorrents.com/announce.php",
      "announce-list" : [
          ["https://academictorrents.com/announce.php"]
        ]
      }
      `
      
  we will not go through the whole process for the file, but for reference, the resulting object should have the following structure:

  ```
  {
    announce: 'https://academictorrents.com/announce.php',
    'announce-list': [
      [ 'https://academictorrents.com/announce.php' ],
      [ 'https://ipv6.academictorrents.com/announce.php' ],
      [ 'udp://tracker.opentrackr.org:1337/announce' ]
    ],
    'created by': 'Transmission/2.92 (14714)',
    'creation date': 1495908054,
    encoding: 'UTF-8',
    info: {
      files: [
        {
          length: 17614527,
          path: [
            "images",
            "LOC_Main_Reading_Room_Highsmith.jpg",
          ],
        },
        {
          length: 1682177,
          path: [
            "images",
            "melk-abbey-library.jpg",
          ],
        },
        {
          length: 20,
          path: [
            "README",
          ],
        },
      ],
      name: 'test_folder',
      'piece length': 32768,
      pieces: <Buffer 21 8c ac ad 5b 2d c7 9c 74 35 23 90 27 1a 35 f8 1b 66 61 cc 7e c8 33 39 7a c6 68 ef 59 ad a9 c7 de f9 99 cb c9 64 2c 4b c1 2f 2b a2 65 9b 44 fc 5c 32 ... 11730 more bytes>,
      private: 0
    },
    'url-list': [ '' ]
  }
  ```

This task is fulfilled using the `decoder.js` file which can be found in the `bencoding` folder. 

__*Note: I recommend building the bencoding decoder from scratch since the logic behind it is quite simple and carrying out the task feels like leetcoding*__

#### 1.2 Generate info hash
A torrent info hash is a unique identifier derived from the contents of the "info" dictionary within a .torrent file. 


The info hash is generated by taking the raw Bencoded representation of the "info" dictionary and then computing its SHA-1 hash. So we have to take the `info` property of the object which was created in the step 1.1, bencode it (or retrieve it directly from the torrent file already bencoded), and compute its SHA-1 hash. This process creates a unique identifier that corresponds to the specific files and data in that torrent. 


### 2. Connecting to the Tracker

The tracker is a server that helps peers find each other. We send an HTTP GET request to the tracker's announce URL with the following parameters:

- `info_hash`: The SHA-1 hash of the info dictionary.
- `peer_id`: A unique identifier for our client.
- `port`: The port number our client will listen on.

The tracker responds with a list of peers and their IP addresses and ports.

### 3. Establishing Peer Connections

Using the list of peers from the tracker, we establish TCP connections to each peer. We follow the BitTorrent handshake protocol:

- Send a handshake message. The handshake message is a 68 bytes buffer whith the following content:
  -  The first byte is the length of the string identifier protocol (19)
  - From byte 1 to 20 contains the string identifier of the protocol ("BitTorrent protocol") 
  - From byte 28 to byte 48 contains the info_hash
  - Finally, if the peer has the property peer_id, include it from byte 48 to byte 68
- Receive a handshake response from the peer.
- If the handshake response includes the info_hash of the file then the handshake is successful, we can start exchanging messages with the peer.

### 4. Exchanging Messages with Peers

Peers communicate using a set of predefined messages. Those messages in the protocol take the form of &lt;length prefix&gt;&lt;message ID&gt;&lt;payload&gt;. The length prefix is a four byte big-endian value. The message ID is a single decimal byte which indicates the message type.
Some of the key messages include:

- **Interested/Not Interested**: Indicates whether a peer is interested in downloading pieces from the other peer.
- **Choke/Unchoke**: Tells a peer to stop/start sending data.
- **Have**: Indicates that a peer has successfully downloaded a piece.
- **Request**: Requests a specific piece from a peer.
- **Piece**: Contains a block of the requested piece.

We implement a message handler to manage these communications.

### 5. Downloading Pieces

The torrent file is divided into pieces, each typically 256 KB in size. Each piece is further divided into smaller blocks of 16 KiB each. The steps to download a piece are:

1. Send an `Interested` message to the peer.
2. Wait for an `Unchoke` message from the peer.
3. Send `Request` messages for each block of the piece.
4. Receive `Piece` messages and reassemble the blocks into a complete piece.
5. Verify the piece using its SHA-1 hash.

## Installation

```bash
git clone https://github.com/yourusername/NodeTorrent.git
cd NodeTorrent
npm install

