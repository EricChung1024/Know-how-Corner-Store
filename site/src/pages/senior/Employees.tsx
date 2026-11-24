import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync, useToast } from '../../lib/hooks';
import { Async, Chip, Empty, PageHead, StatusChip } from '../../components/ui';
import { Layout, Tabs } from '../../components/Layout';

/** 資深 6｜員工總覽：掌握每位新人的狀態（?new=工號 會標示剛建立的帳號） */
export default function SEmployees() {
  const [sp] = useSearchParams();
  const hl = sp.get('new');
  const toast = useToast();
  useEffect(() => { if (hl) toast('已建立帳號'); }, [hl, toast]);
  const st = useAsync(() => api.listEmployees(), []);
  const add = <Link className="xk-btn" to="/s/new-user">新增員工 ›</Link>;
  return (
    <Layout nav="exam">
      <PageHead cap="考核管理" title="員工總覽" sub="掌握每位新人的到職日、下次考核和成績。" right={<Tabs group="sexam" />} />
      <Async state={st}>{list => !list.length ? <Empty gear="senior" action={add}>還沒有新人帳號。</Empty> : (
        <>
          <div className="row between"><span className="mini">共 {list.length} 位新人</span>{add}</div>
          <div className="scroll"><table className="tbl"><thead><tr><th>姓名</th><th>工號</th><th>身分</th><th>到職日</th><th>下次考核</th><th>考核日</th><th className="num">最近成績</th><th>待覆核簡答</th></tr></thead>
            <tbody>{list.map(s => (
              <tr key={s.id} className={hl === s.id ? 'hl' : ''}>
                <td><Link className="linkbtn" to={`/s/employee?id=${encodeURIComponent(s.id)}`}>{s.name}</Link></td><td className="nowrap">{s.employeeId}</td>
                <td>{s.role === 'senior' ? <Chip kind="done" ic="medal" text="資深" sm /> : <Chip kind="new" ic="person" text="新人" sm />}</td><td className="nowrap">{s.hireDate || '—'}</td>
                <td>{s.nextExam ? s.nextExam.name : '—'}</td><td className="nowrap">{s.nextExam ? s.nextExam.deadline : '—'}</td>
                <td className="num">{s.latestPending ? '待覆核' : s.latestScore == null ? '—' : `${s.latestScore} 分`}</td><td>{s.hasPendingReview ? <StatusChip text="待覆核" /> : <span className="mini">沒有</span>}</td>
              </tr>
            ))}</tbody></table></div>
        </>
      )}</Async>
    </Layout>
  );
}
