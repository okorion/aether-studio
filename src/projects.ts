export type Project = {
  id: string
  name: string
  category: string
  year: string
  theme: 'liminal' | 'pulse' | 'orbital' | 'solstice'
  tagline: string
  description: string
  disciplines: string[]
}

// Fictional concept projects. Replace with the studio's own work before launch.
export const projects: Project[] = [
  {
    id: 'liminal',
    name: 'Liminal',
    category: 'IMMERSIVE EXPERIENCE',
    year: '2026',
    theme: 'liminal',
    tagline: 'Somewhere between the real and the imagined.',
    description:
      'An exploration of impossible spaces. Liminal turns a simple act of discovery into a journey through light, reflection, and shifting perspectives. Every movement reveals another way to see.',
    disciplines: ['Creative direction', 'Real-time 3D', 'Interaction design'],
  },
  {
    id: 'pulse',
    name: 'Pulse',
    category: 'DIGITAL INSTALLATION',
    year: '2026',
    theme: 'pulse',
    tagline: 'A living canvas. A collective rhythm.',
    description:
      'An imagined audiovisual installation shaped by human presence. Ripples of color and light connect individual gestures into a single, ever-changing composition.',
    disciplines: ['Art direction', 'Generative design', 'Spatial interaction'],
  },
  {
    id: 'orbital',
    name: 'Orbital',
    category: 'INTERACTIVE WORLD',
    year: '2025',
    theme: 'orbital',
    tagline: 'A new perspective is closer than you think.',
    description:
      'A speculative observatory for the curious. Drift through an abstract planetary system, follow unfamiliar paths, and find a moment of perspective in the space between worlds.',
    disciplines: ['World building', 'WebGL development', 'Motion systems'],
  },
  {
    id: 'solstice',
    name: 'Solstice',
    category: 'BRAND EXPERIENCE',
    year: '2025',
    theme: 'solstice',
    tagline: 'A quiet moment, made extraordinary.',
    description:
      'A digital study of the changing light. Soft geometry, warm materials, and unhurried motion create a sensory identity for a fictional contemporary design collection.',
    disciplines: ['Visual identity', 'Digital design', 'Creative development'],
  },
]
