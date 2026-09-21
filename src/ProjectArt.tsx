import type { Project } from './projects'

export default function ProjectArt({ theme }: { theme: Project['theme'] }) {
  return (
    <div className={`project-art art-${theme}`} aria-hidden="true">
      <div className="art-grid" />
      <div className="art-glow" />
      <div className="art-sphere" />
      <div className="art-orbit orbit-one" />
      <div className="art-orbit orbit-two" />
      <div className="art-orbit orbit-three" />
      <div className="art-horizon" />
      <span className="art-coordinate">
        {theme === 'liminal'
          ? '40° 43′ N'
          : theme === 'pulse'
            ? 'SIGNAL / 002'
            : theme === 'orbital'
              ? 'BEYOND / 003'
              : 'LIGHT / 004'}
      </span>
      <span className="art-cross">+</span>
    </div>
  )
}
