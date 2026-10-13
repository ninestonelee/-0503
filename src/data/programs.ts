/**
 * 지원사업 규칙 데이터 모듈
 * ------------------------------------------------------------
 * 자가진단 판정에 쓰이는 모든 기준·프로그램·링크·팁을 이 파일에 모아 둡니다.
 * 정책이 바뀌면 이 파일만 수정하면 됩니다. (컴포넌트는 규칙을 하드코딩하지 않습니다)
 *
 * 출처: 지원사업 컨설턴트 인터뷰(유튜브) 내용을 기준으로 정리.
 * 실제 신청 시에는 반드시 개별 공고문의 자격 요건을 확인하세요.
 */

// ---------- 입력 선택지 ----------

export type BusinessType = 'individual' | 'corporation' | 'prestartup'
export type BusinessAge = 'prestartup' | 'under3' | '3to7' | 'over7'
export type RevenueBand = 'under104m' | '104m_to_300m' | '300m_to_1b' | 'over1b'

export interface Option<T extends string> {
  value: T
  label: string
}

export const BUSINESS_TYPES: Option<BusinessType>[] = [
  { value: 'individual', label: '개인사업자' },
  { value: 'corporation', label: '법인사업자' },
  { value: 'prestartup', label: '예비창업자 (사업자등록 전)' },
]

/** 업력은 사업자등록증의 "개업연월일"을 기준으로 계산합니다. */
export const BUSINESS_AGES: Option<BusinessAge>[] = [
  { value: 'prestartup', label: '예비창업 (아직 사업자등록 안 함)' },
  { value: 'under3', label: '3년 미만' },
  { value: '3to7', label: '3년 이상 ~ 7년 이하' },
  { value: 'over7', label: '7년 초과' },
]

export const REGIONS: string[] = [
  '서울특별시',
  '부산광역시',
  '대구광역시',
  '인천광역시',
  '광주광역시',
  '대전광역시',
  '울산광역시',
  '세종특별자치시',
  '경기도',
  '강원특별자치도',
  '충청북도',
  '충청남도',
  '전북특별자치도',
  '전라남도',
  '경상북도',
  '경상남도',
  '제주특별자치도',
]

export interface IndustryOption {
  value: string
  label: string
  /** true이면 대부분의 정부 지원사업에서 제외되는 업종 */
  excluded: boolean
}

/** 유흥업·사행업만 제외 대상입니다. 그 외 업종은 모두 지원 가능 후보입니다. */
export const INDUSTRIES: IndustryOption[] = [
  { value: 'food', label: '음식점·카페', excluded: false },
  { value: 'retail', label: '도소매·온라인 쇼핑몰', excluded: false },
  { value: 'service', label: '개인 서비스 (미용·세탁·수리 등)', excluded: false },
  { value: 'education', label: '교육·학원·코칭', excluded: false },
  { value: 'health', label: '건강·피트니스·헬스케어', excluded: false },
  { value: 'manufacturing', label: '제조업', excluded: false },
  { value: 'it', label: 'IT·소프트웨어·앱 서비스', excluded: false },
  { value: 'content', label: '콘텐츠·디자인·미디어', excluded: false },
  { value: 'construction', label: '건설·인테리어', excluded: false },
  { value: 'logistics', label: '운수·물류', excluded: false },
  { value: 'agri', label: '농림·수산·식품가공', excluded: false },
  { value: 'other', label: '기타 (해당 없음)', excluded: false },
  { value: 'entertainment', label: '유흥업 (유흥주점·단란주점 등)', excluded: true },
  { value: 'gambling', label: '사행업 (도박·복권·경마 등)', excluded: true },
]

export const REVENUE_BANDS: Option<RevenueBand>[] = [
  { value: 'under104m', label: '1억 400만원 미만' },
  { value: '104m_to_300m', label: '1억 400만원 이상 ~ 3억원 미만' },
  { value: '300m_to_1b', label: '3억원 이상 ~ 10억원 미만' },
  { value: 'over1b', label: '10억원 이상' },
]

