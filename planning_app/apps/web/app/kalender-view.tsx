"use client";

import { useCallback, useEffect, useState } from "react";

// ── types ──────────────────────────────────────────────────────────────────────

type CellLabel =
  | "assigned"
  | "vacation"
  | "sick"
  | "workshop"
  | "sold"
  | "returned"
  | "reserve"
  | "no-driver"
  | "inactive";

interface KalenderCell {
  date: string;
  driverId: string | null;
  driverName: string | null;
  isWebAssigned: boolean;
  isTransfer: boolean;
  label: CellLabel;
  color: string;
}

interface AvailableDriver {
  id: string;
  fullName: string;
  blocked: boolean;
  unavailableStatus: string | null;
}

type KalenderViewMode = "week" | "multi";

interface MultiWeekCell {
  isoWeek: string;
  label: CellLabel;
  color: string;
  driverSummary: string | null;
  note: string | null;
}

interface MultiWeekLkwRow {
  lkwId: string;
  lkwNumber: string;
  company: string | null;
  status: string;
  drucker: string | null;
  weekCells: MultiWeekCell[];
}

interface WeekHeader {
  isoWeek: string;
  startDate: string;
  endDate: string;
}

interface MultiWeekData {
  ok: boolean;
  startIsoWeek: string;
  weeks: WeekHeader[];
  lkwRows: MultiWeekLkwRow[];
}

interface LkwRow {
  lkwId: string;
  lkwNumber: string;
  company: string | null;
  status: string;
  drucker: string | null;
  cells: KalenderCell[];
}

interface DayStat {
  date: string;
  assignedLkw: number;
  totalActiveLkw: number;
  utilizationPercent: number;
}

interface DriverEntry {
  id: string;
  fullName: string;
}

interface WeekStats {
  lkw: {
    total: number;
    assigned: number;
    noDriver: number;
    workshop: number;
    reserve: number;
    sold: number;
    returned: number;
    avgUtilizationPercent: number;
  };
  drivers: {
    totalActive: number;
    working: number;
    vacation: number;
    sick: number;
    free: number;
    vacationList: DriverEntry[];
    sickList: DriverEntry[];
    freeList: DriverEntry[];
  };
}

interface KalenderData {
  ok: boolean;
  isoWeek: string;
  year: number;
  week: number;
  days: string[];
  lkwRows: LkwRow[];
  stats: { dayStats: DayStat[]; weekStats: WeekStats };
}

// ── helpers ────────────────────────────────────────────────────────────────────

