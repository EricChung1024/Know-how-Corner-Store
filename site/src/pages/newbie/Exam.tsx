import { Link } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync, useNav } from '../../lib/hooks';
import { dayText } from '../../lib/utils';
import { Async, Chip, Empty, Icon, PageHead, StatusChip } from '../../components/ui';
import { Layout, Tabs } from '../../components/Layout';
import type { StageRow } from '../../lib/types';

/** 新人 7｜我的考核清單：三次考核（滿 1／3／6 個月）哪一場可以考、考核日是哪天 */
export default function NExam() {
  const st = useAsync(() => api.listMyExams(), []);
  const { counts } = useNav();

  const card = (x: StageRow, main: boolean) => {
    const btn = main ? 'xk-btn' : 'xk-btn-ghost';
    const action = x.status === '可作答' ? <Link className={btn} to={`/n/taking?stage=${encodeURIComponent(x.type)}`}>{x.attemptStatus === 'doing' ? '繼續作答' : '開始作答'} ›</Link>
      : x.status === '已完成' && x.attemptId ? <Link className="xk-btn-ghost" to={`/n/result?attempt=${encodeURIComponent(x.attemptId)}`}>看成績 ›</Link>
      : x.status === '已完成' ? null
      : <button className={btn} type="button" disabled>開始作答 ›</button>;
    const note = x.status === '尚未開放' ? '資深出題、審核並鎖定考卷後就能作答。'
      : x.status === '可作答' ? `考卷共 ${x.questionCount} 題（選擇 ${x.mcqCount}・簡答 ${(x.questionCount ?? 0) - (x.mcqCount ?? 0)}）${(x.questionCount ?? 0) > (x.mcqCount ?? 0) ? '，簡答由資深覆核' : ''}。`
      : x.finalScore != null ? `${x.finalScore} 分・${x.passed ? '通過' : '未通過（階段認證待補強）'}` : '選擇題已計分，簡答待資深覆核。';
    return (
      <section key={x.type} className={`${main ? 'xk-panel' : 'xk-soft'} pad`}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div className="stack-s">
            <div className="row"><h2 style={{ fontSize: main ? 26 : 22 }}>{x.name}</h2><StatusChip text={x.status} sm={false} /><Chip kind="return" ic="quiz" text={x.levelName} sm /></div>
            <p>考核日 <b>{x.dueDate}</b>（到職滿 {x.months} 個月・{x.status === '已完成' ? '已完成' : dayText(x.daysLeft)}）</p>
            <p className="mini">及格 {x.passScore} 分・考 {x.focus}</p>
            <p className="mini">{note}</p>
          </div>
          <div>{action}</div>
        </div>
      </section>
    );
  };

  return (
    <Layout nav="exam">
      <PageHead cap="考核" title="我的考核清單" sub="到職滿 1、3、6 個月各有一次考核。" right={<Tabs group="exam" />} />
      <Async state={st}>{exams => {
        if (!exams.length || !exams[0].dueDate) return <Empty gear="rookie">還沒有設定到職日，請資深在「員工詳情」設定後，這裡會出現三次考核的日期。</Empty>;
        // 只有一張主要卡片：可作答的，沒有就是下一個還沒完成的
        const focus = exams.find(x => x.status === '可作答') || exams.find(x => x.status !== '已完成');
        return (
          <>
            {exams.map(x => card(x, x === focus))}
            <div className="g2">
              <Link className="xk-soft pad tile" to="/n/records"><span className="t"><Icon name="medal" />考核紀錄</span><span className="mini">看歷次考核的日期、分數和是否通過。</span></Link>
              <Link className="xk-soft pad tile" to="/n/wrong"><span className="t"><Icon name="lightbulb" />錯題區・重練 {counts.wrong ? <span className="cnt">{counts.wrong}</span> : null}</span><span className="mini">答錯的題目會收在這裡，連續答對 2 次就算掌握。</span></Link>
            </div>
          </>
        );
      }}</Async>
    </Layout>
  );
}
