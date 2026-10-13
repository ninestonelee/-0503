import { useState } from 'react'
import { PORTALS, QUICK_SEARCHES } from '../data/programs'

export default function Portals() {
  const [query, setQuery] = useState('')
  const trimmed = query.trim()
  const searchable = PORTALS.filter((p) => p.searchUrl)

  return (
    <section className="card" id="portals" aria-labelledby="portals-title">
      <h2 id="portals-title">4. 공고 링크 / 검색</h2>
      <p className="muted">공식 포털 3곳을 즐겨찾기 해 두고, 아래 빠른 검색으로 최신 공고를 확인하세요.</p>

      <ul className="portal-list">
        {PORTALS.map((p) => (
          <li key={p.id}>
            <a className="portal-link" href={p.url} target="_blank" rel="noopener noreferrer">
              <strong>{p.name}</strong>
              <span className="muted small">{p.url.replace(/^https?:\/\//, '')}</span>
            </a>
            <p className="small">{p.description}</p>
          </li>
        ))}
      </ul>

      <h3>빠른 검색</h3>
      <div className="search-row">
        <input
          type="search"
          placeholder="검색어 입력 (예: 소상공인 AI)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="공고 검색어"
        />
        {searchable.map((p) => (
          <a
            key={p.id}
            className={`btn-primary ${trimmed ? '' : 'disabled'}`}
            href={trimmed ? p.searchUrl!(trimmed) : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!trimmed}
            onClick={(e) => {
              if (!trimmed) e.preventDefault()
            }}
          >
            {p.name}에서 검색
          </a>
        ))}
      </div>

      <ul className="chip-list">
        {QUICK_SEARCHES.map((q) => {
          const portal = PORTALS.find((p) => p.id === q.portalId)
          if (!portal) return null
          const href = portal.searchUrl ? portal.searchUrl(q.query) : portal.url
          return (
            <li key={`${q.portalId}-${q.query}`}>
              <a className="chip" href={href} target="_blank" rel="noopener noreferrer">
                {q.label} <span className="muted">· {portal.name}</span>
              </a>
            </li>
          )
        })}
      </ul>
      <p className="muted small">
        검색 URL 구조는 포털 개편 시 바뀔 수 있습니다. 링크가 열리지 않으면 포털 메인에서 직접 검색하세요.
      </p>
    </section>
  )
}
