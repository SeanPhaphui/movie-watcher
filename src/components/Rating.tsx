// Below this, a score says more about who bothered to vote than about the film
// — a single 10/10 would render as a confident "100".
const MIN_VOTES = 10

/**
 * TMDB's user score, labelled with its source and sample size. A bare number
 * invites "where is this from, and out of what?", and an unqualified 100 from
 * three votes is worse than showing nothing.
 */
export function Rating({
  score,
  votes = 0,
  size = 46,
}: {
  score: number
  votes?: number
  size?: number
}) {
  if (!score || votes < MIN_VOTES) {
    return <div className="rating-none">Not enough<br />ratings yet</div>
  }

  const pct = Math.round(score * 10)
  const tone = pct >= 70 ? 'good' : pct >= 50 ? 'ok' : 'poor'
  const r = size / 2 - 3
  const circumference = 2 * Math.PI * r

  return (
    <div className="rating-block">
      <div className={`rating rating-${tone}`}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
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
      {/* "Audience score" rather than "TMDB score": the brand means nothing to
          most people, whereas audience-vs-critics is the distinction they
          actually read for. TMDB is credited under the providers below and in
          Settings, which satisfies the attribution their terms require. */}
      <div className="rating-meta">
        <span className="rating-source">Audience score</span>
        <span className="rating-votes">
          {votes >= 1000 ? `${(votes / 1000).toFixed(1)}k` : votes} ratings
        </span>
      </div>
      <span className="sr-only">
        Audience score {pct} out of 100, from {votes.toLocaleString()} ratings
      </span>
    </div>
  )
}
