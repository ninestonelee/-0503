import Diagnosis from './components/Diagnosis'
import BudgetPlanner from './components/BudgetPlanner'
import Checklist from './components/Checklist'
import Portals from './components/Portals'

const NAV = [
  { href: '#diagnosis', label: '자가진단' },
  { href: '#budget', label: '사용계획' },
  { href: '#checklist', label: '체크리스트' },
  { href: '#portals', label: '공고 링크' },
]

export default function App() {
  return (
    <>
      <header className="site-header">
        <div className="container">
          <h1>소상공인 지원사업 자가진단</h1>
          <p className="tagline">
            내가 받을 수 있는 정부 지원사업을 빠르게 확인하고, 지원금 사용계획과 신청 준비까지 한 번에.
          </p>
          <nav aria-label="섹션 이동">
            {NAV.map((n) => (
              <a key={n.href} href={n.href}>
                {n.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="container">
        <Diagnosis />
        <BudgetPlanner />
        <Checklist />
        <Portals />
      </main>

      <footer className="site-footer">
        <div className="container muted small">
          이 도구는 지원사업 컨설턴트 인터뷰 내용을 바탕으로 한 참고용 자가진단입니다. 실제 자격 요건·지원 금액·모집 시기는
          반드시 각 공고문을 확인하세요.
        </div>
      </footer>
    </>
  )
}
