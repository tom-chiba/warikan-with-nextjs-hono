// 金額（円）の桁区切り表示。toLocaleString() は呼び出しごとにロケール解決を行うため、
// NumberFormat を 1 つ共有して一覧の行数分の生成コストを避ける。
const yenFormatter = new Intl.NumberFormat("ja-JP");

export function formatAmount(amount: number): string {
  return yenFormatter.format(amount);
}
