// メール HTML 組み立て用の最小ユーティリティ。各メールテンプレート（reset-password / verify-email 等）が
// href への URL 埋め込みで共通して必要とするため、ここに一元化して重複と文言ドリフトを避ける。

// HTML 属性値（href）への埋め込み用の最小エスケープ。現状の url は & を含まないことが多いが、将来
// クエリパラメータが増えて & が入っても属性が壊れない・属性インジェクションされないよう、
// コメントの不変条件に頼らず境界で構造的にエスケープする。
export function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
