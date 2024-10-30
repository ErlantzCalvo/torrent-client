import colors from 'colors'

export function info (text, title) {
  console.log(getLog(text, title))
}

export function error (text, title) {
  console.log(colors.red(getLog(text, title)))
}

export function warning (text, title) {
  console.log(colors.yellow(getLog(text, title)))
}

export function logMessageReceived (text, title) {
  console.log(colors.cyan(getLog(text, title)))
}

export function getDate () {
  return new Date().toLocaleTimeString()
}

function getLog(text, title) {
  let log = getDate() + ' - '
  if(title) log += `[${title}] `
  log += text

  return log
}
