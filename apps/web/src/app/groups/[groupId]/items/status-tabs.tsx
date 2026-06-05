import Link from "next/link";

type Props = {
  groupId: string;
  current: "unsettled" | "settled";
};

// 未精算 / 精算済の一覧切り替えタブ。アクティブ側を塗りつぶしで示す。
export function StatusTabs({ groupId, current }: Props) {
  const tabClass = (active: boolean) =>
    `rounded-md border px-4 py-2 ${active ? "bg-black text-white dark:bg-white dark:text-black" : ""}`;

  return (
    <div className="flex gap-2">
      <Link href={`/groups/${groupId}/items`} className={tabClass(current === "unsettled")}>
        未精算
      </Link>
      <Link
        href={`/groups/${groupId}/items?status=settled`}
        className={tabClass(current === "settled")}
      >
        精算済
      </Link>
    </div>
  );
}
