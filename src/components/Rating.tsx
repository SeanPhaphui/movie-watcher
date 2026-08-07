/** TMDB user score, shown as a ring so it reads at a glance on a card. */
export function Rating({
  score,
  votes,
  size = 44,
}: {
  score: number
  votes?: number
  size?: number
}) {
  if (!score) return null
  const pct = Math.round(score * 10)
  const tone = pct >= 70 ? 'good' : pct >= 50 ? 'ok' : 'poor'
  const r = size / 2 - 3
  const circumference = 2 * Math.PI * r

  return (
    <div className={`rating rating-${tone}`} title={votes ? `${votes.toLocaleString()} votes` : undefined}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} className="rating-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="rating-arc"
          strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="rating-num">{pct}</span>
    </div>
  )
}
