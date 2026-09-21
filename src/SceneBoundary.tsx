import { Component } from 'react'
import type { ReactNode } from 'react'

/** Keep the accessible site and CSS scene available if the optional 3D chunk fails. */
export default class SceneBoundary extends Component<
  {
    children: ReactNode
    onUnavailable: () => void
  },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onUnavailable()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
