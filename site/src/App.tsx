import { useEffect, type ReactElement } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './lib/hooks';
import type { Role } from './lib/types';
import { Loading } from './components/ui';
import Login from './pages/Login';
import Account from './pages/Account';
import NHome from './pages/newbie/Home';
import NSop from './pages/newbie/Sop';
import NAsk from './pages/newbie/Ask';
import NHistory from './pages/newbie/History';
import NPending from './pages/newbie/Pending';
import NStats from './pages/newbie/Stats';
import NExam from './pages/newbie/Exam';
import NTaking from './pages/newbie/Taking';
import NResult from './pages/newbie/Result';
import NRecords from './pages/newbie/Records';
import NWrong from './pages/newbie/Wrong';
import SHome from './pages/senior/Home';
import SFlow from './pages/senior/Flow';
import SSop from './pages/senior/Sop';
import SPending from './pages/senior/Pending';
import SStats from './pages/senior/Stats';
import SEmployees from './pages/senior/Employees';
import SEmployee from './pages/senior/Employee';
import SPaper from './pages/senior/Paper';
import SBank from './pages/senior/Bank';
import SNewUser from './pages/senior/NewUser';

/** 沒登入回登入頁；角色不對就送回自己的首頁。 */
function Guard({ role, children }: { role?: Role; children: ReactElement }) {
  const { user, ready } = useAuth();
  if (!ready && !user) return <Loading />;
  if (!user) return <Navigate to="/" replace />;
  if (role && user.role !== role) return <Navigate to={user.role === 'senior' ? '/s/home' : '/n/home'} replace />;
  return children;
}

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  const n = (el: ReactElement) => <Guard role="newbie">{el}</Guard>;
  const s = (el: ReactElement) => <Guard role="senior">{el}</Guard>;
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/account" element={<Guard><Account /></Guard>} />
      <Route path="/n/home" element={n(<NHome />)} />
      <Route path="/n/sop" element={n(<NSop />)} />
      <Route path="/n/ask" element={n(<NAsk />)} />
      <Route path="/n/history" element={n(<NHistory />)} />
      <Route path="/n/pending" element={n(<NPending />)} />
      <Route path="/n/stats" element={n(<NStats />)} />
      <Route path="/n/exam" element={n(<NExam />)} />
      <Route path="/n/taking" element={n(<NTaking />)} />
      <Route path="/n/result" element={n(<NResult />)} />
      <Route path="/n/records" element={n(<NRecords />)} />
      <Route path="/n/wrong" element={n(<NWrong />)} />
      <Route path="/s/home" element={s(<SHome />)} />
      <Route path="/s/flow" element={s(<SFlow />)} />
      <Route path="/s/sop" element={s(<SSop />)} />
      <Route path="/s/pending" element={s(<SPending />)} />
      <Route path="/s/stats" element={s(<SStats />)} />
      <Route path="/s/employees" element={s(<SEmployees />)} />
      <Route path="/s/employee" element={s(<SEmployee />)} />
      <Route path="/s/paper" element={s(<SPaper />)} />
      <Route path="/s/bank" element={s(<SBank />)} />
      <Route path="/s/new-user" element={s(<SNewUser />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
