import { useEffect, useState } from 'react';
import type { Account, BufferChannel, BufferConnectionStatus, PublishRoute } from '../shared/domain';

const errorText=(value:unknown)=>String(value).replace(/^(?:Error:\s*)+/,'').replace(/^Error invoking remote method '[^']+': /,'').replace(/^(?:Error:\s*)+/,'').replace(/\n[\s\S]*/,'');
const channelLabel=(channel:BufferChannel)=>`@${channel.name}${channel.displayName&&channel.displayName!==channel.name?` · ${channel.displayName}`:''}${channel.organizationName?` (${channel.organizationName})`:''}`;
const channelProblem=(channel:BufferChannel)=>channel.isDisconnected?'연결 끊김':channel.isLocked?'요금제 잠김':channel.isQueuePaused?'대기열 일시정지':'';

/** Buffer 채널 목록을 불러오는 공용 훅. check=true면 Buffer API를 실제로 호출한다. */
export function useBufferStatus(check:boolean){
  const [status,setStatus]=useState<BufferConnectionStatus>();
  const [loading,setLoading]=useState(true);
  const reload=async(withCheck=check)=>{setLoading(true);try{const value=await window.threadsAuto.buffer.status(withCheck);setStatus(value);return value;}finally{setLoading(false);}};
  useEffect(()=>{let active=true;void window.threadsAuto.buffer.status(check).then(value=>{if(active)setStatus(value);}).catch(error=>{if(active)setStatus({stored:false,channels:[],message:errorText(error)});}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[check]);
  return {status,setStatus,loading,reload};
}

export function BufferConnectionPanel({onChanged}:{onChanged:()=>Promise<void>}){
  const {status,setStatus,loading,reload}=useBufferStatus(false);
  const [apiKey,setApiKey]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const run=async(task:()=>Promise<BufferConnectionStatus>,done:(value:BufferConnectionStatus)=>string)=>{setBusy(true);setMessage('');try{const value=await task();setStatus(value);setMessage(done(value));await onChanged();}catch(error){setMessage(errorText(error));}finally{setBusy(false);}};
  const save=()=>run(()=>window.threadsAuto.buffer.saveKey(apiKey.trim()),value=>{setApiKey('');return value.message;});
  const check=()=>run(()=>reload(true),value=>value.message);
  const remove=()=>{if(!window.confirm('Buffer API 키를 삭제하시겠습니까?\nBuffer로 발행하는 계정의 자동화가 해제되고 대기 작업이 취소됩니다.'))return;void run(()=>window.threadsAuto.buffer.deleteKey(),()=>'Buffer API 키를 삭제했습니다.');};
  return <section className="panel buffer-connection integration-block provider-buffer" aria-labelledby="buffer-connection-title">
    <header><div><h3 id="buffer-connection-title">Buffer 연결</h3><p>Buffer API 키 하나로 Buffer에 연결된 모든 Threads 채널에 발행합니다. 키는 Buffer 설정 &gt; API(publish.buffer.com/settings/api)에서 만듭니다.</p></div><div className="actions"><button disabled={busy||loading||!status?.stored} onClick={()=>void check()}>연결 확인</button>{status?.stored&&<button className="danger-link" disabled={busy} onClick={remove}>키 삭제</button>}</div></header>
    {message&&<div className="notice" aria-live="polite">{message}</div>}
    <div className="credential-grid single"><div className="secret-control"><div className="secret-label"><span>Buffer API 키</span><small>{loading?'확인 중…':status?.stored?`저장됨${status.updatedAt?` · ${new Date(status.updatedAt).toLocaleString('ko-KR')}`:''}`:'저장되지 않음'}</small></div><div className="secret-input"><input aria-label="Buffer API 키" type="password" autoComplete="new-password" value={apiKey} placeholder={status?.stored?'•••••••• 새 키로 교체':'Buffer API 키 입력'} onChange={event=>setApiKey(event.target.value)}/><button className="primary" disabled={busy||!apiKey.trim()} onClick={()=>void save()}>{busy?'확인 중…':'확인 후 저장'}</button></div></div></div>
    {status?.channels.length?<ul className="buffer-channel-list">{status.channels.map(channel=><li key={channel.id}><strong>{channelLabel(channel)}</strong>{channelProblem(channel)?<span className="badge warning">{channelProblem(channel)}</span>:<span className="badge success">발행 가능</span>}</li>)}</ul>:null}
  </section>;
}

/** 계정 등록 대화상자에서 Buffer Threads 채널을 골라 계정을 만든다. */
export function BufferRegistrationForm({accounts,onRegistered}:{accounts:Account[];onRegistered:(account:Account)=>Promise<void>}){
  const {status,loading}=useBufferStatus(true);
  const [channelId,setChannelId]=useState('');const [error,setError]=useState('');const [saving,setSaving]=useState(false);
  const used=new Set(accounts.map(account=>account.bufferChannelId).filter(Boolean));
  const available=(status?.channels??[]).filter(channel=>!used.has(channel.id));
  const submit=async()=>{setError('');setSaving(true);try{await onRegistered(await window.threadsAuto.accounts.registerBuffer(channelId));}catch(err){setError(errorText(err));}finally{setSaving(false);}};
  if(loading)return <p className="registration-note">Buffer 채널을 불러오고 있습니다…</p>;
  if(!status?.stored)return <div className="inline-warning">먼저 계정 관리 화면의 ‘Buffer 연결’에 Buffer API 키를 저장하세요.</div>;
  if(status.ok===false)return <div className="alert" role="alert">{status.message}</div>;
  return <>
    {error&&<div className="alert" role="alert">{error}</div>}
    {available.length?<label className="field"><span>Buffer Threads 채널</span><select value={channelId} onChange={event=>setChannelId(event.target.value)}><option value="">채널 선택</option>{available.map(channel=><option key={channel.id} value={channel.id} disabled={channel.isDisconnected||channel.isLocked}>{channelLabel(channel)}{channelProblem(channel)?` — ${channelProblem(channel)}`:''}</option>)}</select></label>
      :<div className="inline-warning">{status.channels.length?'모든 Buffer Threads 채널이 이미 등록되어 있습니다.':status.message}</div>}
    <p className="registration-note">Meta 개발자 앱·Access Token 없이 Buffer를 통해 발행합니다. 댓글 자동 답글과 게시물 삭제가 필요하면 등록 후 계정 설정에서 Threads Access Token을 추가로 저장하세요.</p>
    <footer><button type="button" className="primary" disabled={saving||!channelId} onClick={()=>void submit()}>{saving?'Buffer 채널을 확인하는 중…':'Buffer 채널로 계정 등록'}</button></footer>
  </>;
}

/** 계정 설정 카드의 발행 경로(Threads API 직접 / Buffer) 선택 영역. 저장된 경로가 바뀌면 key로 다시 마운트한다. */
export function PublishRouteSection({account,onSaved}:{account:Account;onSaved:()=>Promise<void>}){
  const [route,setRoute]=useState<PublishRoute>(account.publishRoute);
  const [channelId,setChannelId]=useState(account.bufferChannelId??'');
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
  const {status,loading,reload}=useBufferStatus(false);
  const loadChannels=async()=>{setMessage('');try{const value=await reload(true);if(value.ok===false)setMessage(value.message);}catch(error){setMessage(errorText(error));}};
  const changed=route!==account.publishRoute||(route==='BUFFER'&&channelId!==(account.bufferChannelId??''));
  const save=async()=>{setBusy(true);setMessage('');try{const updated=await window.threadsAuto.accounts.setPublishRoute(account.id,route,route==='BUFFER'?channelId:undefined);setMessage(updated.publishRoute==='BUFFER'?`발행 경로를 Buffer(@${updated.bufferChannelName})로 저장했습니다.`:'발행 경로를 Threads API 직접 발행으로 저장했습니다.');await onSaved();}catch(error){setMessage(errorText(error));}finally{setBusy(false);}};
  const channels=status?.channels??[];
  const currentMissing=Boolean(account.bufferChannelId&&!channels.some(channel=>channel.id===account.bufferChannelId));
  return <section className="integration-block provider-buffer"><header><div><h3>발행 경로</h3><p>Buffer를 선택하면 게시물을 Buffer API로 보내고, Buffer가 Threads에 발행합니다.</p></div><div className="actions"><button disabled={busy||!changed||(route==='BUFFER'&&!channelId)} onClick={()=>void save()}>{busy?'저장 중…':'발행 경로 저장'}</button></div></header>
    {message&&<div className="notice" aria-live="polite">{message}</div>}
    <div className="coupang-mode-selector" role="group" aria-label="발행 경로"><button type="button" className={route==='BUFFER'?'active':''} aria-pressed={route==='BUFFER'} onClick={()=>{setRoute('BUFFER');if(!channels.length)void loadChannels();}}><strong>Buffer</strong><small>Buffer API로 발행 · Meta 토큰 불필요</small></button><button type="button" className={route==='THREADS_API'?'active':''} aria-pressed={route==='THREADS_API'} onClick={()=>setRoute('THREADS_API')}><strong>Threads API 직접</strong><small>Meta 장기 Access Token 필요</small></button></div>
    {route==='BUFFER'&&<div className="buffer-route-channel">
      {!loading&&!status?.stored?<div className="inline-warning">계정 관리 화면 아래 ‘Buffer 연결’에 Buffer API 키를 먼저 저장하세요.</div>
        :<label className="field"><span>Buffer Threads 채널</span><div className="secret-input"><select value={channelId} onChange={event=>setChannelId(event.target.value)}><option value="">채널 선택</option>{currentMissing&&<option value={account.bufferChannelId}>@{account.bufferChannelName} (현재 연결)</option>}{channels.map(channel=><option key={channel.id} value={channel.id} disabled={channel.isDisconnected||channel.isLocked}>{channelLabel(channel)}{channelProblem(channel)?` — ${channelProblem(channel)}`:''}</option>)}</select><button type="button" disabled={busy} onClick={()=>void loadChannels()}>채널 불러오기</button></div></label>}
      <p className="registration-note">Buffer 경로에서는 Threads Access Token이 선택 사항입니다. 토큰을 함께 저장하면 Buffer로 발행한 글도 Threads 게시물 ID를 찾아 댓글 자동 답글·삭제·성과 수집을 그대로 사용합니다. 토큰이 없으면 성과는 Buffer 지표(하루 1회 갱신)로 수집합니다.</p>
    </div>}
  </section>;
}
