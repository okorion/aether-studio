const notes = [55, 65.406, 73.416] as const

export function createAmbientAudio(track = 0) {
  const context = new AudioContext()
  const master = context.createGain()
  const filter = context.createBiquadFilter()
  master.gain.value = 0
  filter.type = 'lowpass'
  filter.frequency.value = 420
  filter.Q.value = 0.7
  filter.connect(master).connect(context.destination)
  const oscillators = [1, 1.5, 2.002, 3.003].map((ratio, i) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = i === 0 ? 'sine' : 'triangle'
    oscillator.frequency.value = notes[track] * ratio
    gain.gain.value = i === 0 ? 0.35 : 0.08
    oscillator.connect(gain).connect(filter)
    oscillator.start()
    return { oscillator, ratio }
  })
  let enabled = false
  return {
    async play() {
      await context.resume()
      enabled = true
      master.gain.setTargetAtTime(0.18, context.currentTime, 0.5)
    },
    pause() {
      enabled = false
      master.gain.setTargetAtTime(0, context.currentTime, 0.15)
    },
    setTrack(index: number) {
      oscillators.forEach(({ oscillator, ratio }) =>
        oscillator.frequency.setTargetAtTime(notes[index] * ratio, context.currentTime, 1.4),
      )
    },
    setVisible(visible: boolean) {
      master.gain.setTargetAtTime(visible && enabled ? 0.18 : 0, context.currentTime, 0.15)
    },
    dispose() {
      oscillators.forEach(({ oscillator }) => oscillator.stop())
      void context.close()
    },
  }
}
