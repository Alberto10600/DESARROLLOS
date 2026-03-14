interface Props {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  unit?: string
  decimals?: number
}

export function Slider({ label, value, min, max, step = 1, onChange, unit = '', decimals = 0 }: Props) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-24 shrink-0">{label}</span>
      <div className="flex-1 relative">
        <input
          type="range"
          min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-full h-1 appearance-none bg-slate-700 rounded accent-amber-400 cursor-pointer"
          style={{
            background: `linear-gradient(to right, #f59e0b ${pct}%, #374151 ${pct}%)`
          }}
        />
      </div>
      <span className="text-xs font-mono text-amber-400 w-14 text-right shrink-0">
        {decimals > 0 ? value.toFixed(decimals) : value}{unit}
      </span>
    </div>
  )
}
