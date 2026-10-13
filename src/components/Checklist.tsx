import { useEffect, useState } from 'react'
import { CHECKLIST_ITEMS, CHECKLIST_STORAGE_KEY } from '../data/programs'

type Checked = Record<string, boolean>

function load(): Checked {
  try {
    const raw = localStorage.getItem(CHECKLIST_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as Checked
  } catch {
    /* localStorage 사용 불가 환경 */
  }
  return {}
}

function save(value: Checked) {
  try {
    localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}

export default function Checklist() {
  const [checked, setChecked] = useState<Checked>(load)

  useEffect(() => {
    save(checked)
  }, [checked])

  const done = CHECKLIST_ITEMS.filter((i) => checked[i.id]).length
  const total = CHECKLIST_ITEMS.length
  const progress = Math.round((done / total) * 100)

  return (
    <section className="card" id="checklist" aria-labelledby="checklist-title">
      <h2 id="checklist-title">3. 신청 체크리스트</h2>
      <p className="muted">체크 상태는 이 브라우저에 자동 저장됩니다.</p>

      <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="progress-label">
        {done} / {total} 완료 ({progress}%)
      </div>

      <ul className="checklist">
        {CHECKLIST_ITEMS.map((item) => (
          <li key={item.id} className={checked[item.id] ? 'done' : ''}>
            <label>
              <input
                type="checkbox"
                checked={!!checked[item.id]}
                onChange={(e) => setChecked((c) => ({ ...c, [item.id]: e.target.checked }))}
              />
              <span>
                <span className="check-label">{item.label}</span>
                {item.detail && <span className="muted small check-detail">{item.detail}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="form-actions">
        <button type="button" className="btn-ghost" onClick={() => setChecked({})}>
          모두 초기화
        </button>
      </div>
    </section>
  )
}
