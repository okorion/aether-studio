/** One shared, short follow delay for the column, its monitors and flowers. */
export function createColumnFollow(initial: number) {
  let value = initial
  return {
    update(target: number, seconds: number, immediate = false) {
      if (!Number.isFinite(target)) return value
      if (immediate || target < .20 || target > .71) return value = target
      const delta = Math.max(0, Math.min(.1, Number.isFinite(seconds) ? seconds : 0))
      if (!delta) return value
      value += (target - value) * (1 - Math.exp(-delta / .065))
      // Do not let a fast scroll detach the rotating assembly from its chain.
      value = Math.max(target - .006, Math.min(target + .006, value))
      if (Math.abs(target - value) < .000001) value = target
      return value
    },
  }
}
