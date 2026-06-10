-- #69: サインアップ時のメール検証を必須化（auth.ts の requireEmailVerification: true）するにあたり、
-- 既存ユーザーは全員 email_verified=false のままだとサインインが 403 で弾かれロックアウトされる。
-- 実在確認はされないが、ロックアウト回避を優先して既存ユーザーを検証済みにバックフィルする。
-- スキーマ変更を伴わないデータ移行のため drizzle-kit generate では生成されず、手書きで追加した。
UPDATE `user` SET `email_verified` = 1 WHERE `email_verified` = 0;
