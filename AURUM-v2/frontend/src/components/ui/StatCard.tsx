interface Props {
  label: string
  value: string
  sub?:  string
  color?: string
  wide?:  boolean
}

export function StatCard({ label, value, sub, color, wide }: Props) {
  return (
    <div className={`bg-[#070d1a] border border-slate-800/80 rounded-lg p-4 ${wide ? 'col-span-2' : ''}`}>
      <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${color ?? 'text-slate-100'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  )
}
