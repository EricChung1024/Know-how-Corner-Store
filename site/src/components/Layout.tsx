import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { logout } from '../lib/api';
import { useAuth, useNav } from '../lib/hooks';
import { COMPANY } from '../lib/config';
import { asset } from '../lib/utils';
import { Chip, Icon } from './ui';
import type { Role } from '../lib/types';

/** 導覽列（名稱與順序依頁面規格表，不可增刪改名）。 */
export const NAV: Record<Role, { key: string; to: string; label: string; ic: string }[]> = {
  newbie: [
    { key: 'home', to: '/n/home', label: '首頁', ic: 'storefront' },
    { key: 'sop', to: '/n/sop', label: '新人版 SOP', ic: 'book' },
    { key: 'qa', to: '/n/ask', label: '問答亭', ic: 'chat' },
    { key: 'exam', to: '/n/exam', label: '考核', ic: 'quiz' },
  ],
  senior: [
    { key: 'home', to: '/s/home', label: '首頁', ic: 'storefront' },
    { key: 'flow', to: '/s/flow', label: 'SOP 統整', ic: 'pencil' },
    { key: 'sop', to: '/s/sop', label: '資深版 SOP', ic: 'book' },
    { key: 'qa', to: '/s/pending', label: '問答管理', ic: 'chat' },
    { key: 'exam', to: '/s/employees', label: '考核管理', ic: 'quiz' },
  ],
};

/** 各導覽項目底下的分頁。第三個值是要顯示的數字（來自導覽列數字）。 */
const TABS: Record<string, [string, string, string?][]> = {
  qa: [['/n/ask', '問小橘'], ['/n/history', '我的提問紀錄'], ['/n/pending', '待確認清單', 'qa'], ['/n/stats', '我的統計']],
  exam: [['/n/exam', '我的考核清單'], ['/n/records', '考核紀錄'], ['/n/wrong', '錯題區・重練', 'wrong']],
  sqa: [['/s/pending', '待確認清單：回覆', 'qa'], ['/s/stats', '問答統計']],
  sexam: [['/s/employees', '員工總覽'], ['/s/paper', '考卷審核'], ['/s/bank', '題庫審核']],
};

const Cnt = ({ n }: { n?: number }) => (n ? <> <span className="cnt" aria-label={`${n} 件`}>{n}</span></> : null);

/** 分頁列（目前頁面以 aria-current 標示）。 */
export function Tabs({ group }: { group: keyof typeof TABS }) {
  const { counts } = useNav();
  const { pathname } = useLocation();
  return (
    <nav className="xk-segs" aria-label="分頁">
      {TABS[group].map(([to, label, k]) => (
        <Link key={to} className="xk-seg" to={to} aria-current={pathname === to ? 'page' : undefined}>{label}{k ? <Cnt n={counts[k as 'qa' | 'wrong']} /> : null}</Link>
      ))}
    </nav>
  );
}

/** 頁首、導覽列、頁尾。nav：目前所在的導覽項目 key。 */
export function Layout({ nav, children }: { nav: string; children: ReactNode }) {
  const { user, setUser } = useAuth();
  const { counts } = useNav();
  const go = useNavigate();
  if (!user) return null;
  const home = user.role === 'senior' ? '/s/home' : '/n/home';
  const out = async () => { await logout(); setUser(null); go('/'); };
  return (
    <>
      <div className="xk-pat-awning" aria-hidden="true" />
      <header className="top">
        <Link className="brand-logo" to={home} aria-label="經驗柑仔店 首頁">
          <img className="brand-logo__mark" src={asset('assets/logo/mark.svg')} alt="" />
          <span className="brand-logo__text"><span className="brand-logo__name">經驗柑仔店</span><span className="brand-logo__tagline">Know-how Corner Store</span></span>
        </Link>
        <nav className="nav" aria-label="主選單" id="mainNav">
          {NAV[user.role].map(n => (
            <NavLink key={n.key} className="navi" to={n.to} aria-current={n.key === nav ? 'page' : undefined}>
              <Icon name={n.ic} small />{n.label}<Cnt n={counts[n.key as 'sop' | 'qa' | 'exam']} />
            </NavLink>
          ))}
        </nav>
        <div className="who">
          <Link className="name" to="/account" title="帳號與密碼" style={{ color: 'inherit' }}>{user.name}</Link>
          {user.role === 'senior' ? <Chip kind="done" ic="medal" text="資深" sm /> : <Chip kind="new" ic="person" text="新人" sm />}
          <button type="button" className="xk-btn-ghost sm" onClick={out}>登出</button>
        </div>
      </header>
      <main className="page" id="main">{children}</main>
      <footer className="foot" id="foot"><span>{COMPANY.name}為虛構公司；人名、題目、SOP 內容皆為示範資料。</span><span /></footer>
    </>
  );
}
