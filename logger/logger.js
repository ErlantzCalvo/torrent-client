import colors from 'colors'

export function info(text) {
    console.log(`${getDate()} - ${text}`)
}

export function error(text) {
    console.log(colors.red(`${getDate()} - ${text}`))
}

export function warning(text) {
    console.log(colors.yellow(`${getDate()} - ${text}`))
}

export function logMessageReceived(text) {
    console.log(colors.cyan(`${getDate()} - ${text}`))
}


export function getDate() {
    return new Date().toLocaleTimeString()
}

// module.exports = {
//     info,
//     error,
//     warning,
//     logMessageReceived
// }