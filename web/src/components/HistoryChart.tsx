import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { UNIT_LABEL, formatDateTimeVn, formatDateVn, formatQty, formatSignedVnd, formatVnd } from "@goldfolio/shared";
import type { History } from "../api";

interface Datum {
  date: string;
  /** Đơn giá mua của ngày (điểm mua) */
  bought?: number;
  qty?: number;
  diff?: number | null;
  /** Giá mua vào hôm nay (điểm cuối) */
  today?: number;
}

const short = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}tr` : n.toLocaleString("vi-VN"));

/**
 * Lịch sử giá theo các mốc mua của một sản phẩm (HOLD-UC01/BR-13, BR-14): mỗi ngày mua
 * một điểm, điểm hôm nay khác màu, đường nét đứt là giá vốn bình quân.
 */
export function HistoryChart({ history, onSelect }: { history: History; onSelect(productId: number): void }) {
  if (!history.productId || !history.priceUnit) return null;
  const unit = history.priceUnit;
  const data: Datum[] = history.points.map((p) => ({ date: p.date, bought: p.unitPrice, qty: p.qty, diff: p.diff }));
  if (history.today) data.push({ date: history.today.date, today: history.today.buyPrice });

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Lịch sử giá</h2>
        <select
          className="max-w-full rounded-lg border border-stone-300 px-2 py-1 text-sm"
          value={history.productId}
          onChange={(e) => onSelect(Number(e.target.value))}
        >
          {history.products.map((p) => (
            <option key={p.productId} value={p.productId}>
              {p.productName} · {p.brandName}
            </option>
          ))}
        </select>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#e7e5e4" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => formatDateVn(d).slice(0, 5)} fontSize={12} />
            <YAxis tickFormatter={short} fontSize={12} width={56} domain={["auto", "auto"]} />
            <Tooltip content={<ChartTooltip unit={unit} today={history.today} />} />
            {history.avgCost !== null && (
              <ReferenceLine
                y={history.avgCost}
                stroke="#8a6418"
                strokeDasharray="6 4"
                label={{ value: `Giá vốn bình quân ${short(history.avgCost)}`, position: "insideTopLeft", fontSize: 11, fill: "#8a6418" }}
              />
            )}
            <Line dataKey="bought" stroke="#c4912a" strokeWidth={2} dot={{ r: 4 }} connectNulls isAnimationActive={false} />
            <Scatter dataKey="today" fill="#0f8a4f" shape="diamond" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-stone-500">
        {history.today ? `Điểm xanh: giá mua vào hôm nay, cập nhật lúc ${formatDateTimeVn(history.today.priceTime)}` : "Chưa có giá hiện tại"}
        {" · "}Đơn vị: VNĐ/{UNIT_LABEL[unit]}
      </p>
    </section>
  );
}

function ChartTooltip({
  active,
  payload,
  unit,
  today,
}: {
  active?: boolean;
  payload?: { payload: Datum }[];
  unit: History["priceUnit"] & string;
  today: History["today"];
}) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm shadow">
      <div className="font-medium">{formatDateVn(d.date)}</div>
      {d.bought !== undefined ? (
        <>
          <div className="num">Đơn giá mua: {formatVnd(d.bought)}</div>
          <div>Khối lượng: {formatQty(d.qty ?? 0, unit)}</div>
          {d.diff !== null && d.diff !== undefined && <div className="num">So với giá hôm nay: {formatSignedVnd(d.diff)}</div>}
        </>
      ) : (
        <>
          <div className="num">Giá mua vào: {formatVnd(d.today ?? 0)}</div>
          {today && <div className="text-xs text-stone-500">Cập nhật lúc {formatDateTimeVn(today.priceTime)}</div>}
        </>
      )}
    </div>
  );
}
