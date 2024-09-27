export class PriorityQueue {
  constructor () {
    this.values = []
  }

  enqueue (node, priority) {
    let inserted = false
    for (let i = 0; i < this.values.length; i++) {
      if (this.values[i].priority < priority) {
        this.values.splice(i, 0, { node, priority })
        inserted = true
        break
      }
    }
    if (!inserted) {
      this.values.push({ node, priority })
    }
  }

  dequeue () {
    return this.values.shift()
  }

  size () {
    return this.values.length
  }
}
