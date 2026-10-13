#!/usr/bin/env node
/**
 * 정부 지원사업 신규 공고 수집기 (PoC)
 *
 * 소스
 *  1. K-Startup 공고 오픈API  (공공데이터포털 데이터셋 15125364, 키 필요: DATA_GO_KR_KEY)
 *  2. 기업마당 지원사업정보 API (기업마당에서 발급한 키 필요: BIZINFO_KEY)
 *  3. 소상공인24 내부 목록 API  (공식 API 아님, 키 불필요, 구조 변경·차단 가능성 있음)
 *
 * 사용법
 *   DATA_GO_KR_KEY=... BIZINFO_KEY=... node scripts/fetch-notices.mjs [--region 서울] [--keyword AI]
 *
 * 결과
 *   data/notices.json  : 이번 실행 스냅샷
 *   stdout             : 이전 스냅샷 대비 신규 공고 목록
 */
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] ?? true] : []).filter(Boolean));
const REGION = args.region ?? '서울';
const KEYWORD = args.keyword ?? '';
const OUT = path.resolve('data/notices.json');
const today = new Date().toISOString().slice(0, 10);

const UA = 'Mozilla/5.0 (compatible; notice-fetcher/0.1)';
const timeout = (ms) => AbortSignal.timeout(ms);

// ---------- 1. K-Startup (공식) ----------
async function fetchKstartup() {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) return { skipped: 'DATA_GO_KR_KEY 미설정 (공공데이터포털 15125364 활용신청 후 설정)' };
  const url = new URL('https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01');
  url.search = new URLSearchParams({ serviceKey: key, returnType: 'json', numOfRows: '200', pageNo: '1', rcrt_prgs_yn: 'Y' }).toString();
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: timeout(30000) });
  if (!res.ok) throw new Error(`K-Startup HTTP ${res.status}`);
  const json = await res.json();
  const rows = json.data ?? json.response?.body?.items ?? [];
  return rows
    // supt_regin 서버 필터가 불안정해 클라이언트에서 한 번 더 거름
    .filter((r) => !REGION || !r.supt_regin || r.supt_regin.includes(REGION) || r.supt_regin.includes('전국'))
    .filter((r) => !KEYWORD || (r.biz_pbanc_nm ?? '').includes(KEYWORD))
    .map((r) => ({
      source: 'K-Startup', id: `ks-${r.pbanc_sn}`, title: r.biz_pbanc_nm,
      org: r.pbanc_ntrp_nm ?? null, region: r.supt_regin ?? null,
      start: r.pbanc_rcpt_bgng_dt ?? null, end: r.pbanc_rcpt_end_dt ?? null,
      age: r.biz_enyy ?? null, url: r.detl_pg_url ?? null,
    }));
}

// ---------- 2. 기업마당 (공식) ----------
async function fetchBizinfo() {
  const key = process.env.BIZINFO_KEY;
  if (!key) return { skipped: 'BIZINFO_KEY 미설정 (https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi 에서 신청)' };
  const url = new URL('https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do');
  url.search = new URLSearchParams({ crtfcKey: key, dataType: 'json', searchCnt: '200', hashtags: REGION }).toString();
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: timeout(30000) });
  if (!res.ok) throw new Error(`기업마당 HTTP ${res.status}`);
  const json = await res.json();
  if (json.reqErr) throw new Error(`기업마당: ${json.reqErr}`);
  const items = json.jsonArray ?? json.items ?? json.item ?? [];
  return items
    .filter((r) => !KEYWORD || (r.pblancNm ?? r.title ?? '').includes(KEYWORD))
    .map((r) => ({
      source: '기업마당', id: `bi-${r.pblancId ?? r.seq}`, title: r.pblancNm ?? r.title,
      org: r.jrsdInsttNm ?? r.excInsttNm ?? null, region: r.hashTags ?? null,
      start: null, end: r.reqstBeginEndDe ?? null, age: null,
      url: r.pblancUrl ?? r.link ?? null,
    }));
}

// ---------- 3. 소상공인24 (비공식 내부 API) ----------
async function fetchSbiz24() {
  const body = (extra, startRow, endRow) => ({
    sortModel: [],
    search: {
      searchValue: KEYWORD, rcrtTypeCdNmList: [], rcrtTypeCdNmListDisplay: '',
      regionNmList: REGION ? [REGION] : [], regionNmListDisplay: '', tpbizCdList: [], tpbizCdListDisplay: '',
      bhis: { from: null, to: null }, wrkr: { from: null, to: null }, sls: { from: null, to: null },
      aplySeYn: 'N', sbrPbancYn: 'N', itrstPbancYn: 'N', departNmList: null, searchBox: null,
      ptPbancSortBy: null, pbancNm: '', regionCdList: [], ...extra,
    },
    paging: true, startRow, endRow,
  });
  const groups = [
    { name: '소진공', extra: { departNmListDisplay: '소상공인시장진흥공단' } },
    { name: '자치단체', extra: { departNmListDisplay: '자치단체', bizMngSeCd: '02' } },
  ];
  const out = [];
  for (const g of groups) {
    for (let start = 0; start < 1000; start += 100) {
      const res = await fetch('https://www.sbiz24.kr/api/pbanc/sbiz24PbancList', {
        method: 'POST', signal: timeout(30000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Referer: 'https://www.sbiz24.kr/', 'origin-method': 'GET', 'User-Agent': UA }, // origin-method 헤더가 없으면 500
        body: JSON.stringify(body(g.extra, start, start + 100)),
      });
      if (!res.ok) throw new Error(`소상공인24 ${g.name} HTTP ${res.status} (내부 API 차단 또는 형식 변경 가능)`);
      const json = await res.json();
      const page = json?.data?.default;
      if (!page?.list?.length) break;
      for (const r of page.list) out.push({
        source: `소상공인24/${g.name}`, id: `sb-${r.pbancSn}`, title: r.pbancNm, org: null, region: null,
        start: r.rcptPd?.from ?? null, end: r.rcptPd?.to ?? null, age: null,
        url: `https://www.sbiz24.kr/#/pbanc/${r.pbancSn}`, open: r.aplyPsbltySe === 'Y',
      });
      if (start + 100 >= page.total) break;
    }
  }
  return out;
}

// ---------- main ----------
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { items: [] };
const prevIds = new Set(prev.items.map((i) => i.id));
const results = {};
const all = [];
for (const [name, fn] of Object.entries({ kstartup: fetchKstartup, bizinfo: fetchBizinfo, sbiz24: fetchSbiz24 })) {
  try {
    const r = await fn();
    if (Array.isArray(r)) { results[name] = `${r.length}건`; all.push(...r); }
    else results[name] = `건너뜀: ${r.skipped}`;
  } catch (e) { results[name] = `실패: ${e.message}`; }
}
const fresh = all.filter((i) => !prevIds.has(i.id));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), region: REGION, keyword: KEYWORD, results, items: all }, null, 2));

console.log(`# 지원사업 공고 수집 결과 (${today}, 지역=${REGION}${KEYWORD ? `, 키워드=${KEYWORD}` : ''})`);
for (const [k, v] of Object.entries(results)) console.log(`- ${k}: ${v}`);
console.log(`\n## 신규 공고 ${fresh.length}건 (이전 스냅샷 ${prev.items.length}건 대비)`);
for (const i of fresh.slice(0, 50)) console.log(`- [${i.source}] ${i.title} | ${i.start ?? '?'} ~ ${i.end ?? '?'} | ${i.url ?? ''}`);
