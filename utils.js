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
  // Erlantz: Little explanation here bc it might see as magic:
  // each byte of the buffer is represented as decimal value i.e: 165 but in binary would be 10100101
  // We iterate from right (less significant bits) to left (most significant)
  // for each byte of buffer, we shift it 8 bits with the operand "<<" because if there is a byte with a value of 8
  // but that byte is in the penultimate position, the value of this byte is 2048 -> 8 = 00001000 but as there is another byte after this one,
  // it's value is 00001000 00000000 -> 2048
  // the operand >>> 0 is because bitwise operator convert operands to signed 32 bit numbers, and can convert them to negative values.
  for (let i = buffer.length - 1; i >= 0; i--) {
    result += (buffer[i] << (8 * (buffer.length - 1 - i))) >>> 0
  }

  return result
}

export function createFolder (path) {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path)
  }
}

export function bigNumsTo8BytesBufferConversor (bigNum) {
  let str = bigNum.toString()

  // var bytes = new Array(7);
  const bytes = Buffer.allocUnsafe(8)
  for (let k = 0; k < 8; k++) {
    bytes.writeUInt8(mod256(str), 7 - k)
    // bytes[k] = mod256(str);
    str = divide256(str)
  }

  return bytes
  function divide256 (n) {
    if (n.length <= 8) {
      return (Math.floor(parseInt(n) / 256)).toString()
    } else {
      const top = n.substring(0, n.length - 8)
      const bottom = n.substring(n.length - 8)
      let topVal = Math.floor(parseInt(top) / 256)
      let bottomVal = Math.floor(parseInt(bottom) / 256)
      const rem = (100000000 / 256) * (parseInt(top) % 256)
      bottomVal += rem
      topVal += Math.floor(bottomVal / 100000000)
      bottomVal %= 100000000
      if (topVal == 0) return bottomVal.toString()
      else return topVal.toString() + bottomVal.toString()
    }
  }

  function mod256 (n) {
    if (n.length <= 8) {
      return parseInt(n) & 255
    } else {
      return parseInt(n.substring(n.length - 8)) & 255
    }
  }
}