function currentIsoWeek(): string {
  const now = new Date();
  const jan4 = new Date(Date.UTC(now.getUTCFullYear(), 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const diffMs = now.getTime() - week1Mon.getTime();
  const week = Math.floor(diffMs / (7 * 24 * 3600 * 1000)) + 1;
  // handle year boundary
  if (week < 1) {
    return prevIsoWeek(`${now.getUTCFullYear()}01`);
  }
  const year = now.getUTCFullYear();
  return `${year}${String(week).padStart(2, "0")}`;
}

function prevIsoWeek(isoWeek: string): string {
  const year = parseInt(isoWeek.slice(0, 4), 10);
  const week = parseInt(isoWeek.slice(4, 6), 10);
  if (week > 1) return `${year}${String(week - 1).padStart(2, "0")}`;
  // last week of previous year
  const lastWeek = isoWeeksInYear(year - 1);
  return `${year - 1}${String(lastWeek).padStart(2, "0")}`;
}

function nextIsoWeek(isoWeek: string): string {
  const year = parseInt(isoWeek.slice(0, 4), 10);
  const week = parseInt(isoWeek.slice(4, 6), 10);
  const maxWeek = isoWeeksInYear(year);
  if (week < maxWeek) return `${year}${String(week + 1).padStart(2, "0")}`;
  return `${year + 1}01`;
}

function isoWeeksInYear(year: number): number {
  // A year has 53 ISO weeks if Jan 1 or Dec 31 is Thursday
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dec31 = new Date(Date.UTC(year, 11, 31));
  return (jan1.getUTCDay() === 4 || dec31.getUTCDay() === 4) ? 53 : 52;
}

const DAY_NAMES_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const LABEL_DISPLAY: Record<CellLabel, string> = {
  assigned: "",
  vacation: "U",
  sick: "K",
  workshop: "WS",
  sold: "Vk",
  returned: "Rg",
  reserve: "Rsv",
  "no-driver": "O.F.",
  inactive: "—",
};

const LEGEND: Array<{ label: CellLabel; text: string }> = [
  { label: "assigned", text: "Zugewiesen" },
  { label: "no-driver", text: "Ohne Fahrer" },
  { label: "vacation", text: "Urlaub (U)" },
  { label: "sick", text: "Krank (K)" },
  { label: "workshop", text: "Werkstatt" },
  { label: "reserve", text: "Reserve/Miete" },
  { label: "returned", text: "Rückgabe" },
  { label: "sold", text: "Verkauft" },
];

const LABEL_COLORS: Record<CellLabel, string> = {
  assigned: "#DCFCE7",
  vacation: "#FEF08A",
  sick: "#FCA5A5",
  workshop: "#FED7AA",
  sold: "#374151",
  returned: "#D1D5DB",
  reserve: "#DDD6FE",
  "no-driver": "#FECDD3",
  inactive: "#9CA3AF",
};

// ── MultiWeekGrid ──────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function formatWeekHeader(startDate: string, endDate: string): string {
  const s = new Date(startDate + "T00:00:00Z");
  const e = new Date(endDate + "T00:00:00Z");
  const sM = MONTH_NAMES[s.getUTCMonth()];
  const eM = MONTH_NAMES[e.getUTCMonth()];
  return sM === eM
    ? `${s.getUTCDate()}–${e.getUTCDate()} ${sM}`
    : `${s.getUTCDate()} ${sM} – ${e.getUTCDate()} ${eM}`;
}

interface MultiWeekGridProps {
  apiBase: string;
  startIsoWeek: string;
  lkwFilter: string;
  showSold: boolean;
  onWeekClick: (isoWeek: string) => void;
}

function MultiWeekGrid({ apiBase, startIsoWeek, lkwFilter, showSold, onWeekClick }: MultiWeekGridProps) {
  const [data, setData] = useState<MultiWeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${apiBase}/api/kalender/multi?startIsoWeek=${startIsoWeek}&weeks=8`,
          { credentials: "include" },
        );
        const json = await res.json() as MultiWeekData;
        if (!json.ok) throw new Error("API error");
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [apiBase, startIsoWeek]);

  if (loading) return <div className="kalender-loading">Lade Übersicht…</div>;
  if (error) return <div className="kalender-error">Fehler: {error}</div>;
  if (!data) return null;

  const visibleRows = data.lkwRows.filter((row) => {
    const matchFilter = lkwFilter.trim() === "" || row.lkwNumber.toLowerCase().includes(lkwFilter.toLowerCase());
    const allInactive = row.weekCells.every((c) => c.label === "sold" || c.label === "returned");
    return matchFilter && (showSold || !allInactive);
  });

  return (
    <div className="kalender-table-wrap">
      <table className="kalender-table multi-week-table">
        <thead>
          <tr>
            <th className="kalender-th-lkw">LKW</th>
            {data.weeks.map((w) => (
              <th
                key={w.isoWeek}
                className="kalender-th-day multi-week-th"
                onClick={() => onWeekClick(w.isoWeek)}
                title="Klicken für Wochenansicht"
              >
                <div className="multi-week-kw">KW {w.isoWeek.slice(4)}</div>
                <div className="kalender-th-date">{formatWeekHeader(w.startDate, w.endDate)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <tr key={row.lkwId}>
              <td className="kalender-td-lkw" title={row.company ?? undefined}>
                <div>{row.lkwNumber}</div>
                {row.drucker && <div className="lkw-drucker">{row.drucker}</div>}
              </td>
              {row.weekCells.map((cell) => {
                const textColor = cell.label === "sold" ? "#f3f4f6" : "#111827";
                return (
                  <td
                    key={cell.isoWeek}
                    className="kalender-cell multi-week-cell"
                    style={{ background: cell.color, color: textColor }}
                    title={cell.driverSummary ?? cell.label}
                    onClick={() => onWeekClick(cell.isoWeek)}
                  >
                    {cell.driverSummary
                      ? (
                        <span className="multi-driver">
                          {cell.driverSummary}
                          {cell.note && <span className="multi-note"> {cell.note}</span>}
                        </span>
                      )
                      : cell.label !== "assigned"
                        ? <span className="cell-badge">{LABEL_DISPLAY[cell.label]}</span>
                        : null}
                  </td>
                );
              })}
            </tr>
          ))}
          {visibleRows.length === 0 && (
            <tr>
              <td colSpan={data.weeks.length + 1} className="kalender-empty">Keine LKW gefunden.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── AssignModal ────────────────────────────────────────────────────────────────

interface AssignTarget {
  lkwId: string;
  lkwNumber: string;
  date: string;
  currentDriverId: string | null;
  currentDriverName: string | null;
  isWebAssigned: boolean;
}

interface AssignModalProps {
  target: AssignTarget;
  apiBase: string;
  onClose: () => void;
  onSaved: () => void;
}

function AssignModal({ target, apiBase, onClose, onSaved }: AssignModalProps) {
  const [drivers, setDrivers] = useState<AvailableDriver[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [selectedDriverId, setSelectedDriverId] = useState<string>(target.currentDriverId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(
          `${apiBase}/api/kalender/available-drivers?date=${target.date}&lkwId=${target.lkwId}`,
          { credentials: "include" },
        );
        const json = await res.json() as { ok: boolean; drivers: AvailableDriver[] };
        setDrivers(json.drivers ?? []);
      } catch {
        setError("Fahrerliste konnte nicht geladen werden");
      } finally {
        setLoadingDrivers(false);
      }
    })();
  }, [apiBase, target.date, target.lkwId]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/kalender/assign`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lkwId: target.lkwId,
          driverId: selectedDriverId || null,
          date: target.date,
        }),
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Fehler beim Speichern");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const clearAssignment = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/api/kalender/assign?lkwId=${target.lkwId}&date=${target.date}`,
        { method: "DELETE", credentials: "include" },
      );
      const json = await res.json() as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Fehler beim Löschen");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const freeDrivers = drivers.filter((d) => !d.blocked && !d.unavailableStatus);
  const blockedDrivers = drivers.filter((d) => d.blocked || d.unavailableStatus);

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div className="modal-header">
          <strong>Zuweisung: {target.lkwNumber}</strong>
          <span className="modal-date">{target.date}</span>
          <button type="button" className="modal-close secondary-button" onClick={onClose}>✕</button>
        </div>

        {target.currentDriverName && (
          <div className="modal-current">
            Aktuell: <strong>{target.currentDriverName}</strong>
            {target.isWebAssigned && <span className="web-badge">Web</span>}
          </div>
        )}

        {error && <div className="modal-error">{error}</div>}

        {loadingDrivers ? (
          <div className="modal-loading">Lade Fahrer…</div>
        ) : (
          <div className="modal-driver-select">
            <label className="modal-label">
              Fahrer auswählen
              <select
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                disabled={saving}
              >
                <option value="">— Kein Fahrer —</option>
                {freeDrivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.fullName}</option>
                ))}
                {blockedDrivers.length > 0 && (
                  <optgroup label="Nicht verfügbar">
                    {blockedDrivers.map((d) => (
                      <option key={d.id} value={d.id} disabled>
                        {d.fullName} {d.unavailableStatus === "VACATION" ? "(U)" : d.unavailableStatus === "SICK" ? "(K)" : "(belegt)"}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" onClick={save} disabled={saving || loadingDrivers}>
            {saving ? "Speichere…" : "Speichern"}
          </button>
          {target.isWebAssigned && (
            <button type="button" className="secondary-button" onClick={clearAssignment} disabled={saving}>
              Zuweisung löschen
            </button>
          )}
          <button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

// ── WeekStatsPanel ─────────────────────────────────────────────────────────────

function StatCard({ label, value, color, title }: { label: string; value: number | string; color?: string; title?: string }) {
  return (
    <div className="stat-card" title={title}>
      <div className="stat-card-value" style={color ? { color } : undefined}>{value}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}

function DriverList({ drivers, title, color }: { drivers: DriverEntry[]; title: string; color: string }) {
  const [expanded, setExpanded] = useState(false);
  if (drivers.length === 0) return null;
  const shown = expanded ? drivers : drivers.slice(0, 3);
  return (
    <div className="driver-list-block">
      <div className="driver-list-title" style={{ color }}>{title} ({drivers.length})</div>
      <div className="driver-list-names">
        {shown.map((d) => (
          <span key={d.id} className="driver-chip">{d.fullName}</span>
        ))}
        {drivers.length > 3 && (
          <button type="button" className="driver-list-toggle" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "weniger" : `+${drivers.length - 3} mehr`}
          </button>
        )}
      </div>
    </div>
  );
}

function WeekStatsPanel({ stats }: { stats: WeekStats }) {
  const { lkw, drivers } = stats;
  return (
    <div className="week-stats-panel">
      <div className="week-stats-section">
        <div className="week-stats-section-title">LKW</div>
        <div className="week-stats-cards">
          <StatCard label="Auslastung Ø" value={`${lkw.avgUtilizationPercent}%`} color="#166534" />
          <StatCard label="Mit Fahrer" value={lkw.assigned} color="#166534" />
          <StatCard label="Ohne Fahrer" value={lkw.noDriver} color="#9F1239" />
          {lkw.workshop > 0 && <StatCard label="Werkstatt" value={lkw.workshop} color="#7C2D12" />}
          {lkw.reserve > 0 && <StatCard label="Reserve" value={lkw.reserve} color="#4C1D95" />}
          {(lkw.sold + lkw.returned) > 0 && (
            <StatCard label="Verkauft/Rückgabe" value={lkw.sold + lkw.returned} color="#374151" />
          )}
          <StatCard label="Gesamt" value={lkw.total} />
        </div>
      </div>

      <div className="week-stats-divider" />

      <div className="week-stats-section">
        <div className="week-stats-section-title">Fahrer</div>
        <div className="week-stats-cards">
          <StatCard label="Arbeiten" value={drivers.working} color="#166534" />
          <StatCard label="Frei" value={drivers.free} color="#92400E" />
          {drivers.vacation > 0 && <StatCard label="Urlaub (U)" value={drivers.vacation} color="#713F12" />}
          {drivers.sick > 0 && <StatCard label="Krank (K)" value={drivers.sick} color="#7F1D1D" />}
          <StatCard label="Gesamt aktiv" value={drivers.totalActive} />
        </div>
        <div className="week-stats-lists">
          <DriverList drivers={drivers.vacationList} title="Urlaub" color="#713F12" />
          <DriverList drivers={drivers.sickList} title="Krank" color="#7F1D1D" />
          <DriverList drivers={drivers.freeList} title="Frei (nicht zugeteilt)" color="#92400E" />
        </div>
      </div>
    </div>
  );
}

// ── component ──────────────────────────────────────────────────────────────────

interface KalenderViewProps {
  apiBase: string;
  canEdit?: boolean;
}

export function KalenderView({ apiBase, canEdit = false }: KalenderViewProps) {
  const [viewMode, setViewMode] = useState<KalenderViewMode>("week");
  const [isoWeek, setIsoWeek] = useState<string>(currentIsoWeek);
  const [multiStart, setMultiStart] = useState<string>(currentIsoWeek);
  const [data, setData] = useState<KalenderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lkwFilter, setLkwFilter] = useState("");
  const [showSold, setShowSold] = useState(false);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);

  const loadWeek = useCallback(
    async (week: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/api/kalender/week?isoWeek=${week}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        }
        const json = await res.json() as KalenderData;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [apiBase],
  );

  useEffect(() => {
    void loadWeek(isoWeek);
  }, [isoWeek, loadWeek]);

  const goToPrev = () => setIsoWeek((w) => prevIsoWeek(w));
  const goToNext = () => setIsoWeek((w) => nextIsoWeek(w));
  const goToToday = () => setIsoWeek(currentIsoWeek());

  const visibleRows = data?.lkwRows.filter((row) => {
    const matchFilter = lkwFilter.trim() === "" || row.lkwNumber.toLowerCase().includes(lkwFilter.toLowerCase());
    const allSold = row.cells.every((c) => c.label === "sold" || c.label === "returned" || c.label === "inactive");
    return matchFilter && (showSold || !allSold);
  }) ?? [];

  const days = data?.days ?? [];
  const dayStats = data?.stats.dayStats ?? [];

  const weekYear = data ? `KW ${data.week} / ${data.year}` : `KW ${isoWeek.slice(4)} / ${isoWeek.slice(0, 4)}`;

  const multiWeekCount = 8;

  return (
    <div className="kalender-wrap">
      {/* ── toolbar ── */}
      <div className="kalender-toolbar">
        <div className="kalender-nav">
          {viewMode === "week" ? (
            <>
              <button type="button" className="secondary-button" onClick={goToPrev} disabled={loading}>‹</button>
              <span className="kalender-week-label">{weekYear}</span>
              <button type="button" className="secondary-button" onClick={goToNext} disabled={loading}>›</button>
              <button type="button" className="secondary-button" onClick={goToToday} disabled={loading}>Heute</button>
            </>
          ) : (
            <>
              <button type="button" className="secondary-button" onClick={() => setMultiStart((w) => prevIsoWeek(prevIsoWeek(prevIsoWeek(prevIsoWeek(w)))))}>‹‹</button>
              <span className="kalender-week-label">KW {multiStart.slice(4)} – KW {String(parseInt(multiStart.slice(4)) + multiWeekCount - 1).padStart(2, "0")} / {multiStart.slice(0, 4)}</span>
              <button type="button" className="secondary-button" onClick={() => setMultiStart((w) => nextIsoWeek(nextIsoWeek(nextIsoWeek(nextIsoWeek(w)))))}>››</button>
              <button type="button" className="secondary-button" onClick={() => setMultiStart(currentIsoWeek())}>Heute</button>
            </>
          )}
          <div className="view-mode-switch">
            <button
              type="button"
              className={viewMode === "week" ? "" : "secondary-button"}
              onClick={() => setViewMode("week")}
            >Woche</button>
            <button
              type="button"
              className={viewMode === "multi" ? "" : "secondary-button"}
              onClick={() => setViewMode("multi")}
            >Übersicht</button>
          </div>
        </div>
        <div className="kalender-controls">
          <input
            className="kalender-filter"
            placeholder="LKW filtern…"
            value={lkwFilter}
            onChange={(e) => setLkwFilter(e.target.value)}
          />
          <label className="kalender-toggle">
            <input type="checkbox" checked={showSold} onChange={(e) => setShowSold(e.target.checked)} />
            Verkauft/Rückgabe anzeigen
          </label>
          <button type="button" className="secondary-button" onClick={() => void loadWeek(isoWeek)} disabled={loading}>
            {loading ? "…" : "↺"}
          </button>
          {viewMode === "week" && (
            <a
              className="secondary-button kalender-export-btn"
              href={`${apiBase}/api/kalender/export?isoWeek=${isoWeek}`}
              download
            >
              ↓ Excel
            </a>
          )}
        </div>
      </div>

      {/* ── week stats ── */}
      {data?.stats.weekStats && <WeekStatsPanel stats={data.stats.weekStats} />}

      {/* ── legend ── */}
      <div className="kalender-legend">
        {LEGEND.map(({ label, text }) => (
          <span key={label} className="legend-chip" style={{ background: LABEL_COLORS[label], color: label === "sold" ? "#fff" : "#111" }}>
            {text}
          </span>
        ))}
      </div>

      {/* ── error ── */}
      {viewMode === "week" && error && <div className="kalender-error">Fehler: {error}</div>}

      {/* ── multi-week overview ── */}
      {viewMode === "multi" && (
        <MultiWeekGrid
          apiBase={apiBase}
          startIsoWeek={multiStart}
          lkwFilter={lkwFilter}
          showSold={showSold}
          onWeekClick={(w) => { setIsoWeek(w); setViewMode("week"); }}
        />
      )}

      {/* ── week grid ── */}
      {viewMode === "week" && !error && (
        <div className="kalender-table-wrap">
          <table className="kalender-table">
            <thead>
              <tr>
                <th className="kalender-th-lkw">LKW</th>
                {days.map((day, i) => (
                  <th key={day} className="kalender-th-day">
                    <div>{DAY_NAMES_SHORT[i]}</div>
                    <div className="kalender-th-date">{formatDate(day)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && !data && (
                <tr>
                  <td colSpan={8} className="kalender-loading">Lädt…</td>
                </tr>
              )}
              {visibleRows.map((row) => (
                <tr key={row.lkwId}>
                  <td className="kalender-td-lkw" title={row.company ?? undefined}>
                    <div>{row.lkwNumber}</div>
                    {row.drucker && <div className="lkw-drucker">{row.drucker}</div>}
                  </td>
                  {row.cells.map((cell) => {
                    const badge = LABEL_DISPLAY[cell.label];
                    const textColor = cell.label === "sold" ? "#f3f4f6" : "#111827";
                    const clickable = canEdit && cell.label !== "sold" && cell.label !== "returned" && cell.label !== "inactive";
                    return (
                      <td
                        key={cell.date}
                        className={`kalender-cell${clickable ? " kalender-cell-editable" : ""}${cell.isWebAssigned ? " kalender-cell-web" : ""}`}
                        style={{ background: cell.color, color: textColor }}
                        title={cell.driverName ? `${cell.driverName}${cell.isWebAssigned ? " (Web)" : ""}${cell.isTransfer ? " ↔" : ""}` : cell.label}
                        onClick={clickable ? () => setAssignTarget({
                          lkwId: row.lkwId,
                          lkwNumber: row.lkwNumber,
                          date: cell.date,
                          currentDriverId: cell.driverId,
                          currentDriverName: cell.driverName,
                          isWebAssigned: cell.isWebAssigned,
                        }) : undefined}
                      >
                        {cell.driverName
                          ? <span className="cell-driver">{cell.driverName}{cell.isWebAssigned ? <sup className="web-dot">●</sup> : null}{cell.isTransfer ? <sup className="transfer-dot"> ↔</sup> : null}</span>
                          : badge
                            ? <span className="cell-badge">{badge}</span>
                            : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!loading && visibleRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="kalender-empty">Keine LKW gefunden.</td>
                </tr>
              )}
            </tbody>
            {/* ── stats row ── */}
            {dayStats.length > 0 && (
              <tfoot>
                <tr className="kalender-stats-row">
                  <td className="kalender-td-lkw">Auslastung</td>
                  {dayStats.map((s) => (
                    <td key={s.date} className="kalender-cell kalender-stat-cell">
                      <div className="stat-pct">{s.utilizationPercent}%</div>
                      <div className="stat-sub">{s.assignedLkw}/{s.totalActiveLkw}</div>
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* ── assignment modal ── */}
      {assignTarget && (
        <AssignModal
          target={assignTarget}
          apiBase={apiBase}
          onClose={() => setAssignTarget(null)}
          onSaved={() => void loadWeek(isoWeek)}
        />
      )}
    </div>
  );
}
