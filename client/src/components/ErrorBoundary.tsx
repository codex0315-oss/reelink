import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

/**
 * Stops one broken component from blanking the whole app.
 *
 * React unmounts the entire tree on an unhandled render error, which is why a crash
 * anywhere — a map given bad coordinates, say — leaves a white screen with no clue what
 * happened. This catches it, keeps the rest of the app alive, and shows the actual error
 * so it can be reported rather than guessed at.
 *
 * Class component because React has no hook equivalent: error boundaries still require
 * componentDidCatch.
 */
type Props = { children: ReactNode; label?: string }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept in the console too, since the component stack is far more useful than the
    // message alone when tracking down which element threw.
    console.error('Render error', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 mx-auto mb-3 flex items-center justify-center">
          <AlertTriangle size={20} className="text-danger" />
        </div>
        <p className="font-bold text-ink text-sm">
          {this.props.label ?? 'Something went wrong here'}
        </p>
        <p className="text-xs text-ink/50 mt-1 max-w-sm mx-auto">
          The rest of Reelink is still working. If this keeps happening, send us the
          message below.
        </p>

        <pre className="mt-3 mx-auto max-w-sm overflow-x-auto text-left text-[11px] text-danger/80 bg-red-500/[0.06] border border-red-500/15 rounded-lg p-3">
          {error.message}
        </pre>

        <button
          onClick={() => this.setState({ error: null })}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-ink text-app text-xs font-bold hover:bg-ink/85 transition-all"
        >
          <RotateCcw size={13} />
          Try again
        </button>
      </div>
    )
  }
}
