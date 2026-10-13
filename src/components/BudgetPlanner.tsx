import { useMemo, useState } from 'react'
import { BUDGET_CATEGORIES, DEFAULT_GRANT_AMOUNT, MARKETING_MIN_PERCENT } from '../data/programs'

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`

export default function BudgetPlanner() {
  const [total, setTotal] = useState(DEFAULT_GRANT_AMOUNT)
  const [percents, setPercents] = useState<Record<string, number>>(() =>
    Object.fromEntries(BUDGET_CATEGORIES.map((c) => [c.id, c.defaultPercent])),
  )

  const allocated = useMemo(
    () => BUDGET_CATEGORIES.reduce((sum, c) => sum + (percents[c.id] ?? 0), 0),
    [percents],
  )
  const remainingPercent = 100 - allocated
  const remainingAmount = (total * remainingPercent) / 100

  const ipPercent = percents['ip'] ?? 0
  const marketingPercent = percents['marketing'] ?? 0
  const warnings: string[] = []
  if (ipPercent === 0) {
    warnings.push(
      '지식재산권(특허·상표·디자인) 예산이 0원입니다. IP 출원은 사업 성과 지표로 인정되는 경우가 많으니 일부라도 배정하는 것을 권장합니다.',
    )
  }
  if (marketingPercent < MARKETING_MIN_PERCENT) {
    warnings.push(
      `홍보·마케팅 비율이 ${marketingPercent}%로 권장 최소치(${MARKETING_MIN_PERCENT}%)보다 낮습니다. 유튜브·인플루언서·체험단 등 매출로 이어지는 마케팅에 충분히 배정하세요.`,
    )
  }
  if (remainingPercent < 0) {
    warnings.push(`배정 합계가 100%를 ${-remainingPercent}% 초과했습니다. 항목을 줄여 주세요.`)
  }

  const setPercent = (id: string, value: number) =>
    setPercents((p) => ({ ...p, [id]: Math.min(100, Math.max(0, value)) }))

  const reset = () => {
    setTotal(DEFAULT_GRANT_AMOUNT)
    setPercents(Object.fromEntries(BUDGET_CATEGORIES.map((c) => [c.id, c.defaultPercent])))
  }

  return (
    <section className="card" id="budget" aria-labelledby="budget-title">
      <h2 id="budget-title">2. 지원금 사용계획 계산기</h2>
      <p className="muted">총 지원금을 입력하고 항목별 비율을 조정해 사용계획 초안을 잡아 보세요.</p>

      <div className="budget-total">
        <label>
          <span>총 지원금 (원)</span>
          <input
            type="number"
            min={0}
            step={1_000_000}
            value={total}
            onChange={(e) => setTotal(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <div className="budget-total-display">{won(total)}</div>
        <button type="button" className="btn-ghost" onClick={reset}>
          초기값으로
        </button>
      </div>

      <div className="stack-bar" role="img" aria-label="항목별 예산 비율 막대">
        {BUDGET_CATEGORIES.map((c) => {
          const pct = percents[c.id] ?? 0
          return pct > 0 ? (
            <div key={c.id} className={`stack-seg seg-${c.id}`} style={{ width: `${Math.min(pct, 100)}%` }} title={`${c.name} ${pct}%`}>
              {pct >= 8 ? `${pct}%` : ''}
            </div>
          ) : null
        })}
        {remainingPercent > 0 && (
          <div className="stack-seg seg-remaining" style={{ width: `${remainingPercent}%` }} title={`미배정 ${remainingPercent}%`}>
            {remainingPercent >= 8 ? `${remainingPercent}%` : ''}
          </div>
        )}
      </div>

      <div className="budget-rows">
        {BUDGET_CATEGORIES.map((c) => {
          const pct = percents[c.id] ?? 0
          return (
            <div key={c.id} className="budget-row">
              <div className="budget-row-label">
                <span className={`swatch seg-${c.id}`} />
                <div>
                  <div className="budget-name">{c.name}</div>
                  <div className="muted small">{c.description}</div>
                </div>
              </div>
              <div className="budget-row-controls">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={pct}
                  aria-label={`${c.name} 비율`}
                  onChange={(e) => setPercent(c.id, Number(e.target.value))}
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={pct}
                  aria-label={`${c.name} 비율 (숫자)`}
                  onChange={(e) => setPercent(c.id, Number(e.target.value) || 0)}
                />
                <span className="pct">%</span>
                <span className="amount">{won((total * pct) / 100)}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className={`budget-summary ${remainingPercent < 0 ? 'over' : ''}`}>
        <div>
          <span className="muted">배정 합계</span>
          <strong>
            {allocated}% · {won((total * allocated) / 100)}
          </strong>
        </div>
        <div>
          <span className="muted">잔여 금액</span>
          <strong>
            {remainingPercent}% · {won(remainingAmount)}
          </strong>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="callout callout-warn">
          <strong>확인이 필요합니다</strong>
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
