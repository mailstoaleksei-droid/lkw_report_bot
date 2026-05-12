export type NormalizedMasterStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "SOLD"
  | "RETURNED"
  | "WORKSHOP"
  | "RESERVE"
  | "DISMISSED"
  | "VACATION"
  | "SICK"
  | "UNKNOWN";

export type NormalizedOrderStatus = "OPEN" | "PLANNED" | "PROBLEM" | "DONE" | "CANCELLED";

function normalizeText(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[ück]/g, (match) => {
      if (match === "ü") return "u";
      if (match === "к") return "k";
      return match;
    })
    .replace(/\s+/g, " ");
}

export function normalizeMasterStatus(value: string | null | undefined): NormalizedMasterStatus {
  const text = normalizeText(value);
  if (!text || text === "0" || text === "aktiv" || text === "active") return "ACTIVE";
  if (text === "inaktiv" || text === "inactive") return "INACTIVE";
  if (text === "verkauft" || text === "sold") return "SOLD";
  if (text === "ruckgabe" || text === "returned" || text === "return") return "RETURNED";
  if (text === "werkstatt" || text === "workshop") return "WORKSHOP";
  if (text === "reserve") return "RESERVE";
  if (text === "fahrer entlassen" || text === "entlassen" || text === "dismissed") return "DISMISSED";
  if (text === "urlaub" || text === "u" || text === "vacation") return "VACATION";
  if (text === "krank" || text === "k" || text === "sick") return "SICK";
  return "UNKNOWN";
}

export function normalizeOrderStatus(value: string | null | undefined): NormalizedOrderStatus {
  const text = normalizeText(value);
  if (!text || text === "offen" || text === "open") return "OPEN";
  if (text === "geplant" || text === "planned") return "PLANNED";
  if (text === "problem") return "PROBLEM";
  if (text === "fertig" || text === "done") return "DONE";
  if (text === "storniert" || text === "cancelled" || text === "canceled") return "CANCELLED";
  return "PROBLEM";
}

