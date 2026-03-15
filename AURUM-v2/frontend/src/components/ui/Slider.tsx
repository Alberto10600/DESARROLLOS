interface Props {
  label:    string
  value:    number
  min:      number
  max:      number
  step:     number
  decimals?: number
  unit?:    string
  onChange: (v: number) => void
}

export function Slider({ label, value, min, max, step, decimals = 0, unit = '', onChange }: Props) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[11px]">
        <span className="text-slate-500">{label}</span>
        <span className="text-amber-400 font-mono">{value.toFixed(decimals)}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-1 appearance-none bg-slate-800 rounded-full cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3
          [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:cursor-pointer"
      />
      <div className="flex justify-between text-[10px] text-slate-700">
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  )
}
