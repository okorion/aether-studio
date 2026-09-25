import { expect, test } from '@playwright/test'
import * as THREE from 'three'
import { createSpineAssembly } from '../src/SceneSpine'
import { sampleJourney, smooth } from '../src/Journey'
import { sampleChainPath } from '../src/SceneChain'

test('@interaction resizing at rest synchronizes strand count and travel with the camera mode', () => {
  for (const initialMobile of [false, true]) {
    const assembly = createSpineAssembly(false, initialMobile)
    const chain = assembly.group.getObjectByName('aether-spine-chain') as THREE.InstancedMesh
    const allocation = chain.instanceMatrix.array
    const matrix = new THREE.Matrix4(), expectedMatrix = new THREE.Matrix4()
    try {
      for (const progress of [.31, .46, .61]) {
        for (const mobileView of [initialMobile, !initialMobile, initialMobile]) {
          // Same scroll and emergence: a resize must invalidate the pose cache.
          assembly.update(progress, 1, 1, mobileView)
          const fresh = createSpineAssembly(false, mobileView)
          try {
            fresh.update(progress, 1, 1)
            const expected = fresh.group.getObjectByName('aether-spine-chain') as THREE.InstancedMesh
            expect(chain.count).toBe(mobileView ? 52 : 40)
            expect(chain.instanceMatrix.array).toBe(allocation)
            for (let i = 0; i < chain.count; i++) {
              chain.getMatrixAt(i, matrix)
              expected.getMatrixAt(i, expectedMatrix)
              expect(matrix.elements).toEqual(expectedMatrix.elements)
            }
          } finally { fresh.dispose() }
        }
      }
    } finally { assembly.dispose() }
  }
})

test('@interaction the lower terminal remains below the frame throughout column entry and descent', () => {
  for (const mobile of [false, true]) {
    const assembly = createSpineAssembly(false, mobile)
    const chain = assembly.group.getObjectByName('aether-spine-chain') as THREE.InstancedMesh
    chain.geometry.computeBoundingBox()
    const bounds = chain.geometry.boundingBox!, matrix = new THREE.Matrix4()
    const camera = new THREE.PerspectiveCamera(42, mobile ? 390 / 844 : 1440 / 900, .1, 90)
    try {
      for (let step = 0; step <= 420; step++) {
        const p = .23 + step / 1000, journey = sampleJourney(p)
        const emergence = smooth(.205, .29, p)
        assembly.update(p, 1, emergence)
        assembly.group.position.y = journey.height - 12 * (1 - emergence)
        assembly.group.rotation.y = journey.structureYaw
        assembly.group.updateMatrixWorld(true)
        const radius = journey.radius + (mobile ? 4.8 : 0)
        camera.position.set(Math.sin(journey.azimuth) * Math.cos(journey.elevation) * radius,
          journey.height + Math.sin(journey.elevation) * radius,
          Math.cos(journey.azimuth) * Math.cos(journey.elevation) * radius)
        camera.lookAt(0, journey.height, 0)
        camera.updateMatrixWorld()
        chain.getMatrixAt(chain.count - 1, matrix)
        for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
          const point = chain.localToWorld(new THREE.Vector3(x, y, z).applyMatrix4(matrix)).project(camera)
          expect((1 - point.y) / 2, `lower terminal at ${p}, mobile ${mobile}`).toBeGreaterThan(1.1)
        }
      }
    } finally { assembly.dispose() }
  }
})

