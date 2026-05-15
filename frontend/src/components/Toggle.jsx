export default function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors cursor-pointer focus:outline-none ${
        checked ? 'bg-cyan-600' : 'bg-gray-700'
      }`}>
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition-transform ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`} />
    </button>
  )
}