/** 경영안정 바우처 매출 기준(원). 이 금액 미만이면 후보로 표시 */
export const VOUCHER_REVENUE_LIMIT = 104_000_000

// ---------- 프로그램 ----------

export type ProgramCategory = 'startup' | 'growth' | 'local' | 'voucher' | 'closed'

export interface Program {
  id: string
  name: string
  category: ProgramCategory
  /** 주관/포털 */
  host: string
  /** 한 줄 설명 */
  summary: string
  /** 추천 대상 업력 (비어 있으면 업력 제한 없음) */
  ages: BusinessAge[]
  /** 지원 규모 등 메모 */
  note?: string
  url: string
}

export const PROGRAMS: Program[] = [
  {
    id: 'pre-startup-package',
    name: '예비창업패키지',
    category: 'startup',
    host: 'K-스타트업 (창업진흥원)',
    summary: '사업자등록 전 예비창업자를 위한 대표 창업 지원사업. 사업화 자금과 멘토링을 지원합니다.',
    ages: ['prestartup'],
    url: 'https://www.k-startup.go.kr',
  },
  {
    id: 'early-startup-package',
    name: '초기창업패키지',
    category: 'startup',
    host: 'K-스타트업 (창업진흥원)',
    summary: '창업 3년 이내 초기 기업의 사업화를 지원합니다.',
    ages: ['under3'],
    url: 'https://www.k-startup.go.kr',
  },
  {
    id: 'youth-startup-academy',
    name: '청년창업사관학교',
    category: 'startup',
    host: 'K-스타트업 (중소벤처기업진흥공단)',
    summary: '만 39세 이하 청년 창업자를 위한 사업화 자금·공간·교육 패키지 지원.',
    ages: ['prestartup', 'under3'],
    note: '연령 요건(만 39세 이하)을 함께 확인하세요.',
    url: 'https://www.k-startup.go.kr',
  },
  {
    id: 'startup-leap-package',
    name: '창업도약패키지',
    category: 'growth',
    host: 'K-스타트업 (창업진흥원)',
    summary: '창업 3년 초과 ~ 7년 이내 도약기 기업의 스케일업을 지원합니다.',
    ages: ['3to7'],
    url: 'https://www.k-startup.go.kr',
  },
  {
    id: 'local-government',
    name: '지자체 소상공인 지원사업',
    category: 'local',
    host: '각 시·도 / 시·군·구',
    summary: '지역별 소상공인 지원사업은 업력 제한이 없거나 완화된 경우가 많습니다. 소상공인24·기업마당에서 지역 필터로 확인하세요.',
    ages: [],
    url: 'https://www.bizinfo.go.kr',
  },
  {
    id: 'bizinfo-no-age-limit',
    name: '기업마당 업력 제한 없는 사업',
    category: 'local',
    host: '기업마당 (중소벤처기업부)',
    summary: '마케팅·판로·디지털 전환·컨설팅 등 업력과 무관하게 신청 가능한 사업을 모아 보세요.',
    ages: [],
    url: 'https://www.bizinfo.go.kr',
  },
  {
    id: 'management-stability-voucher',
    name: '소상공인 경영안정 바우처',
    category: 'voucher',
    host: '소상공인24 (소상공인시장진흥공단)',
    summary: '연매출 1억 400만원 미만 영세 소상공인에게 25만원 상당의 바우처를 지원합니다.',
    ages: [],
    note: '지원 금액 25만원 / 연매출 1억 400만원 미만',
    url: 'https://www.sbiz24.kr',
  },
  {
    id: 'ai-innovation-sbiz',
    name: 'AI 활용 혁신 소상공인',
    category: 'closed',
    host: '소상공인24 (소상공인시장진흥공단)',
    summary: 'AI를 활용해 사업을 혁신하는 소상공인에게 최대 4천만원을 지원한 사업. 2026년 6~7월 모집은 마감되었습니다.',
    ages: [],
    note: '마감됨 — 유사한 AI·디지털 전환 사업이 매년 반복 공고되므로 알림을 설정해 두세요.',
    url: 'https://www.sbiz24.kr',
  },
]

