const SPECIAL_CHARS = {
    START: {
      INTEGER: 0x69,
      DICT: 0x64,
      LIST: 0x6C
    },
    END: 0x65,
    COLON: 0x3A
  }
/*
    Note: This encoder has been made only for the torrent info field. It might not work in a general use
*/

export function encode(object) {
    const bufferArr = []
    parseField(object, bufferArr)
    return Buffer.concat(bufferArr)
}

function parseField(element, bufferArr) {
    switch (typeof element) {
        case "object":
            if(Array.isArray(element))
                buildList(element, bufferArr)
            else if(Buffer.isBuffer(element)) {
                bufferArr.push(Buffer.from(element.length + ':'))
                bufferArr.push(element)
            }
            else
                buildDictionary(element, bufferArr)
            break
        case "number":
            bufferArr.push(buildInt(element, bufferArr))
            break
        case "string":
            bufferArr.push(buildString(element, bufferArr))
            break
    }
}

function buildDictionary(object, bufferArr) {
    const properties = Object.keys(object).sort()
    bufferArr.push(Buffer.from("d"))
    for (let property of properties) {
        bufferArr.push(Buffer.from(property.length + ":" + property))
        parseField(object[property], bufferArr)
    }

    bufferArr.push(Buffer.from("e"))
}

function buildList(list, bufferArr) {
    bufferArr.push(Buffer.from("l"))
    for(let elem of list) {
        parseField(elem, bufferArr)
    }

    bufferArr.push(Buffer.from("e"))
}

// function buildBuffer(buffer) {
//     return buffer.length + ':' + buffer.toString()
// }

function buildString(element) {
    return Buffer.from(element.length + ':' + element)
}

function buildInt(element) {
    return Buffer.from(`i${element}e`)
}