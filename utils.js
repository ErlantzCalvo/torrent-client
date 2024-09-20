import fs from 'node:fs'

export function hexUrlEncoding (hexString) {
  return hexString.replace(/.{2}/g, function (m) {
    const v = parseInt(m, 16)
    if (v <= 127) {
      m = encodeURIComponent(String.fromCharCode(v))
      if (m[0] === '%') { m = m.toLowerCase() }
    } else { m = '%' + m }
    return m
  })
}

/**
 *
 * @param {Buffer} buffer
 * @returns {number}
 */
export function bytesToDecimal (buffer) {
  let result = 0
  for (let i = buffer.length - 1; i > 0; i--) {
    result += buffer[i] << (8 * (buffer.length - 1 - i))
  }

  return result
}

export function createFolder(path) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path)
  }
}
/**
 * 
 * @param {Buffer} buffer 
 * @returns boolean
 */
export function bufferIsEmpty(buffer) {
  return !buffer.some(byte => byte !== 0)
}
