/** Viewport-space veil, composed after tone mapping. No world/camera height. */
export const columnHazeGLSL = /* glsl */ `
  float hazeHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float hazeNoise(vec2 p) {
    vec2 cell=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hazeHash(cell),hazeHash(cell+vec2(1,0)),f.x),
      mix(hazeHash(cell+vec2(0,1)),hazeHash(cell+vec2(1,1)),f.x),f.y);
  }
  vec3 columnHaze(vec3 sceneColor, vec2 uv, float aspect, float time, float visibility) {
    // The centre and ellipse follow the complete viewport, not a cropped image
    // or a fixed percentage of the mobile screen. Portrait and landscape use
    // the same optical frame: the lower-left centre moves with aspect ratio.
    vec2 centre=vec2(-.20, .5-.5*aspect);
    vec2 axes=vec2(1.4,1.3*aspect);
    vec2 displacement=surfaceDisplacement(uv);
    vec2 optical=(uv-centre-displacement*.65)/axes;
    float envelope=1.-smoothstep(.20,.65,length(optical));

    vec2 drift=vec2(time*.018,-time*.012);
    vec2 cloudUV=(uv-displacement*3.8)*vec2(aspect,1.);
    float cloud=hazeNoise(cloudUV*3.6+drift);
    cloud=.7*cloud+.3*hazeNoise(cloudUV*7.1-drift+cloud*.4);
    // Fine folds follow the transported gas instead of a circular reveal mask.
    vec2 folds=vec2(hazeNoise(cloudUV*31.+drift)-.5,
      hazeNoise(cloudUV*37.-drift+7.3)-.5);
    vec2 wakeUv=uv+folds*.017/vec2(aspect,1.);
    vec3 field=surfaceSample(wakeUv).rgb;
    vec2 velocity=(field.rg-vec2(128./255.))*(255./127.);
    // The existing advected field opens a soft wake through the veil. It does
    // not brighten the fog or pull the rendered scene/DOM along with the cursor.
    // A moving pressure front folds and compresses the veil at the wake's edge.
    // It follows transported density, so it is an uneven energy sheet rather
    // than a circle stamped at the cursor position.
    vec2 gradient=vec2(
      surfaceSample(wakeUv+vec2(uFlowTexel.x,0.)).b-surfaceSample(wakeUv-vec2(uFlowTexel.x,0.)).b,
      surfaceSample(wakeUv+vec2(0.,uFlowTexel.y)).b-surfaceSample(wakeUv-vec2(0.,uFlowTexel.y)).b);
    float front=length(gradient)*3.5;
    vec2 warp=vec2(hazeNoise(cloudUV*8.+cloud),hazeNoise(cloudUV*9.-cloud+4.));
    float wisps=hazeNoise(cloudUV*vec2(19.,48.)+warp*3.5+displacement*35.);
    float smallFold=hazeNoise(cloudUV*vec2(53.,87.)+warp*5.+displacement*48.);
    float filament=pow(1.-abs(wisps*2.-1.),7.)*(.45+smallFold*.55);
    float edgeBand=1.-smoothstep(.08,.46,abs(field.b-.34));
    float pressure=min(.72,pow(length(velocity)*2.8,2.)+front*.38)*edgeBand;
    // Displace the corner's optical boundary instead of erasing a Gaussian
    // disk from its opacity. The moving edge leaves a compressed, folded sheet.
    optical+=vec2(pressure*(.75+wisps*.25),pressure*.35)
      +gradient*vec2(.18,.10);
    envelope=1.-smoothstep(.20,.65,length(optical));
    float compression=pressure*(.12+filament*.88);
    envelope*=1.-min(.22,front*.20)*(1.-smallFold);
    float coverage=envelope*(.69+cloud*.22+wisps*.09)*visibility;
    vec3 tint=mix(vec3(.11,.067,.205),vec3(.18,.13,.285),cloud*.65+wisps*.35);
    sceneColor+=mix(vec3(.13,.08,.30),vec3(.16,.29,.38),wisps)
      *compression*envelope*visibility*.75;

    // A much weaker edge glow is separate from the interactive lower-left veil.
    // It stays in place when touched and cannot create another clearing circle.
    vec2 frame=(uv-.5)/vec2(1.4,aspect);
    float edge=smoothstep(.1,.8,length(frame));
    float edgeCloud=hazeNoise(uv*vec2(aspect,1.)*2.7+drift);
    vec3 ambient=mix(vec3(.018,.008,.038),vec3(.008,.025,.029),edgeCloud);
    sceneColor+=ambient*edge*(.35+edgeCloud*.65)*visibility;
    return mix(sceneColor,tint,coverage);
  }
`
