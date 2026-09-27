/* global window, performance, WebGL2RenderingContext */
// Diagnostic runs only. Never installed in the final timing comparison.
export function installLoadingProfileProbe() {
  const calls = []
  const programs = new Map()
  const shaders = new Map()
  let nextProgram = 0
  window.__loadingGL = { calls, programs: [] }
  for (const name of ['createProgram', 'deleteProgram', 'shaderSource', 'attachShader', 'compileShader',
    'linkProgram', 'getProgramParameter', 'getProgramInfoLog', 'getShaderInfoLog',
    'getUniformLocation', 'getActiveUniform', 'getAttribLocation', 'getActiveAttrib',
    'bufferData', 'bufferSubData', 'texImage2D', 'texSubImage2D', 'texStorage2D', 'generateMipmap',
    'drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    const original = WebGL2RenderingContext.prototype[name]
    WebGL2RenderingContext.prototype[name] = function (...args) {
      const start = performance.now()
      const result = original.apply(this, args)
      calls.push({ name, start, duration: performance.now() - start,
        bytes: name === 'bufferData' ? (args[1]?.byteLength ?? (typeof args[1] === 'number' ? args[1] : 0)) : 0 })
      if (name === 'shaderSource') shaders.set(args[0], args[1])
      if (name === 'createProgram') {
        const record = { id: ++nextProgram, start, sources: [] }
        programs.set(result, record)
        window.__loadingGL.programs.push(record)
      }
      if (name === 'attachShader') programs.get(args[0])?.sources.push(shaders.get(args[1]))
      if (name === 'deleteProgram' && programs.has(args[0])) programs.get(args[0]).deleted = start
      return result
    }
  }
}
