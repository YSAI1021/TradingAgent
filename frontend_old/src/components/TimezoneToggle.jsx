import { useTimezone } from '../context/TimezoneContext'
import { getTimezoneAbbr } from '../utils/dateFormatter'
import './TimezoneToggle.css'

export default function TimezoneToggle() {
  const { timezone, toggleTimezone, isEST } = useTimezone()
  const currentTZ = getTimezoneAbbr(timezone)

  const tooltipText = isEST
    ? 'Currently in EST. Click to switch back to your local timezone.'
    : `Currently in local timezone (${currentTZ}). Click to switch to EST.`

  return (
    <button
      className="timezone-toggle-btn"
      onClick={toggleTimezone}
      title={tooltipText}
    >
      <i className="far fa-clock"></i>
      {isEST ? (
        <>
          <span className="tz-label">EST</span>
        </>
      ) : (
        <>
          <span className="tz-prefix">Local</span>
          <span className="tz-label">{currentTZ}</span>
        </>
      )}
      <i className="fas fa-exchange-alt tz-switch-icon"></i>
    </button>
  )
}
