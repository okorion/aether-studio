import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import ProjectArt from './ProjectArt'
import SceneBoundary from './SceneBoundary'
import { projects } from './projects'
import type { Project } from './projects'
import { sampleJourney } from './Journey'

const tracks = ['01 — Blue hour', '02 — Slow current', '03 — Afterlight']

const Scene = lazy(() => import('./Scene'))

type View = 'home' | 'work' | 'contact'

function currentView(): View {
  const hash = window.location.hash
  return hash === '#work' ? 'work' : hash === '#contact' ? 'contact' : 'home'
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = () => setReduced(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  return reduced
}

function Arrow() {
  return <span aria-hidden="true">↗</span>
}

function ProjectDialog({
  project,
  onClose,
  onNext,
}: {
  project: Project | null
  onClose: () => void
  onNext: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const isOpen = project !== null
  useEffect(() => {
    if (!isOpen) return
    const node = dialog.current!
    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    node.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      node.close()
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus({ preventScroll: true })
    }
  }, [isOpen])

  return (
    <dialog
      ref={dialog}
      className="project-dialog"
      aria-labelledby="project-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      {project && (
        <div className="project-detail">
          <button className="close-button" onClick={onClose} aria-label="Close project">
            <span aria-hidden="true">×</span>
          </button>
          <div className="detail-art">
            <ProjectArt theme={project.theme} />
            <div className="detail-art-title">{project.name}</div>
          </div>
          <div className="detail-copy">
            <div className="eyebrow">
              {project.category} <span> / {project.year}</span>
            </div>
            <h2 id="project-title">{project.tagline}</h2>
            <p>{project.description}</p>
            <div className="detail-disciplines">
              {project.disciplines.map((discipline) => (
                <span key={discipline}>{discipline}</span>
              ))}
            </div>
            <div className="detail-bottom">
              <span className="eyebrow">
                INDEPENDENT CONCEPT / {String(projects.indexOf(project) + 1).padStart(2, '0')}
              </span>
              <button className="text-link" onClick={onNext}>
                Next project <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}

export default function App() {
  const systemReducedMotion = useReducedMotion()
  const [motionPaused, setMotionPaused] = useState(false)
  const reducedMotion = systemReducedMotion || motionPaused
  const [ready, setReady] = useState(false)
  const [activeSection, setActiveSection] = useState<View>(currentView)
  const [project, setProject] = useState<Project | null>(null)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [audioBusy, setAudioBusy] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [track, setTrack] = useState(0)
  const audio = useRef<ReturnType<(typeof import('./audio'))['createAmbientAudio']> | null>(null)
  const journey = useRef<HTMLDivElement>(null)
  const onReady = useCallback(() => setReady(true), [])

  useEffect(() => {
    const navigate = () => {
      setProject(null)
      setActiveSection(currentView())
    }
    const previousRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    window.addEventListener('hashchange', navigate)
    return () => {
      window.history.scrollRestoration = previousRestoration
      window.removeEventListener('hashchange', navigate)
    }
  }, [])

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [activeSection])

  useEffect(() => {
    if (activeSection !== 'home') return
    let frame = 0
    const update = () => {
      frame = 0
      const maximum = document.documentElement.scrollHeight - window.innerHeight
      const progress = maximum > 0 ? Math.min(1, Math.max(0, window.scrollY / maximum)) : 0
      const state = sampleJourney(progress)
      if (journey.current) {
        journey.current.dataset.stage = state.overlay
        journey.current.dataset.step = String(state.index + 1)
        journey.current.dataset.orbitEnabled = String(state.orbitEnabled)
        journey.current.style.setProperty('--journey-progress', String(progress))
      }
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [activeSection])

  useEffect(() => {
    const visibility = () => audio.current?.setVisible(!document.hidden)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      audio.current?.dispose()
      audio.current = null
    }
  }, [])

  async function toggleAudio() {
    if (audioBusy) return
    setAudioBusy(true)
    setAudioError('')
    try {
      if (audioEnabled) {
        audio.current?.pause()
        setAudioEnabled(false)
      } else {
        if (!audio.current) {
          const { createAmbientAudio } = await import('./audio')
          audio.current = createAmbientAudio(track)
        }
        await audio.current.play()
        setAudioEnabled(true)
      }
    } catch {
      setAudioError('Sound is unavailable in this browser.')
    } finally {
      setAudioBusy(false)
    }
  }

  function changeTrack(direction: number) {
    const next = (track + direction + tracks.length) % tracks.length
    setTrack(next)
    audio.current?.setTrack(next)
  }

  return (
    <div
      className={`experience ${ready ? 'is-ready' : ''} ${reducedMotion ? 'motion-paused' : ''}`}
      data-view={activeSection}
    >
      <a className="skip-link" href="#work">
        Skip to selected work
      </a>
      <div className="scene-fallback" aria-hidden="true">
        <div className="fallback-ring" />
        <div className="fallback-halo" />
      </div>
      <SceneBoundary onUnavailable={onReady}>
        <Suspense fallback={null}>
          <Scene reducedMotion={reducedMotion} active={activeSection === 'home' && !project} onReady={onReady} />
        </Suspense>
      </SceneBoundary>
      <div className="film-grain" aria-hidden="true" />
      <div className="screen-vignette" aria-hidden="true" />

      <header className="site-header">
        <a href="#home" className="brand-mark" aria-label="Aether Studio home">
          <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <circle cx="20" cy="20" r="18" />
            <path d="m11 28 9-19 9 19M14 22h12" />
          </svg>
          <span>
            AETHER
            <br />
            STUDIO
          </span>
        </a>
        <div className="navigation-wrap">
          <nav className="main-nav" aria-label="Main navigation">
            <a href="#work" aria-current={activeSection === 'work' ? 'location' : undefined}>
              Work
            </a>
            <button
              className={`audio-toggle ${audioEnabled ? 'is-playing' : ''}`}
              onClick={() => void toggleAudio()}
              disabled={audioBusy}
              aria-label={audioEnabled ? 'Mute ambient sound' : 'Enable ambient sound'}
              aria-pressed={audioEnabled}
            >
              <span className="sound-wave" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                  <i key={n} />
                ))}
              </span>
            </button>
            <a href="#contact" aria-current={activeSection === 'contact' ? 'location' : undefined}>
              Contact
            </a>
          </nav>
          {audioEnabled && (
            <div className="audio-player">
              <button onClick={() => changeTrack(-1)} aria-label="Previous soundscape">
                ←
              </button>
              <span aria-live="polite">{tracks[track]}</span>
              <button onClick={() => changeTrack(1)} aria-label="Next soundscape">
                →
              </button>
            </div>
          )}
          <div className="audio-error" role="status">
            {audioError}
          </div>
        </div>
      </header>

      <aside className="chapter-nav" aria-label="Page chapters" hidden={activeSection === 'home'}>
        {['home', 'work', 'contact'].map((section, i) => (
          <a
            key={section}
            href={`#${section}`}
            aria-label={`Go to ${section}`}
            aria-current={activeSection === section ? 'location' : undefined}
          >
            <span>{String(i + 1).padStart(2, '0')}</span>
            <i />
          </a>
        ))}
      </aside>

      <main>
        <section
          id="home"
          className="hero"
          aria-labelledby="hero-title"
          hidden={activeSection !== 'home'}
        >
          <div className="hero-stage" ref={journey} data-stage="entry">
            <button
              className="scroll-invitation"
              onClick={() =>
                window.scrollBy({
                  top: window.innerHeight,
                  behavior: reducedMotion ? 'instant' : 'smooth',
                })
              }
              aria-label="Scroll through the 3D world"
            >
              <span>{ready ? 'SCROLL TO EXPLORE' : 'ENTERING AETHER'}</span>
              <i />
            </button>
            <div className="hero-bottom">
              <div>
                <p className="eyebrow">INDEPENDENT CREATIVE STUDIO</p>
                <h1 id="hero-title">
                  Digital worlds.
                  <br />
                  <span>Human wonder.</span>
                </h1>
              </div>
              <p className="hero-description">
                At the intersection of art,
                <br />
                technology, and the unexpected.
              </p>
              <a className="round-link" href="#work" aria-label="Explore selected work">
                ↓
              </a>
            </div>
            <div className="journey-statement journey-overlay" aria-hidden="true">
              <p className="journey-title">
                WORLDS
                <br />
                IN
                <br />
                <span>MOTION.</span>
              </p>
              <p className="journey-description">
                We shape worlds
                <br />
                at the edge of possibility.
                <br />
                Art, code, and human curiosity.
              </p>
            </div>
            <div className="journey-work journey-overlay">
              <p className="eyebrow">SELECTED EXPLORATIONS / 01 — 04</p>
              <p>Selected worlds.</p>
              <p className="journey-project-description">
                An imagined world.
                <br />A new way to feel.
              </p>
              <a href="#work" className="text-link">
                Enter our work <Arrow />
              </a>
            </div>
            <div className="journey-machine journey-overlay">
              <p className="eyebrow">EXPLORATION 003 / ORBITAL</p>
              <p>
                Between matter
                <br />
                and imagination.
              </p>
            </div>
            <div className="journey-scales journey-overlay">
              <p className="eyebrow">MATTER / IN CONSTANT CHANGE</p>
              <p>A thousand surfaces.<br />One living form.</p>
            </div>
            <div className="journey-contact journey-overlay">
              <p className="eyebrow">THE NEXT WORLD IS OURS TO MAKE</p>
              <p>
                Let's make
                <br />
                <em>the unexpected.</em>
              </p>
              <a href="#contact" className="text-link">
                Start a conversation <Arrow />
              </a>
            </div>
            <div className="interaction-hint" aria-hidden="true">
              <span className="pointer-hint">
                DRAG TO ORBIT <span>·</span> DOUBLE CLICK TO RECENTER
              </span>
              <span className="scroll-hint">SCROLL TO DESCEND <span>·</span> REVERSE TO ASCEND</span>
              <span className="touch-hint">SCROLL TO JOURNEY THROUGH</span>
            </div>
            <div className="journey-progress" aria-hidden="true">
              <span />
            </div>
          </div>
        </section>

        <section
          id="work"
          className="work-section"
          aria-labelledby="work-title"
          hidden={activeSection !== 'work'}
        >
          <div className="section-heading">
            <p className="eyebrow">01 / SELECTED EXPLORATIONS</p>
            <span className="eyebrow">2025 — 2026</span>
          </div>
          <div className="work-intro">
            <h2 id="work-title">
              Worlds worth
              <br />
              <em>entering.</em>
            </h2>
            <p>
              We turn curiosity into experiences.
              <br />A selection of imagined worlds,
              <br />
              built to make you feel something.
            </p>
          </div>
          <div className="project-grid">
            {projects.map((item, i) => (
              <button
                key={item.id}
                className={`project-card card-${item.theme}`}
                onClick={() => setProject(item)}
                aria-label={`Explore ${item.name}`}
              >
                <div className="project-visual">
                  <ProjectArt theme={item.theme} />
                  <span className="project-number">/ 0{i + 1}</span>
                  <span className="project-open">
                    <Arrow />
                  </span>
                </div>
                <div className="project-meta">
                  <h3>{item.name}</h3>
                  <span>{item.category}</span>
                  <span className="project-year">{item.year}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="work-note">
            <span className="small-star" aria-hidden="true">
              ✳
            </span>
            <p>
              Different disciplines.
              <br />
              One shared sense of possibility.
            </p>
            <a href="#contact" className="text-link">
              A little about us <Arrow />
            </a>
          </div>
        </section>

        <section
          id="contact"
          className="contact-section"
          aria-labelledby="contact-title"
          hidden={activeSection !== 'contact'}
        >
          <div className="section-heading">
            <p className="eyebrow">02 / OPEN POSSIBILITIES</p>
            <span className="availability">
              <i /> IDEAS WELCOME
            </span>
          </div>
          <div className="contact-main">
            <p className="studio-statement">
              A small, independent studio exploring the space between digital and physical. We bring
              design, code, and a curious mind to everything we make.
            </p>
            <h2 id="contact-title">
              Let's make
              <br />
              the <em>unexpected.</em>
            </h2>
            <a className="contact-email" href="mailto:hello@aether.example">
              hello@aether.example <Arrow />
            </a>
            <p className="concept-note">
              An independent concept studio. Contact details are illustrative.
            </p>
          </div>
          <footer>
            <a href="#home" className="footer-brand">
              AETHER STUDIO <span>© 2026</span>
            </a>
            <p>IMAGINATION, IN MOTION.</p>
            <a href="#home" className="text-link">
              Back to the surface <span aria-hidden="true">↑</span>
            </a>
          </footer>
        </section>
      </main>

      <div className="experience-controls" role="region" aria-label="Experience controls">
        <span className="live-dot" aria-hidden="true" />
        <span>
          REALTIME /{' '}
          {activeSection === 'home'
            ? 'THE SPACE BETWEEN'
            : activeSection === 'work'
              ? 'SELECTED WORK'
              : 'OPEN POSSIBILITIES'}
        </span>
        <button
          onClick={() => setMotionPaused(!motionPaused)}
          aria-label={reducedMotion ? 'Motion reduced' : 'Pause motion'}
          aria-pressed={reducedMotion}
          disabled={systemReducedMotion}
        >
          {reducedMotion ? 'MOTION OFF' : 'PAUSE MOTION'}
          <span aria-hidden="true">{reducedMotion ? '▷' : 'Ⅱ'}</span>
        </button>
      </div>
      <ProjectDialog
        project={project}
        onClose={() => setProject(null)}
        onNext={() =>
          setProject(
            (current) =>
              projects[
                (projects.findIndex((item) => item.id === current?.id) + 1) % projects.length
              ],
          )
        }
      />
    </div>
  )
}
