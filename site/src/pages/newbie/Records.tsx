import { Link } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync } from '../../lib/hooks';
import { Async, Empty, PageHead, StatusChip } from '../../components/ui';
import { Layout, Tabs } from '../../components/Layout';

/** 新人 10｜考核紀錄：看歷次成績 */
export default function NRecords() {
  const st = useAsync(() => Promise.all([api.listMyRecords(), api.listMyExams()]), []);
  return (
    <Layout nav="exam">
      <PageHead cap="考核" title="考核紀錄" sub="看歷次考核的成績。" right={<Tabs group="exam" />} />
      <Async state={st}>{([rec, exams]) => {
        const upcoming = exams.filter(x => !rec.some(r => r.type === x.type) && x.dueDate);
        if (!rec.length && !upcoming.length) return <Empty gear="rookie">還沒有考核紀錄。</Empty>;
        return (
          <>
            <div className="scroll"><table className="tbl"><thead><tr><th>考核</th><th>日期</th><th className="num">分數</th><th className="num">及格</th><th>是否通過</th><th><span className="sr">動作</span></th></tr></thead>
              <tbody>
                {rec.map(r => (
                  <tr key={r.attemptId}><td className="disp">{r.exam}</td><td className="nowrap">{r.date}</td><td className="num">{r.score == null ? '—' : `${r.score} 分`}</td><td className="num">{r.passScore ?? '—'}</td>
                    <td><StatusChip text={r.score == null ? '待資深覆核' : r.passed ? '通過' : '未通過'} /></td>
                    <td>{r.attemptId ? <Link className="linkbtn" to={`/n/result?attempt=${encodeURIComponent(r.attemptId)}`}>看成績</Link> : null}</td></tr>
                ))}
                {upcoming.map(x => (
                  <tr key={x.type}><td className="disp">{x.name}</td><td className="nowrap muted">考核日 {x.dueDate}</td><td className="num muted">—</td><td className="num muted">{x.passScore}</td>
                    <td><StatusChip text={x.status === '可作答' ? '可作答' : '尚未舉行'} /></td><td /></tr>
                ))}
              </tbody></table></div>
            <p className="mini">未通過只標示「階段認證待補強」，不影響等級。</p>
          </>
        );
      }}</Async>
    </Layout>
  );
}
