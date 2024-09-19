const SPECIAL_CHARS = {
  START: {
    INTEGER: 0x69,
    DICT: 0x64,
    LIST: 0x6C
  },
  END: 0x65,
  COLON: 0x3A
}

let position = 0
let asString = true

export function decode (buffer) {
  position = 0
  asString = true
  // removeEmptyBytes(buffer)
  return parseField(buffer)
}

function parseField (buffer) {
  switch (buffer.at(position)) {
    case SPECIAL_CHARS.START.INTEGER:
      return getInteger(buffer)
    case SPECIAL_CHARS.START.DICT:
      return buildDictionary(buffer)
    case SPECIAL_CHARS.START.LIST:
      return buildList(buffer)
    default:
      if (asString) return getStringBuffer(buffer).toString()
      return getStringBuffer(buffer)
  }
}

function buildDictionary (buffer) {
  const dict = {}
  position++
  let isValid = true
  while (buffer.at(position) !== SPECIAL_CHARS.END) {
    try {
      const dictPropertyName = getStringBuffer(buffer).toString()
      asString = dictPropertyName !== 'pieces'
      const propertyValue = parseField(buffer)
      dict[dictPropertyName] = propertyValue
    } catch (err) {
      position = findNextCharPosition(buffer, SPECIAL_CHARS.END) + 1
      isValid = false
    }
  }

  position++
  return isValid ? dict : null
}

function buildList (buffer) {
  const list = []
  position++
  while (buffer.at(position) !== SPECIAL_CHARS.END) {
    const item = parseField(buffer)
    if (item) list.push(item)
  }
  position++
  return list
}

function getInteger (buffer) {
  position++
  const intEnd = findNextCharPosition(buffer, SPECIAL_CHARS.END)
  const resultInteger = getIntFromBuffer(buffer, position, intEnd)
  position = intEnd + 1
  return resultInteger
}

function getStringBuffer (buffer) {
  const nextColonPos = findNextCharPosition(buffer, SPECIAL_CHARS.COLON)
  const lengthPrefix = getIntFromBuffer(buffer, position, nextColonPos)
  position = nextColonPos + 1
  const result = buffer.slice(position, position + lengthPrefix)

  position += lengthPrefix
  return result
}

function getIntFromBuffer (buffer, start, end) {
  let sum = 0
  let sign = 1

  for (let i = start; i < end; i++) {
    const num = buffer[i]

    if (num < 58 && num >= 48) {
      sum = sum * 10 + (num - 48)
      continue
    }

    if (i === start && num === 43) { // +
      continue
    }

    if (i === start && num === 45) { // -
      sign = -1
      continue
    }

    if (num === 46) { // .
      // its a float. break here.
      break
    }

    throw new Error('not a number: buffer[' + i + '] = ' + num)
  }

  return sum * sign
}

function findNextCharPosition (buffer, char) {
  let currPos = position
  while (buffer.at(currPos) !== char && currPos < buffer.length) currPos++
  if (currPos > buffer.length) throw new Error('Invalid buffer')
  return currPos
}
