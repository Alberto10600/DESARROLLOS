import { useStore } from './store'
import { Sidebar }  from './components/Sidebar'
import { Workspace } from './pages/Workspace'
import { Validate }  from './pages/Validate'
import { Deploy }    from './pages/Deploy'
import { Monitor }   from './pages/Monitor'

export function App() {
  const { page } = useStore()

  return (
    <div className="flex h-screen bg-[#060c18] text-slate-200 overflow-hidden">
      <Sidebar />
      <div className="flex-1 overflow-hidden">
        {page === 'workspace' && <Workspace />}
        {page === 'validate'  && <Validate  />}
        {page === 'deploy'    && <Deploy    />}
        {page === 'monitor'   && <Monitor   />}
      </div>
    </div>
  )
}
