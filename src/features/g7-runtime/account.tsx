'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { runtimeJson, RuntimeClientError, type RuntimeSession } from './client';

type User = { id: string; login: string; status: string; mustChangePassword: boolean;
  roles: string[]; siteIds: string[]; specialGrants: string[] };
type Site = { id: string; name: string };
type Audit = { actor_user_id: string | null; action: string; target_kind: string;
  target_id: string; outcome: string; timestamp_utc: string; request_id: string;
  before_revision: number | null; after_revision: number | null };
const card = 'space-y-4 rounded-xl border border-slate-200 bg-white p-5';
const formGrid = 'grid gap-4 sm:grid-cols-2';

export function RuntimeAccount() {
  const [session, setSession] = useState<RuntimeSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [initialChange, setInitialChange] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [events, setEvents] = useState<Audit[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    try {
      const current = await runtimeJson<RuntimeSession>('auth/session');
      setSession(current);
      if (current.actor.roles.includes('Admin')) {
        const [accounts, allowedSites] = await Promise.all([
          runtimeJson<{users: User[]}>('users/list'), runtimeJson<{sites: Site[]}>('access/sites'),
        ]);
        setUsers(accounts.users); setSites(allowedSites.sites);
        setSelectedUser(old => accounts.users.some(user => user.id === old) ? old : accounts.users[0]?.id ?? '');
      } else { setUsers([]); setSites([]); setEvents([]); }
    } catch (failure) {
      if (failure instanceof RuntimeClientError && failure.status === 401) {
        setSession(null); setUsers([]); setSites([]); setEvents([]);
      } else { throw failure; }
    }
  }, []);
  useEffect(() => {
    let mounted = true;
    Promise.resolve().then(refresh).catch(failure => { if (mounted) setError(failure instanceof Error ? failure.message : '세션을 확인하지 못했습니다.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [refresh]);

  async function run(task: () => Promise<void>, success: string) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setMessage('');
    try { await task(); setMessage(success); }
    catch (failure) {
      if (failure instanceof RuntimeClientError && failure.status === 401) {
        setSession(null); setUsers([]); setSites([]); setEvents([]);
      }
      setError(failure instanceof Error ? failure.message : '요청을 처리하지 못했습니다.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function write(action: string, data: object) {
    // A fresh proof avoids stale authorization following a different tab's logout.
    const active = await runtimeJson<RuntimeSession>('auth/session');
    return runtimeJson(action, data, active.csrfToken);
  }
  function submit(event: React.FormEvent<HTMLFormElement>, action: string, success: string, authenticated: boolean, after?: () => void) {
      event.preventDefault();
      const form = event.currentTarget;
      const data = Object.fromEntries(new FormData(form));
      void run(async () => {
        if (authenticated) await write(action, data); else await runtimeJson(action, data);
        form.reset(); after?.(); await refresh();
      }, success);
  }
  const admin = session?.actor.roles.includes('Admin') ?? false;
  const target = users.find(user => user.id === selectedUser);
  return <section className="mx-auto max-w-5xl space-y-5 [&_input]:min-h-11 [&_select]:min-h-11 [&_button]:min-h-11 [&_label]:min-w-0 [&_select]:min-w-0" data-testid="g7-runtime-account">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold">계정 및 운영 관리</h1><p className="mt-2 text-sm text-slate-600">도면 읽기는 로그인 없이 이용할 수 있습니다.</p></div>
      <Button variant="outline" asChild><Link href="/">도면 목록</Link></Button>
    </div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-teal-50 p-4 text-sm text-teal-800">{message}</p>}
    {loading ? <p role="status">세션을 확인하는 중입니다…</p> : !session ? <section className={card}>
      <h2 className="font-semibold">{initialChange ? '초기 비밀번호 변경' : '로그인'}</h2>
      <form onSubmit={event => submit(event, initialChange ? 'auth/initial-change' : 'auth/login', initialChange ? '비밀번호를 변경했습니다. 새 비밀번호로 로그인하세요.' : '로그인했습니다.', false, () => setInitialChange(false))} className="max-w-md space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <label>계정<input name="login" autoComplete="username" required maxLength={64}/></label>
          <label>{initialChange ? '초기 비밀번호' : '비밀번호'}<input name="password" type="password" autoComplete="current-password" required maxLength={1024}/></label>
          {initialChange && <label>새 비밀번호<input name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={1024}/></label>}
          <Button type="submit" disabled={busy}>{busy ? '처리 중…' : initialChange ? '비밀번호 변경' : '로그인'}</Button>
        </fieldset>
      </form>
      <Button type="button" variant="outline" disabled={busy} onClick={() => { setInitialChange(value => !value); setError(''); }}>{initialChange ? '로그인으로 돌아가기' : '초기 비밀번호 변경'}</Button>
      <p className="text-sm text-slate-600">계정 발급 및 분실 복구는 운영 담당자에게 문의하세요.</p>
    </section> : <>
      <section className={card} aria-labelledby="session-heading">
        <h2 id="session-heading" className="font-semibold">현재 세션</h2>
        <p className="break-all text-sm">사용자: {session.actor.id}</p>
        <p className="text-sm">역할: {session.actor.roles.join(', ') || '없음'} · 도면 변경: {session.runtime.cadWriteEnabled ? '활성' : '비활성'}</p>
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void run(refresh, '현재 세션과 권한을 다시 확인했습니다.')}>세션 새로 확인</Button>
          <Button type="button" disabled={busy} onClick={() => void run(async () => { await write('auth/logout', {}); setSession(null); setUsers([]); setEvents([]); }, '로그아웃했습니다.')}>로그아웃</Button>
        </div>
      </section>
      <section className={card}>
        <h2 className="font-semibold">비밀번호 변경</h2>
        <p className="text-sm text-slate-600">변경하면 모든 세션이 회수됩니다. 새 비밀번호로 다시 로그인하세요.</p>
        <form onSubmit={event => submit(event, 'auth/change', '비밀번호를 변경했습니다. 다시 로그인하세요.', true)} className="space-y-4">
          <fieldset disabled={busy} className={formGrid}>
            <label>현재 비밀번호<input name="password" type="password" autoComplete="current-password" required maxLength={1024}/></label>
            <label>새 비밀번호<input name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={1024}/></label>
          </fieldset>
          <Button type="submit" disabled={busy}>비밀번호 변경</Button>
        </form>
      </section>
      {admin && <>
        <section className={card}>
          <h2 className="font-semibold">사용자 발급</h2>
          <form onSubmit={event => submit(event, 'users/create', '사용자를 발급했습니다. 역할과 담당 사업장을 부여하세요.', true)} className="space-y-4">
            <fieldset disabled={busy} className={formGrid}>
              <label>새 사용자 계정<input name="login" autoComplete="off" required maxLength={64}/></label>
              <label>초기 비밀번호<input name="initialPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={1024}/></label>
            </fieldset>
            <Button type="submit" disabled={busy}>사용자 발급</Button>
          </form>
        </section>
        <section className={card}>
          <h2 className="font-semibold">사용자 및 권한 관리</h2>
          <label>관리할 사용자<select value={selectedUser} disabled={busy || !users.length} onChange={event => setSelectedUser(event.target.value)}><option value="">선택</option>{users.map(user => <option key={user.id} value={user.id}>{user.login} ({user.status === 'ACTIVE' ? '활성' : '비활성'})</option>)}</select></label>
          {target && <>
            <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-slate-600">역할</dt><dd>{target.roles.join(', ') || '없음'}</dd></div><div><dt className="text-slate-600">초기 비밀번호 변경</dt><dd>{target.mustChangePassword ? '필요' : '완료'}</dd></div><div><dt className="text-slate-600">담당 사업장</dt><dd>{target.siteIds.map(id => sites.find(site => site.id === id)?.name ?? id).join(', ') || '없음'}</dd></div><div><dt className="text-slate-600">추가 권한</dt><dd>{target.specialGrants.join(', ') || '없음'}</dd></div></dl>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" disabled={busy || target.status !== 'ACTIVE'} onClick={() => void run(async () => { await write('access/disable', {userId:target.id}); await refresh(); }, '계정을 비활성화하고 세션을 회수했습니다.')}>계정 비활성화</Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => void run(async () => { await write('users/revoke', {userId:target.id}); await refresh(); }, '사용자의 모든 세션을 회수했습니다.')}>모든 세션 회수</Button>
            </div>
            <GrantForm key={target.id} userId={target.id} sites={sites} busy={busy} onGrant={(data) => void run(async () => { await write('access/grant', data); await refresh(); }, '권한을 변경했습니다. 다음 요청부터 적용됩니다.')}/>
          </>}
        </section>
        <section className={card}>
          <h2 className="font-semibold">감사 이력</h2><p className="text-sm text-slate-600">감사 조회 권한이 있는 관리자만 최근 100건을 조회할 수 있습니다. 시각은 UTC입니다.</p>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void run(async () => { const active = await runtimeJson<RuntimeSession>('auth/session'); const result = await runtimeJson<{events: Audit[]}>('access/audit', {limit:100}, active.csrfToken); setEvents(result.events); }, '감사 이력을 조회했습니다.')}>감사 이력 조회</Button>
          {events.length > 0 && <div className="max-w-full overflow-x-auto" role="region" aria-label="감사 이력 가로 스크롤" tabIndex={0}><table className="w-full min-w-[960px] text-left text-sm"><caption className="sr-only">최근 감사 이력</caption><thead><tr>{['시각 (UTC)','작업 / 결과','대상','Revision','Request ID'].map(label => <th key={label} scope="col" className="border-b p-2">{label}</th>)}</tr></thead><tbody>{events.map((entry, index) => <tr key={index}><td className="whitespace-nowrap border-b p-2">{entry.timestamp_utc}</td><td className="border-b p-2">{entry.action}<br/>{entry.outcome}</td><td className="max-w-60 break-all border-b p-2">{entry.target_kind}: {entry.target_id}</td><td className="border-b p-2">{entry.before_revision ?? '—'} → {entry.after_revision ?? '—'}</td><td className="max-w-40 break-all border-b p-2">{entry.request_id}</td></tr>)}</tbody></table></div>}
        </section>
      </>}
    </>}
  </section>;
}

function GrantForm({userId,sites,busy,onGrant}:{userId:string;sites:Site[];busy:boolean;onGrant:(input:object)=>void}) {
  const [kind,setKind] = useState('role');
  return <form aria-label="권한 변경" className="space-y-4 border-t border-slate-200 pt-4" onSubmit={event => {
    event.preventDefault(); const data=Object.fromEntries(new FormData(event.currentTarget)); onGrant({...data,affectedUserId:userId});
  }}>
    <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-3">
      <label>권한 종류<select name="kind" value={kind} onChange={event=>setKind(event.target.value)}><option value="role">역할</option><option value="site">담당 사업장</option><option value="special">추가 권한</option></select></label>
      <label>대상 권한<select name="value" key={kind} required>{kind==='role' ? ['Reader','Editor','Admin'].map(role=><option key={role}>{role}</option>) : kind==='site' ? sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>) : ['audit:read','logs:read'].map(value=><option key={value}>{value}</option>)}</select></label>
      <label>작업<select name="operation"><option value="grant">부여</option><option value="revoke">회수</option></select></label>
    </fieldset>
    <Button type="submit" disabled={busy || (kind==='site' && !sites.length)}>권한 변경</Button>
  </form>;
}
