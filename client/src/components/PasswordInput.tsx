import { LIMITS } from '../lib/limits'
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type Props = {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  minLength?: number
  autoComplete?: string
  /** Rendered on the right of the label, e.g. a "Forgot password?" link. */
  labelAction?: React.ReactNode
}

export default function PasswordInput({
  value,
  onChange,
  label,
  placeholder,
  minLength,
  autoComplete,
  labelAction,
}: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={`pw-${label}`} className="text-sm font-semibold text-content">
          {label}
        </label>
        {labelAction}
      </div>

      <div className="relative">
        <input
          id={`pw-${label}`}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={minLength}
          // bcrypt hashes only the first 72 bytes, so anything past this is discarded
          // server-side — better to stop here than to accept a password that is
          // silently truncated on the way in and again at every login.
          maxLength={LIMITS.password}
          autoComplete={autoComplete}
          // extra right padding so long passwords never run under the toggle
          className="w-full px-4 py-2.5 pr-12 rounded-xl bg-line/5 border border-line/15 text-sm text-content placeholder:text-content/30 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition-all"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // tabIndex -1 keeps Tab going straight from the field to the submit button
          tabIndex={-1}
          aria-label={visible ? 'Hide password' : 'Show password'}
          title={visible ? 'Hide password' : 'Show password'}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg flex items-center justify-center text-content/40 hover:text-gold hover:bg-line/5 transition-all"
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </div>
  )
}
