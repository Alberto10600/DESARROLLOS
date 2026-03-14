import { Component, ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-6 max-w-lg">
            <h2 className="text-red-400 font-bold mb-2">Error en el módulo</h2>
            <p className="text-slate-400 text-sm font-mono">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="mt-4 px-4 py-2 bg-red-600 text-white text-xs rounded hover:bg-red-500"
            >
              Reintentar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