// ---------- 업력 리셋 전략 ----------

export interface Tactic {
  title: string
  detail: string
}

/**
 * 7년 초과 사업자가 창업 지원사업 대상이 되기 위한 "업력 리셋" 옵션.
 * 반드시 세무사와 해당 공고의 자격 기준(동종 업종 제한, 폐업 이력 등)을 확인해야 합니다.
 */
export const AGE_RESET_TACTICS: Tactic[] = [
  {
    title: '다른 업종코드로 신규 사업자 등록',
    detail:
      '기존 사업과 다른 업종코드로 새 사업자를 등록하면 그 사업자는 업력 0년부터 시작합니다. 공고에 따라 "동종 업종 재창업"은 제외될 수 있으니 업종코드 차이를 확인하세요.',
  },
  {
    title: '개인 ↔ 법인 추가 설립',
    detail:
      '개인사업자는 법인을, 법인은 별도 개인사업자를 새로 설립해 신규 업력으로 지원하는 방법입니다. 대표자 중복·지분 관계가 공고 요건에 걸리는지 확인이 필요합니다.',
  },
]

export const AGE_RESET_WARNING =
  '위 방법은 세무·법률 리스크(세금, 4대보험, 기존 사업과의 관계 등)가 있을 수 있습니다. 실행 전 반드시 세무사와 상담하고, 지원하려는 공고문의 자격 기준(재창업·동종업종·대표자 중복 제한 등)을 직접 확인하세요.'

// ---------- 포털 링크 ----------

export interface Portal {
  id: string
  name: string
  url: string
  description: string
  /** 검색어를 넣으면 검색 URL을 만들어 주는 함수 (없으면 일반 링크) */
  searchUrl?: (query: string) => string
}

export const PORTALS: Portal[] = [
  {
    id: 'sbiz24',
    name: '소상공인24',
    url: 'https://www.sbiz24.kr',
    description: '소상공인시장진흥공단 통합 포털. 바우처·정책자금·교육 등 소상공인 전용 사업 신청.',
  },
  {
    id: 'bizinfo',
    name: '기업마당',
    url: 'https://www.bizinfo.go.kr',
    description: '중소벤처기업부 지원사업 통합 공고. 지역·분야별 필터와 알림(관심사업) 설정 가능.',
    searchUrl: (q) =>
      `https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/list.do?searchKeyword=${encodeURIComponent(q)}`,
  },
  {
    id: 'kstartup',
    name: 'K-스타트업',
    url: 'https://www.k-startup.go.kr',
    description: '창업진흥원 창업지원포털. 예비·초기·도약 창업패키지, 청년창업사관학교 등 창업 사업 공고.',
    searchUrl: (q) =>
      `https://www.k-startup.go.kr/web/contents/bizpbanc-ongoing.do?schStr=${encodeURIComponent(q)}`,
  },
]

/** 공고 검색 섹션에 미리 넣어 둘 빠른 검색어 */
export const QUICK_SEARCHES: { label: string; query: string; portalId: string }[] = [
  { label: '소상공인 AI', query: '소상공인 AI', portalId: 'bizinfo' },
  { label: '디지털 전환', query: '디지털 전환', portalId: 'bizinfo' },
  { label: '마케팅 지원', query: '마케팅', portalId: 'bizinfo' },
  { label: '경영안정 바우처', query: '바우처', portalId: 'bizinfo' },
  { label: '예비창업패키지', query: '예비창업패키지', portalId: 'kstartup' },
  { label: '초기창업패키지', query: '초기창업패키지', portalId: 'kstartup' },
  { label: '창업도약패키지', query: '창업도약패키지', portalId: 'kstartup' },
  { label: '청년창업사관학교', query: '청년창업사관학교', portalId: 'kstartup' },
]

