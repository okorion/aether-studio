import * as THREE from 'three'

const envelope = (p: number, a: number, b: number, c: number, d: number) =>
  THREE.MathUtils.smoothstep(p, a, b) * (1 - THREE.MathUtils.smoothstep(p, c, d))

/** Authored gallery and a kinetic chamber, made from original geometry. */
export function createSceneWorlds(scene: THREE.Scene, software: boolean) {
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const textures: THREE.Texture[] = []
  const geo = <T extends THREE.BufferGeometry>(g: T) => {
    geometries.push(g)
    return g
  }
  const mat = <T extends THREE.Material>(m: T) => {
    materials.push(m)
    return m
  }
  const gallery = new THREE.Group()
  const chamber = new THREE.Group()
  scene.add(gallery, chamber)
  const silver = mat(
    new THREE.MeshStandardMaterial({
      color: 0x79959a,
      metalness: software ? 0.4 : 1,
      roughness: 0.2,
      envMapIntensity: 2.5,
    }),
  )
  const dark = mat(
    new THREE.MeshStandardMaterial({
      color: 0x13262e,
      metalness: 0.8,
      roughness: 0.32,
      envMapIntensity: 1.5,
    }),
  )
  const light = mat(
    new THREE.MeshBasicMaterial({
      color: 0x8bffe7,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
    }),
  )
  const mesh = (
    parent: THREE.Group,
    g: THREE.BufferGeometry,
    m: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const object = new THREE.Mesh(g, m)
    object.position.set(x, y, z)
    parent.add(object)
    return object
  }
  const panelGeometry = geo(new THREE.PlaneGeometry(2.65, 1.75))
  const panels: THREE.Group[] = []
  const names = ['LIMINAL', 'PULSE', 'ORBITAL', 'SOLSTICE']
  for (let strand = 0; strand < 3; strand++) {
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= 100; i++) {
      const t = i / 100
      const angle = t * 23 + (strand * Math.PI * 2) / 3
      const width = 0.35 + Math.pow(Math.sin(t * Math.PI * 4), 2) * 0.5
      points.push(
        new THREE.Vector3(Math.cos(angle) * width, (t - 0.5) * 12, Math.sin(angle) * width - 1),
      )
    }
    mesh(
      gallery,
      geo(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points),
          software ? 70 : 180,
          strand === 0 ? 0.13 : 0.075,
          software ? 5 : 8,
          false,
        ),
      ),
      silver,
    )
  }
  for (let i = 0; i < 4; i++) {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 420
    const ctx = canvas.getContext('2d')!
    const hue = [185, 275, 220, 35][i]
    const gradient = ctx.createRadialGradient(300, 190, 10, 320, 200, 390)
    gradient.addColorStop(0, `hsl(${hue} 55% 26%)`)
    gradient.addColorStop(1, '#02080e')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 640, 420)
    ctx.save()
    ctx.translate(320, 190)
    ctx.rotate(-0.35)
    for (let r = 0; r < 22; r++) {
      ctx.beginPath()
      ctx.ellipse(0, 0, 45 + r * 5, 110 + r * 2, r * 0.09, 0, Math.PI * 2)
      ctx.strokeStyle = `hsla(${hue + r * 2} 65% ${55 + r}% / ${0.15 + r * 0.023})`
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    ctx.restore()
    ctx.fillStyle = '#e3f2f0'
    ctx.font = '30px sans-serif'
    ctx.fillText(names[i], 30, 358)
    ctx.font = '11px monospace'
    ctx.fillStyle = '#95bcba'
    ctx.fillText(`EXPLORATION 0${i + 1} / AETHER STUDIO`, 30, 388)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    textures.push(texture)
    const panel = new THREE.Group()
    const frame = mesh(panel, geo(new THREE.BoxGeometry(2.7, 1.8, 0.045)), dark)
    frame.position.z = -0.035
    mesh(
      panel,
      panelGeometry,
      mat(new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })),
    )
    panel.position.set(i % 2 === 0 ? -2.65 : 2.65, i < 2 ? 1.15 : -1.25, i % 2 === 0 ? 0.1 : -0.4)
    panel.rotation.y = i % 2 === 0 ? 0.23 : -0.23
    panel.rotation.z = i % 2 === 0 ? -0.08 : 0.07
    gallery.add(panel)
    panels.push(panel)
  }

  // Layered machined collars, vertical rods, an illuminated core and loose cables.
  const cylinder = geo(new THREE.CylinderGeometry(1.7, 1.7, 0.24, software ? 32 : 80, 1, true))
  for (const y of [-2.05, 1.9]) {
    mesh(chamber, cylinder, silver, 0, y)
    mesh(
      chamber,
      geo(new THREE.CylinderGeometry(1.85, 1.85, 0.07, software ? 32 : 80)),
      dark,
      0,
      y - 0.19,
    )
    for (const offset of [-0.12, 0.13]) {
      const torus = mesh(
        chamber,
        geo(new THREE.TorusGeometry(1.7, 0.045, 6, software ? 40 : 100)),
        silver,
        0,
        y + offset,
      )
      torus.rotation.x = Math.PI / 2
    }
    const glow = mesh(chamber, geo(new THREE.TorusGeometry(1.62, 0.014, 5, 80)), light, 0, y - 0.1)
    glow.rotation.x = Math.PI / 2
  }
  const rodGeometry = geo(new THREE.CylinderGeometry(0.027, 0.027, 3.85, 6))
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2
    mesh(
      chamber,
      rodGeometry,
      i % 3 === 0 ? light : silver,
      Math.cos(angle) * 1.58,
      -0.07,
      Math.sin(angle) * 1.58,
    )
  }
  const innerRing = mesh(chamber, geo(new THREE.TorusGeometry(0.9, 0.1, 8, 64)), silver, 0, -1.9)
  innerRing.rotation.x = Math.PI / 2
  const cables: THREE.Mesh[] = []
  for (let i = 0; i < (software ? 7 : 18); i++) {
    const angle = (i / 18) * Math.PI * 2
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(angle) * 1.5, 1.95, Math.sin(angle) * 1.5),
      new THREE.Vector3(Math.cos(angle) * 2.15, 0.5, Math.sin(angle) * 2.15),
      new THREE.Vector3(Math.cos(angle) * 2.9, -0.7, Math.sin(angle) * 2.9),
      new THREE.Vector3(Math.cos(angle) * 3.6, 2.8, Math.sin(angle) * 3.6),
    ])
    cables.push(
      mesh(
        chamber,
        geo(new THREE.TubeGeometry(path, 36, i % 3 === 0 ? 0.022 : 0.012, 4, false)),
        i % 4 === 0 ? light : silver,
      ),
    )
  }
  const coreCount = software ? 550 : 2800
  const corePositions = new Float32Array(coreCount * 3)
  for (let i = 0; i < coreCount; i++) {
    const y = 1 - (i / (coreCount - 1)) * 2
    const radius = Math.sqrt(1 - y * y)
    const theta = i * 2.399963
    const ripple = 1 + Math.sin(theta * 3) * 0.09
    corePositions.set(
      [Math.cos(theta) * radius * ripple, y * 1.25, Math.sin(theta) * radius * ripple],
      i * 3,
    )
  }
  const core = new THREE.Points(
    geo(new THREE.BufferGeometry()),
    mat(
      new THREE.PointsMaterial({
        color: 0x88ffdd,
        size: software ? 0.038 : 0.025,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  )
  core.geometry.setAttribute('position', new THREE.BufferAttribute(corePositions, 3))
  chamber.add(core)
  const base = mesh(
    chamber,
    geo(new THREE.CylinderGeometry(2.2, 2.6, 0.14, software ? 24 : 64)),
    dark,
    0,
    -2.35,
  )
  base.rotation.y = 0.4
  const chamberLight = new THREE.PointLight(0x41ffd5, 28, 9, 2)
  chamberLight.position.set(0, -1.3, 2)
  chamber.add(chamberLight)
  const groundMaterial = mat(
    new THREE.MeshStandardMaterial({
      color: 0x040e12,
      metalness: 0.5,
      roughness: 0.3,
      envMapIntensity: 0.4,
    }),
  )
  const groundGeometry = geo(new THREE.PlaneGeometry(18, 14, 36, 28))
  const groundVertices = groundGeometry.attributes.position
  for (let i = 0; i < groundVertices.count; i++) {
    const x = groundVertices.getX(i)
    const y = groundVertices.getY(i)
    groundVertices.setZ(i, Math.sin(x * 3 + y) * Math.cos(y * 2.8) * 0.06)
  }
  groundGeometry.computeVertexNormals()
  const ground = mesh(chamber, groundGeometry, groundMaterial, 0, -2.49, 0)
  ground.rotation.x = -Math.PI / 2
  const rockGeometry = geo(new THREE.IcosahedronGeometry(1, 1))
  const rocks = new THREE.InstancedMesh(rockGeometry, groundMaterial, software ? 14 : 42)
  const dummy = new THREE.Object3D()
  for (let i = 0; i < rocks.count; i++) {
    const angle = i * 2.39996
    const radius = 2.6 + (i % 7) * 0.37
    dummy.position.set(Math.cos(angle) * radius, -2.36, Math.sin(angle) * radius)
    dummy.rotation.set(i * 0.7, i * 1.2, i * 0.5)
    dummy.scale.set(0.22 + (i % 3) * 0.17, 0.08 + (i % 4) * 0.05, 0.17 + (i % 5) * 0.13)
    dummy.updateMatrix()
    rocks.setMatrixAt(i, dummy.matrix)
  }
  chamber.add(rocks)
  return {
    update(time: number, progress: number) {
      const g = envelope(progress, 0.19, 0.25, 0.56, 0.66)
      const c = envelope(progress, 0.59, 0.69, 0.83, 0.93)
      gallery.visible = g > 0.001
      chamber.visible = c > 0.001
      gallery.scale.setScalar(Math.max(0.001, g))
      chamber.scale.setScalar(Math.max(0.001, c))
      gallery.rotation.y = Math.sin(time * 0.07) * 0.04 + (progress - 0.5) * 0.6
      gallery.position.y = (0.5 - progress) * 2
      const travel = THREE.MathUtils.smoothstep(progress, 0.25, 0.5)
      const from = [
        [0, 0, 2, 2.2, 0],
        [-4, 1, -2, 1.3, 0.7],
        [4, 1, -3, 1.3, -0.7],
        [0, 3, -5, 1, 0.1],
      ]
      const to = [
        [-4.2, 1, -0.8, 1.6, 0.6],
        [0.7, -0.1, 1.9, 2, -0.15],
        [4.2, 1.6, -1.2, 1.3, -0.7],
        [-1.5, -2.8, -2, 1.2, 0.3],
      ]
      panels.forEach((panel, i) => {
        const pose = from[i].map((n, j) => THREE.MathUtils.lerp(n, to[i][j], travel))
        panel.position.set(pose[0], pose[1] + Math.sin(time * 0.2 + i) * 0.06, pose[2])
        panel.scale.setScalar(pose[3])
        panel.rotation.y = pose[4]
        panel.rotation.z = Math.sin(i * 2) * 0.045
      })
      chamber.rotation.y = (progress - 0.75) * 2 + 0.25 + Math.sin(time * 0.08) * 0.04
      chamber.rotation.z = 0.05
      chamber.position.set(0, 0, -0.1)
      core.rotation.y = time * 0.12
      core.rotation.z = time * 0.04
    },
    dispose() {
      scene.remove(gallery, chamber)
      rocks.dispose()
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
      textures.forEach((t) => t.dispose())
    },
  }
}
