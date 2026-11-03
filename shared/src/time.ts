// Mọi ngày giờ nghiệp vụ tính theo giờ Việt Nam, không theo múi giờ của máy chạy
// (máy chủ thường để UTC: 0h–7h sáng VN vẫn là "hôm qua" theo UTC).
const TZ = "Asia/Ho_Chi_Minh";

function parts(d: Date) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  // Một số ICU trả "24" cho nửa đêm
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` };
}

/** Ngày "YYYY-MM-DD" theo giờ VN. */
export function vnDate(d: Date = new Date()): string {
  return parts(d).date;
}

/** Giờ "HH:mm" theo giờ VN. */
export function vnTime(d: Date = new Date()): string {
  return parts(d).time;
}

/** Đổi ngày + giờ VN thành mốc thời gian ISO (UTC). VN không có giờ mùa hè: luôn +07:00. */
export function vnToIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+07:00`).toISOString();
}
