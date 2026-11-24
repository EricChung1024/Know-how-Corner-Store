// core.js｜共用小工具（$、esc、store）、示範帳號、小橘繪圖 xiaoju()、對話泡泡 bubble()、toast()
// 經驗柑仔店 Know-how Corner Store｜SOP 統整中心 — 範例公司「好物集」與所有資料皆為虛構。

const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const store = {get(k){ try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }};
const ACCOUNTS = {
  manager: {id: "peishan", name: "林佩珊", title: "資深客服專員", role: "主管", gear: "senior"},
  newbie: {id: "youting", name: "陳宥廷", title: "新人", role: "新人", gear: "rookie"},
};

// ---------- 小橘（黏土微縮風：放射狀橘色漸層、柔和描邊、深棕色眼睛） ----------
let catN = 0;
function xiaoju({expr = "default", gear = "", label = "小橘"} = {}){
  const id = "xj" + (++catN);
  const eyes = {
    default: `<ellipse cx="47" cy="52" rx="3.6" ry="4.4" fill="#4A2A18"/><ellipse cx="73" cy="52" rx="3.6" ry="4.4" fill="#4A2A18"/><circle cx="48.3" cy="50.4" r="1.2" fill="#FFF"/><circle cx="74.3" cy="50.4" r="1.2" fill="#FFF"/>`,
    happy: `<path d="M42.5 53.5 Q47 47.5 51.5 53.5 M68.5 53.5 Q73 47.5 77.5 53.5" fill="none" stroke="#4A2A18" stroke-width="2.4" stroke-linecap="round"/>`,
    confused: `<path d="M43 48.5 L49.5 52 L43 55.5 M77 48.5 L70.5 52 L77 55.5" fill="none" stroke="#4A2A18" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  };
  eyes.hint = eyes.default;
  const mouth = expr === "hint" ? `<ellipse cx="60" cy="65" rx="2.1" ry="2.5" fill="#4A2A18"/>`
    : expr === "confused" ? `<path d="M53.5 65 q2.2 -2 4.4 0 t4.4 0 t4.4 0" fill="none" stroke="#4A2A18" stroke-width="1.6" stroke-linecap="round"/>`
    : `<path d="M55.5 62.8 q2.25 2.8 4.5 0 q2.25 2.8 4.5 0" fill="none" stroke="#4A2A18" stroke-width="1.6" stroke-linecap="round"/>`;
  const extra = expr === "hint" ? `<g transform="translate(94 14)"><circle r="7" fill="url(#${id}g)" stroke="#B8703E" stroke-width="1.4"/><rect x="-3.5" y="6" width="7" height="5" rx="1.5" fill="#E6CFAE" stroke="#B8703E" stroke-width="1.2"/><path d="M-2 -1 l2 3 l2 -3" fill="none" stroke="#B8703E" stroke-width="1.1"/></g>`
    : expr === "confused" ? `<text x="92" y="24" font-family="Huninn, Noto Sans TC, sans-serif" font-size="24" fill="#B8703E">?</text>` : "";
  const blush = expr === "happy" ? .62 : .4;
  const cape = gear === "senior" ? `<path d="M32 84 Q22 110 28 124 L88 124 Q94 110 84 84 Z" fill="url(#${id}t)" stroke="#B8703E" stroke-width="1.4"/>` : "";
  const front = gear === "senior"
    ? `<path d="M35 80 Q58 93 83 80 Q85 86 82 89 Q58 101 37 89 Q34 86 35 80 Z" fill="url(#${id}t)" stroke="#B8703E" stroke-width="1.3"/>
       <path d="M74 88 l7 15 l-8 1.5 l-3 -14 z" fill="url(#${id}t)" stroke="#B8703E" stroke-width="1.2"/>
       <path d="M47 87.5 l1.8 3.7 l4 .5 l-3 2.8 l.8 4 l-3.6 -2 l-3.6 2 l.8 -4 l-3 -2.8 l4 -.5 z" fill="url(#${id}g)" stroke="#B8703E" stroke-width="1"/>`
    : gear === "rookie"
    ? `<path d="M48 82 L56 95 M72 82 L64 95" stroke="#C98A5A" stroke-width="1.4"/>
       <rect x="50" y="94" width="20" height="14" rx="3" fill="#FFF6E6" stroke="#B8703E" stroke-width="1.3"/><rect x="50" y="94" width="20" height="4" rx="2" fill="#D9806A"/>
       <path d="M54 102.5 h12 M54 105 h8" stroke="#C98A5A" stroke-width="1.2" stroke-linecap="round"/>` : "";
  return `<svg class="xiaoju" viewBox="0 0 120 132" role="img" aria-label="${esc(label)}">
  <defs>
    <radialGradient id="${id}o" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="#FFCB91"/><stop offset=".55" stop-color="#F49C4F"/><stop offset="1" stop-color="#D8772F"/></radialGradient>
    <radialGradient id="${id}b" cx="40%" cy="30%" r="75%"><stop offset="0" stop-color="#FFC285"/><stop offset=".6" stop-color="#F09447"/><stop offset="1" stop-color="#D2702A"/></radialGradient>
    <radialGradient id="${id}g" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#FFE7A3"/><stop offset="1" stop-color="#FFC94A"/></radialGradient>
    <radialGradient id="${id}t" cx="35%" cy="30%" r="85%"><stop offset="0" stop-color="#EBA08B"/><stop offset="1" stop-color="#D9806A"/></radialGradient>
    <filter id="${id}s" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
  </defs>
  <ellipse cx="58" cy="125" rx="34" ry="5" fill="#B8703E" opacity=".25" filter="url(#${id}s)"/>
  ${cape}
  <g class="tail"><path d="M84 112 C104 110 112 92 104 72" fill="none" stroke="#B8703E" stroke-width="12.6" stroke-linecap="round"/><path d="M84 112 C104 110 112 92 104 72" fill="none" stroke="url(#${id}b)" stroke-width="10" stroke-linecap="round"/></g>
  <ellipse cx="58" cy="101" rx="31" ry="25" fill="url(#${id}b)" stroke="#B8703E" stroke-width="1.6"/>
  <ellipse cx="58" cy="106" rx="16" ry="14" fill="#FFD3A0" opacity=".55"/>
  <ellipse cx="47" cy="122" rx="8.5" ry="4.6" fill="url(#${id}o)" stroke="#B8703E" stroke-width="1.4"/>
  <ellipse cx="69" cy="122" rx="8.5" ry="4.6" fill="url(#${id}o)" stroke="#B8703E" stroke-width="1.4"/>
  ${front}
  <g class="head">
    <path d="M27 47 Q22 20 31 13 Q43 17 53 30 Z" fill="url(#${id}o)" stroke="#B8703E" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M93 47 Q98 20 89 13 Q77 17 67 30 Z" fill="url(#${id}o)" stroke="#B8703E" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M32 40 Q30 25 34 21 Q41 25 46 31 Z M88 40 Q90 25 86 21 Q79 25 74 31 Z" fill="#D9806A" opacity=".42"/>
    <ellipse cx="60" cy="53" rx="36" ry="30" fill="url(#${id}o)" stroke="#B8703E" stroke-width="1.6"/>
    <ellipse cx="45" cy="33" rx="9" ry="4.2" fill="#FFFFFF" opacity=".55" transform="rotate(-18 45 33)"/>
    <ellipse cx="39" cy="62" rx="6" ry="3.6" fill="#D9806A" opacity="${blush}"/><ellipse cx="81" cy="62" rx="6" ry="3.6" fill="#D9806A" opacity="${blush}"/>
    ${eyes[expr] || eyes.default}
    <ellipse cx="60" cy="59.4" rx="1.9" ry="1.3" fill="#A65A2A"/>
    ${mouth}
  </g>
  ${extra}</svg>`;
}
function bubble(text, {expr = "default", who = "小橘"} = {}){
  const g = S.user ? ACCOUNTS[S.user.key].gear : "";
  return `<div class="say"><button class="catbtn cat" type="button" data-cat aria-label="小橘：再說一次">${xiaoju({expr, gear: g})}</button>
    <div class="bubble" aria-live="polite"><div class="who">${esc(who)}</div><div class="say-text">${esc(text)}</div></div></div>`;
}
function wireCats(lines){
  let k = 0;
  document.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => {
    const svg = b.querySelector("svg"); svg.classList.remove("pop"); void svg.getBBox(); svg.classList.add("pop");
    if (lines && lines.length) { const t = b.parentElement.querySelector(".say-text"); if (t) t.textContent = lines[k++ % lines.length]; }
  });
}
function pop(el){ if (!el) return; el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); }
function toast(m){ const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 2800); }
const markSVG = `<svg class="mark" viewBox="0 0 44 44" aria-hidden="true"><rect x="2" y="2" width="40" height="40" rx="10" fill="#FFC94A" stroke="#2B1E16" stroke-width="2.5"/><ellipse cx="22" cy="27" rx="7.5" ry="6.5" fill="#2B1E16"/><circle cx="12.5" cy="18.5" r="3.3" fill="#2B1E16"/><circle cx="18.5" cy="13" r="3.3" fill="#2B1E16"/><circle cx="25.5" cy="13" r="3.3" fill="#2B1E16"/><circle cx="31.5" cy="18.5" r="3.3" fill="#2B1E16"/></svg>`;