test('@interaction one finite chain stays connected, descends continuously and restores on reverse scroll', () => {
  for (const [software, mobile] of [[false, false], [false, true], [true, false]]) {
    const assembly = createSpineAssembly(software, mobile)
    const chain = assembly.group.getObjectByName('aether-spine-chain') as THREE.InstancedMesh
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3()
    let minScale = Infinity, maxScale = -Infinity
    const sample = (progress: number) => {
      assembly.update(progress, 1, 1)
      const journey = sampleJourney(progress)
      assembly.group.position.y = journey.height
      assembly.group.rotation.y = journey.structureYaw
      assembly.group.updateMatrixWorld(true)
      return Array.from({ length: chain.count }, (_, i) => {
        chain.getMatrixAt(i, matrix)
        matrix.decompose(position, rotation, scale)
        minScale = Math.min(minScale, scale.x, scale.y, scale.z)
        maxScale = Math.max(maxScale, scale.x, scale.y, scale.z)
        return chain.localToWorld(position.clone())
      })
    }
    try {
      expect(chain.count).toBe(mobile ? 52 : 40)
      const initial = sample(.30)
      let previous = initial
      let maxStep = 0, minSpacing = Infinity, maxSpacing = 0, maxRise = -Infinity
      let minTangentAlignment = 1
      for (let step = 1; step <= 350; step++) {
        const progress = .30 + step / 1000
        const points = sample(progress)
        maxRise = Math.max(maxRise, points[0].y - previous[0].y)
        for (let i = 0; i < points.length; i++) {
          // A recycled link would jump the full length of the old strand.
          maxStep = Math.max(maxStep, points[i].distanceTo(previous[i]))
          if (i) {
            const spacing = points[i].distanceTo(points[i - 1])
            minSpacing = Math.min(minSpacing, spacing)
            maxSpacing = Math.max(maxSpacing, spacing)
            chain.getMatrixAt(i - 1, matrix)
            const alongLink = new THREE.Vector3(0, 1, 0).transformDirection(matrix)
              .transformDirection(chain.matrixWorld)
            const alongChain = points[i].clone().sub(points[i - 1]).normalize()
            minTangentAlignment = Math.min(minTangentAlignment, alongLink.dot(alongChain))
          }
        }
        previous = points
      }
      expect(maxRise).toBeLessThan(0)
      expect(maxStep).toBeLessThan(.15)
      expect(minSpacing).toBeGreaterThan(.40)
      expect(maxSpacing).toBeLessThan(.45)
      expect(minTangentAlignment).toBeGreaterThan(.99)
      expect(minScale).toBeCloseTo(1, 5)
      expect(maxScale).toBeCloseTo(1, 5)
      expect(sample(.30)).toEqual(initial)
      expect(sample(.30)).toEqual(initial)
    } finally { assembly.dispose() }
  }
})


test('@interaction winding retains a fixed height envelope and reverses exactly', () => {
  for(const mobile of [false,true]) {
    let lastAngle=0,travel=0;
    const initial=sampleChainPath(.29,mobile).getPointAt(0);
    for(let step=0;step<=360;step++) {
      const p=.29+step/1000,path=sampleChainPath(p,mobile),top=path.getPointAt(0);
      expect(top.y).toBe(initial.y);
      expect(Math.hypot(top.x,top.z)).toBeCloseTo(1.85,8);
      const angle=Math.atan2(top.z,top.x);
      if(step) {const delta=Math.atan2(Math.sin(angle-lastAngle),Math.cos(angle-lastAngle));expect(delta).toBeGreaterThan(0);expect(delta).toBeLessThan(.016);travel+=delta;}
      lastAngle=angle;
      const tangent=path.getTangentAt(.2);
      expect(Math.atan2(-tangent.y,Math.hypot(tangent.x,tangent.z))*180/Math.PI).toBeGreaterThan(50);
    }
    expect(travel).toBeGreaterThan(2.5);
    expect(sampleChainPath(.29,mobile).getPointAt(0)).toEqual(initial);
  }
});
test('@interaction chain terminal keeps the same screen height through winding and reverse scroll', () => {
  for(const mobile of [false,true]) {
    const assembly=createSpineAssembly(false,mobile);
    const chain=assembly.group.getObjectByName('aether-spine-chain') as THREE.InstancedMesh;
    const camera=new THREE.PerspectiveCamera(42,mobile?390/844:1440/900,.1,100);
    const matrix=new THREE.Matrix4();
    const sample=(p:number)=>{
      const j=sampleJourney(p),r=j.radius+(mobile?4.8:0);
      camera.position.set(Math.sin(j.azimuth)*Math.cos(j.elevation)*r,j.height+Math.sin(j.elevation)*r,Math.cos(j.azimuth)*Math.cos(j.elevation)*r);
      camera.lookAt(0,j.height,0);camera.updateMatrixWorld();
      assembly.group.position.y=j.height;assembly.group.rotation.y=j.structureYaw;
      assembly.update(p,1,1,mobile,camera);assembly.group.updateMatrixWorld(true);
      chain.getMatrixAt(0,matrix);
      const top=chain.localToWorld(new THREE.Vector3().setFromMatrixPosition(matrix)).project(camera);
      expect(top.y).toBeCloseTo(.72,5);
      return Array.from(chain.instanceMatrix.array);
    };
    try {const initial=sample(.31);for(let i=0;i<=34;i++)sample(.31+i*.01);for(let i=34;i>=0;i--)sample(.31+i*.01);expect(sample(.31)).toEqual(initial);}finally{assembly.dispose();}
  }
});
