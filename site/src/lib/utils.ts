/** 'YYYY-MM-DD' → 'M/D' */
export const md = (iso?: string | null) => { if (!iso) return ''; const [, m, d] = iso.split('-'); return `${+m}/${+d}`; };
export const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
/** 距離某天的說法：「還有 N 天」「就是今天」「已過 N 天」 */
export const dayText = (n: number | null | undefined) => (n == null ? '' : n > 0 ? `還有 ${n} 天` : n === 0 ? '就是今天' : `已過 ${-n} 天`);
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
export const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** 靜態檔（public/）的網址；base 是 './'，所以要接在 BASE_URL 後面。 */
export const asset = (p: string) => `${import.meta.env.BASE_URL}${p}`;
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
