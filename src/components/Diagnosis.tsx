import { useMemo, useState } from 'react'
import {
  BUSINESS_AGES,
  BUSINESS_TYPES,
  INDUSTRIES,
  PORTALS,
  REGIONS,
  REVENUE_BANDS,
  TIPS,
  type BusinessAge,
  type BusinessType,
  type RevenueBand,
} from '../data/programs'
import { diagnose, type DiagnosisInput, type Verdict } from '../lib/eligibility'

const VERDICT_LABEL: Record<Verdict, string> = {
  excluded: '지원 제외',
  startup: '창업 지원',
  growth: '도약 지원',
  mature: '업력 초과',
}

const CATEGORY_LABEL: Record<string, string> = {
  startup: '창업',
  growth: '도약',
  local: '업력 무관',
  voucher: '바우처',
  closed: '마감',
}

export default function Diagnosis() {
  const [form, setForm] = useState<DiagnosisInput>({
    businessType: 'individual',
    businessAge: 'under3',
    region: REGIONS[0],
    industry: INDUSTRIES[0].value,
    employees: 1,
    revenue: 'under104m',
  })
  const [submitted, setSubmitted] = useState(false)

  const result = useMemo(() => diagnose(form), [form])
  const isPrestartup = form.businessType === 'prestartup'

  const update = <K extends keyof DiagnosisInput>(key: K, value: DiagnosisInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  return (
    <section className="card" id="diagnosis" aria-labelledby="diagnosis-title">
      <h2 id="diagnosis-title">1. 자가진단</h2>
      <p className="muted">
        사업자등록증 기준으로 입력하면 어떤 지원사업에 해당하는지 바로 알려드립니다.
      </p>

      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitted(true)
          document.getElementById('diagnosis-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }}
      >
        <label>
          <span>사업자 유형</span>
          <select
            value={form.businessType}
            onChange={(e) => {
              const v = e.target.value as BusinessType
              update('businessType', v)
              if (v === 'prestartup') update('businessAge', 'prestartup')
              else if (form.businessAge === 'prestartup') update('businessAge', 'under3')
            }}
          >
            {BUSINESS_TYPES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>업력 (개업연월일 기준)</span>
          <select
            value={form.businessAge}
            disabled={isPrestartup}
            onChange={(e) => update('businessAge', e.target.value as BusinessAge)}
          >
            {BUSINESS_AGES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>지역 (시/도)</span>
          <select value={form.region} onChange={(e) => update('region', e.target.value)}>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>업종</span>
          <select value={form.industry} onChange={(e) => update('industry', e.target.value)}>
            {INDUSTRIES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
                {o.excluded ? ' — 지원 제외' : ''}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>상시근로자 수 (대표 제외)</span>
          <input
            type="number"
            min={0}
            max={999}
            value={form.employees}
            onChange={(e) => update('employees', Math.max(0, Number(e.target.value) || 0))}
          />
        </label>

        <label>
          <span>연매출</span>
          <select value={form.revenue} onChange={(e) => update('revenue', e.target.value as RevenueBand)}>
            {REVENUE_BANDS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div className="form-actions">
          <button type="submit" className="btn-primary">
            진단 결과 보기
          </button>
        </div>
      </form>

      <div id="diagnosis-result" className={`result result-${result.verdict} ${submitted ? '' : 'result-preview'}`}>
        <div className="result-head">
          <span className={`badge badge-${result.verdict}`}>{VERDICT_LABEL[result.verdict]}</span>
          <h3>{result.headline}</h3>
        </div>
        <p>{result.message}</p>
        <p className="muted small">
          입력 요약: {BUSINESS_TYPES.find((b) => b.value === form.businessType)?.label} ·{' '}
          {BUSINESS_AGES.find((a) => a.value === (isPrestartup ? 'prestartup' : form.businessAge))?.label} ·{' '}
          {form.region} · 상시근로자 {form.employees}명 ·{' '}
          {REVENUE_BANDS.find((r) => r.value === form.revenue)?.label}
        </p>

        {result.programs.length > 0 && (
          <>
            <h4>추천 지원사업</h4>
            <ul className="program-list">
              {result.programs.map((p) => (
                <li key={p.id} className={`program program-${p.category}`}>
                  <div className="program-head">
                    <span className="tag">{CATEGORY_LABEL[p.category]}</span>
                    <a href={p.url} target="_blank" rel="noopener noreferrer">
                      {p.name}
                    </a>
                  </div>
                  <div className="muted small">{p.host}</div>
                  <p>{p.summary}</p>
                  {p.note && <p className="note">{p.note}</p>}
                </li>
              ))}
            </ul>
          </>
        )}

        {result.voucherCandidate && (
          <div className="callout callout-success">
            <strong>소상공인 경영안정 바우처 후보</strong>
            <p>
              연매출 1억 400만원 미만이므로 25만원 바우처 대상 후보입니다. 소상공인24에서 모집 시기를 확인하세요.
            </p>
          </div>
        )}

        {result.resetTactics && (
          <div className="callout callout-warn">
            <strong>업력 리셋 옵션 (검토용)</strong>
            <ul>
              {result.resetTactics.map((t) => (
                <li key={t.title}>
                  <strong>{t.title}</strong> — {t.detail}
                </li>
              ))}
            </ul>
            <p className="small">
              <strong>주의:</strong> {result.resetWarning}
            </p>
          </div>
        )}

        <div className="callout callout-info">
          <strong>꼭 확인할 포털</strong>
          <ul className="inline-links">
            {PORTALS.map((p) => (
              <li key={p.id}>
                <a href={p.url} target="_blank" rel="noopener noreferrer">
                  {p.name}
                </a>
              </li>
            ))}
          </ul>
          <p>
            <strong>팁:</strong> {TIPS[0]}
          </p>
        </div>

        {result.closedPrograms.map((p) => (
          <div key={p.id} className="callout callout-muted">
            <strong>{p.name} (최대 4천만원, 2026년 6~7월 모집) — 마감</strong>
            <p>{p.note}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
