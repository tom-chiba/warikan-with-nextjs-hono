// ローカルタイムゾーンでの「今日」を input[type=date] 用の "YYYY-MM-DD" で返す。
// toISOString() は UTC 基準で日付がずれうるため、ローカルの年月日から組み立てる。
export function todayLocal(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
