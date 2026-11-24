import { Link, useNavigate } from 'react-router-dom';
import * as api from '../../lib/api';
import { useAsync, useModal } from '../../lib/hooks';
import { Async, canFeedback, Chip, Empty, Icon, LABEL, LABELS, LabelChip, PageHead, Xiaoju } from '../../components/ui';
import { Layout, Tabs } from '../../components/Layout';
import type { Ask } from '../../lib/types';

const fbText = (a: Ask) => {
  if (!canFeedback(a.outcome)) return <span className="mini">不需回饋</span>;
  if (a.feedback === 'up') return <Chip kind="done" ic="stamp" text="有幫助" sm />;
  if (a.feedback === 'down') return <Chip kind="return" ic="pencil" text={`沒幫助・${a.reason}`} sm />;
  return <span className="mini">還沒回饋</span>;
};
const fbPlain = (a: Ask) => (!canFeedback(a.outcome) ? '不需回饋' : a.feedback === 'up' ? '有幫助' : a.feedback === 'down' ? `沒幫助・${a.reason}` : '還沒回饋');

/** 新人 4｜我的提問紀錄：回頭看自己問過什麼 */
export default function NHistory() {
  const st = useAsync(() => api.listMyAsks(), []);
  const modal = useModal();
  const go = useNavigate();
  const open = async (a: Ask) => {
    const expr = LABEL[a.outcome]?.[3];
    const r = await modal({
      title: `${a.createdAt} 的對話`,
      body: (
        <div className="stack-s">
          <div className="xk-bubble xk-bubble-me msg-me">{a.question}</div>
          <div className="xk-cat-say msg-cat"><Xiaoju expr={expr || 'hint'} gear="rookie" size="" />
            <div className="xk-bubble xk-bubble-cat"><div className="chips"><LabelChip outcome={a.outcome} /></div><p className="pre">{a.reply}</p>{a.sourceChip ? <p className="src"><Icon name="book" small /> {a.sourceChip}</p> : null}</div>
          </div>
          <p className="mini">回饋：{fbPlain(a)}</p>
        </div>
      ),
      actions: [{ label: '關閉', value: null }, { label: '回問小橘 ›', value: 'ask', primary: true }],
    });
    if (r === 'ask') go('/n/ask');
  };
  return (
    <Layout nav="qa">
      <PageHead cap="問答亭" title="我的提問紀錄" sub="回頭看自己問過什麼，以及小橘當時怎麼判斷。" right={<Tabs group="qa" />} />
      <Async state={st}>{asks => asks.length === 0 ? (
        <Empty gear="rookie" action={<Link className="xk-btn" to="/n/ask">前往問小橘 ›</Link>}>你還沒問過問題。到「問小橘」問第一題吧，喵。</Empty>
      ) : (
        <>
          <div className="row between"><span className="mini">共 {asks.length} 筆</span><div className="chips">{LABELS.filter(l => asks.some(a => a.outcome === l)).map(l => <LabelChip key={l} outcome={l} />)}</div></div>
          <div className="scroll"><table className="tbl"><thead><tr><th>日期</th><th>問題</th><th>判斷結果</th><th>回饋</th><th><span className="sr">動作</span></th></tr></thead>
            <tbody>{asks.map(a => (
              <tr key={a.id}><td className="nowrap">{a.createdAt}</td><td className="q">{a.question}</td><td><LabelChip outcome={a.outcome} /></td><td>{fbText(a)}</td>
                <td><button type="button" className="xk-btn-ghost" onClick={() => open(a)}>看對話</button></td></tr>
            ))}</tbody></table></div>
        </>
      )}</Async>
    </Layout>
  );
}
