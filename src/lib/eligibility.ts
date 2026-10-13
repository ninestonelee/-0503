import {
  AGE_RESET_TACTICS,
  AGE_RESET_WARNING,
  INDUSTRIES,
  PROGRAMS,
  type BusinessAge,
  type BusinessType,
  type Program,
  type RevenueBand,
  type Tactic,
} from '../data/programs'

export interface DiagnosisInput {
  businessType: BusinessType
  businessAge: BusinessAge
  region: string
  industry: string
  employees: number
  revenue: RevenueBand
}

export type Verdict = 'excluded' | 'startup' | 'growth' | 'mature'

export interface DiagnosisResult {
  verdict: Verdict
  headline: string
  message: string
  programs: Program[]
  voucherCandidate: boolean
  resetTactics: Tactic[] | null
  resetWarning: string | null
  closedPrograms: Program[]
}

export function diagnose(input: DiagnosisInput): DiagnosisResult {
  const industry = INDUSTRIES.find((i) => i.value === input.industry)
  const closedPrograms = PROGRAMS.filter((p) => p.category === 'closed')
  const voucherCandidate = input.revenue === 'under104m' && !industry?.excluded

  if (industry?.excluded) {
    return {
      verdict: 'excluded',
      headline: '대부분의 정부 지원사업에서 제외되는 업종입니다',
      message:
        '유흥업·사행업은 소상공인 및 창업 지원사업 대부분에서 지원 제외 업종으로 분류됩니다. 해당 업종 외 별도 사업을 운영 중이라면 그 사업자 기준으로 다시 진단해 보세요.',
      programs: [],
      voucherCandidate: false,
      resetTactics: null,
      resetWarning: null,
      closedPrograms,
    }
  }

  // 예비창업자 유형을 선택했으면 업력도 예비창업으로 취급
  const age: BusinessAge = input.businessType === 'prestartup' ? 'prestartup' : input.businessAge

  const byAge = (a: BusinessAge) =>
    PROGRAMS.filter((p) => p.category !== 'closed' && p.category !== 'voucher' && p.ages.includes(a))
  const noAgeLimit = PROGRAMS.filter(
    (p) => p.category !== 'closed' && p.category !== 'voucher' && p.ages.length === 0,
  )
  const voucher = PROGRAMS.filter((p) => p.category === 'voucher')

  let verdict: Verdict
  let headline: string
  let message: string
  let programs: Program[]
  let resetTactics: Tactic[] | null = null
  let resetWarning: string | null = null

  if (age === 'prestartup' || age === 'under3') {
    verdict = 'startup'
    headline = '창업 지원사업(K-스타트업) 적극 추천 구간입니다'
    message =
      age === 'prestartup'
        ? '사업자등록 전이라면 예비창업패키지가 1순위입니다. 등록 전에 신청하는 것이 유리하니 서두르지 마세요.'
        : '창업 3년 미만은 초기창업패키지·청년창업사관학교 등 지원 규모가 큰 사업에 지원할 수 있는 황금 구간입니다.'
    programs = [...byAge(age), ...noAgeLimit]
  } else if (age === '3to7') {
    verdict = 'growth'
    headline = '도약기 창업 지원사업 추천 구간입니다'
    message =
      '창업 3~7년 기업은 창업도약패키지 등 스케일업 중심 사업에 지원할 수 있습니다. 지자체·기업마당의 업력 제한 없는 사업도 함께 확인하세요.'
    programs = [...byAge(age), ...noAgeLimit]
  } else {
    verdict = 'mature'
    headline = '창업 지원사업 업력 기준을 초과했습니다'
    message =
      '업력 7년 초과 사업자는 창업패키지 계열 대상이 아닙니다. 지자체 소상공인 사업과 기업마당의 업력 제한 없는 사업을 중심으로 찾되, 아래 "업력 리셋" 옵션도 검토해 볼 수 있습니다.'
    programs = noAgeLimit
    resetTactics = AGE_RESET_TACTICS
    resetWarning = AGE_RESET_WARNING
  }

  if (voucherCandidate) programs = [...programs, ...voucher]

  return {
    verdict,
    headline,
    message,
    programs,
    voucherCandidate,
    resetTactics,
    resetWarning,
    closedPrograms,
  }
}