// ---------- 팁 ----------

export const TIPS: string[] = [
  '사업계획서에 AI 활용(예: AI 기반 스마트 코칭 솔루션)을 포함하면 유리합니다. 심사위원이 혁신성·미래성을 높게 평가하는 요소입니다.',
  '사업계획서는 10~20쪽 분량, 수익성 중심으로 작성하고 미래 비전을 명확히 제시하세요.',
  '업력은 사업자등록증의 개업연월일 기준입니다. 신청 전 등록증의 업종코드와 개업연월일을 먼저 확인하세요.',
  '선정되면 끝이 아닙니다. 선정 직후 다음 지원사업을 준비하면 연속 수혜 가능성이 높아집니다.',
]

// ---------- 지원금 사용계획 계산기 ----------

export interface BudgetCategory {
  id: string
  name: string
  description: string
  /** 초기 비율 (%) */
  defaultPercent: number
}

export const DEFAULT_GRANT_AMOUNT = 40_000_000

export const BUDGET_CATEGORIES: BudgetCategory[] = [
  {
    id: 'ip',
    name: '지식재산권',
    description: '특허·상표·디자인 출원. 평가에서 성과 지표로 인정되므로 반드시 일부 배정 권장',
    defaultPercent: 10,
  },
  {
    id: 'dev',
    name: '제품/서비스 개발',
    description: '시제품 제작, 앱·웹 개발, 외주 개발비',
    defaultPercent: 35,
  },
  {
    id: 'marketing',
    name: '홍보·마케팅',
    description: '유튜브·인플루언서·체험단, 광고비, 콘텐츠 제작',
    defaultPercent: 20,
  },
  {
    id: 'labor',
    name: '인건비',
    description: '신규 채용 인건비 (공고별 인정 범위 확인)',
    defaultPercent: 15,
  },
  {
    id: 'rent',
    name: '임차료·장비임차',
    description: '사무실·작업공간 임차, 장비 리스',
    defaultPercent: 10,
  },
  {
    id: 'education',
    name: '교육·전문가활용',
    description: '전문가 자문, 컨설팅, 교육 수강',
    defaultPercent: 10,
  },
]

/** 홍보·마케팅 최소 권장 비율 (%) */
export const MARKETING_MIN_PERCENT = 15

// ---------- 신청 체크리스트 ----------

export interface ChecklistItem {
  id: string
  label: string
  detail?: string
}

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  {
    id: 'registration',
    label: '사업자등록증 확인 (개업연월일·업종코드)',
    detail: '업력 기준일과 업종코드가 공고 요건에 맞는지 확인',
  },
  {
    id: 'sbiz24-signup',
    label: '소상공인24 회원가입',
    detail: '바우처·소상공인 전용 사업 신청용 계정',
  },
  {
    id: 'bizinfo-alert',
    label: '기업마당 알림 설정',
    detail: '관심 지역·분야 공고가 뜨면 바로 알 수 있도록 알림 신청',
  },
  {
    id: 'business-plan',
    label: '사업계획서 작성 (10~20쪽, 수익성 중심, 미래 비전, AI 활용)',
    detail: 'AI 활용 계획(예: AI 기반 스마트 코칭 솔루션)을 포함',
  },
  {
    id: 'ip-plan',
    label: 'IP 출원 계획 (특허·상표·디자인)',
    detail: '지원금 일부를 지식재산권에 배정하고 출원 일정 수립',
  },
  {
    id: 'marketing-plan',
    label: '마케팅 계획 (유튜브·인플루언서·체험단)',
    detail: '홍보·마케팅 예산 15% 이상 권장',
  },
  {
    id: 'next-program',
    label: '선정 후 다음 지원사업 준비',
    detail: '선정 직후 다음 공고를 찾아 연속 지원',
  },
]

export const CHECKLIST_STORAGE_KEY = 'sbiz-self-check:checklist:v1'
