"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

type User = {
  id: string;
  email: string;
  displayName: string;
  role: string;
};

type MetricCounters = {
  ordersToday: number;
  assignedLkw: number;
  freeLkw: number;
  openOrders: number;
  problemOrders: number;
  lkwUsagePercent: number;
};

type PlanningRow = {
  id: string;
  runde: number;
  status: string;
  problemReason: string | null;
  lkw: {
    id: string;
    number: string;
    status: string;
    type: string | null;
    company: string | null;
  } | null;
  driver: {
    id: string;
    fullName: string;
    status: string;
    availability: Array<{ status: string; rawStatus: string | null; source: string }>;
  } | null;
  chassis: {
    number: string;
    status: string;
  } | null;
  order: {
    id: string;
    description: string;
    customer: string | null;
    plz: string | null;
    city: string | null;
    country: string | null;
    plannedTime: string | null;
    info: string | null;
    status: string;
    problemReason: string | null;
  };
};

type PlanningDayResponse = {
  ok: true;
  date: string;
  counters: MetricCounters;
  holidays: Array<{
    date: string;
    name: string;
    region: string;
    isNational: boolean;
  }>;
  rows: PlanningRow[];
  unassignedOrders: Array<{
    id: string;
    runde: number;
    description: string;
    customer: string | null;
    plz: string | null;
    city: string | null;
    country: string | null;
    plannedTime: string | null;
    info: string | null;
    status: string;
    problemReason: string | null;
  }>;
};

type LkwItem = {
  id: string;
  externalId: string | null;
  number: string;
  type: string | null;
  status: string;
  rawStatus: string | null;
  soldDate: string | null;
  returnedDate: string | null;
  isActive: boolean;
  company: { name: string } | null;
};

type DriverItem = {
  id: string;
  externalId: string | null;
  fullName: string;
  surname: string | null;
  phone: string | null;
  status: string;
  rawStatus: string | null;
  dismissedDate: string | null;
  isActive: boolean;
  company: { name: string } | null;
};

type AuditItem = {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  orderId: string | null;
  order: {
    id: string;
    planningDate: string;
    runde: number;
    description: string;
    status: string;
  } | null;
  message: string | null;
  createdAt: string;
  user: {
    displayName: string;
    email: string;
    role: string;
  } | null;
};

type EditableOrderRow = {
  orderId: string;
  runde: number;
  description: string;
  customer: string;
  plz: string;
  cityName: string;
  country: string;
  plannedTime: string;
  info: string;
  lkwId: string;
  driverId: string;
};

type ManagedUser = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ImportAction = {
  key: string;
  title: string;
  previewPath: string;
  executePath: string;
};

type ImportResult = {
  ok?: boolean;
  source?: string;
  scope?: Record<string, unknown>;
  counts?: Record<string, unknown>;
  applied?: Record<string, unknown>;
  issues?: unknown[];
  error?: string;
};

type OrderDraft = {
  runde: string;
  description: string;
  customer: string;
  plz: string;
  city: string;
  country: string;
  plannedTime: string;
  info: string;
};

const importActions: ImportAction[] = [
  {
    key: "master",
    title: "Master data",
    previewPath: "/api/imports/reporting-master-data/preview",
    executePath: "/api/imports/reporting-master-data/execute",
  },
  {
    key: "schedules",
    title: "Weekly schedules",
    previewPath: "/api/imports/reporting-schedules/preview",
    executePath: "/api/imports/reporting-schedules/execute",
  },
  {
    key: "availability",
    title: "Driver availability",
    previewPath: "/api/imports/reporting-driver-availability/preview",
    executePath: "/api/imports/reporting-driver-availability/execute",
  },
];

type ViewMode = "lkw-first" | "orders-first";
type AppSection = "dashboard" | "planning" | "imports" | "lkw" | "drivers" | "audit" | "users";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function hasManagerAccess(role: string): boolean {
  return ["ADMIN", "MANAGER"].includes(role);
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || "Request failed");
  }
  return data as T;
}

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedDate, setSelectedDate] = useState("2026-05-04");
  const [planning, setPlanning] = useState<PlanningDayResponse | null>(null);
  const [lkw, setLkw] = useState<LkwItem[]>([]);
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [importResults, setImportResults] = useState<Record<string, ImportResult>>({});
  const [importBusy, setImportBusy] = useState<string | null>(null);
  const [userBusy, setUserBusy] = useState<string | null>(null);
  const [orderBusy, setOrderBusy] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("VIEWER");
  const [newOrderRunde, setNewOrderRunde] = useState("1");
  const [newOrderDescription, setNewOrderDescription] = useState("");
  const [newOrderCustomer, setNewOrderCustomer] = useState("");
  const [newOrderPlz, setNewOrderPlz] = useState("");
  const [newOrderCity, setNewOrderCity] = useState("");
  const [newOrderCountry, setNewOrderCountry] = useState("");
  const [newOrderTime, setNewOrderTime] = useState("");
  const [newOrderInfo, setNewOrderInfo] = useState("");
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, { lkwId: string; driverId: string }>>({});
  const [orderDrafts, setOrderDrafts] = useState<Record<string, OrderDraft>>({});
  const [lkwFilter, setLkwFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [rundeFilter, setRundeFilter] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("lkw-first");
  const [activeSection, setActiveSection] = useState<AppSection>("planning");
  const [lkwManagementFilter, setLkwManagementFilter] = useState("");
  const [driverManagementFilter, setDriverManagementFilter] = useState("");
  const [auditFilter, setAuditFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ ok: true; user: User }>("/api/auth/me")
      .then((result) => setUser(result.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadDashboardData(selectedDate);
  }, [user, selectedDate]);

  const metrics = useMemo(() => {
    const counters = planning?.counters || {
      ordersToday: 0,
      assignedLkw: 0,
      freeLkw: 0,
      openOrders: 0,
      problemOrders: 0,
      lkwUsagePercent: 0,
    };

    return [
      ["Orders today", String(counters.ordersToday)],
      ["Assigned LKW", String(counters.assignedLkw)],
      ["Free LKW", String(counters.freeLkw)],
      ["Open orders", String(counters.openOrders)],
      ["LKW usage", `${counters.lkwUsagePercent}%`],
      ["Problems", String(counters.problemOrders)],
    ];
  }, [planning]);

  const filteredRows = useMemo(() => {
    return (planning?.rows || []).filter((row) => {
      const lkwMatch = !lkwFilter || row.lkw?.number.toLowerCase().includes(lkwFilter.toLowerCase());
      const driverMatch = !driverFilter || row.driver?.fullName.toLowerCase().includes(driverFilter.toLowerCase());
      const statusValue = row.order.status || row.status;
      const statusMatch = !statusFilter || statusValue === statusFilter;
      const rundeMatch = !rundeFilter || String(row.runde) === rundeFilter;
      return lkwMatch && driverMatch && statusMatch && rundeMatch;
    });
  }, [planning, lkwFilter, driverFilter, statusFilter, rundeFilter]);

  const activeRows = useMemo(() => (
    filteredRows.filter((row) => (row.order.status || row.status) !== "DONE")
  ), [filteredRows]);

  const assignedRows = useMemo(() => (
    filteredRows.filter((row) => (row.order.status || row.status) === "DONE")
  ), [filteredRows]);

  const ordersFirstRows = useMemo(() => {
    const assigned = (planning?.rows || []).map((row) => ({
      key: row.id,
      orderId: row.order.id,
      runde: row.runde,
      description: row.order.description,
      customer: row.order.customer || "",
      plz: row.order.plz || "",
      cityName: row.order.city || "",
      country: row.order.country || "",
      plannedTime: row.order.plannedTime || "",
      info: row.order.info || "",
      lkwId: row.lkw?.id || "",
      lkw: row.lkw?.number || "-",
      driverId: row.driver?.id || "",
      driver: row.driver?.fullName || "-",
      city: [row.order.plz, row.order.city, row.order.country].filter(Boolean).join(" ") || "-",
      time: row.order.plannedTime || "-",
      status: row.order.status || row.status,
      problemReason: row.order.problemReason || row.problemReason,
    }));
    const unassigned = (planning?.unassignedOrders || []).map((order) => ({
      key: order.id,
      orderId: order.id,
      runde: order.runde,
      description: order.description,
      customer: order.customer || "",
      plz: order.plz || "",
      cityName: order.city || "",
      country: order.country || "",
      plannedTime: order.plannedTime || "",
      info: order.info || "",
      lkwId: "",
      lkw: "-",
      driverId: "",
      driver: "-",
      city: [order.plz, order.city, order.country].filter(Boolean).join(" ") || "-",
      time: order.plannedTime || "-",
      status: order.status,
      problemReason: order.problemReason,
    }));

    return [...assigned, ...unassigned]
      .filter((row) => {
        const lkwMatch = !lkwFilter || row.lkw.toLowerCase().includes(lkwFilter.toLowerCase());
        const driverMatch = !driverFilter || row.driver.toLowerCase().includes(driverFilter.toLowerCase());
        const statusMatch = !statusFilter || row.status === statusFilter;
        const rundeMatch = !rundeFilter || String(row.runde) === rundeFilter;
        return lkwMatch && driverMatch && statusMatch && rundeMatch;
      })
      .sort((a, b) => a.runde - b.runde || a.description.localeCompare(b.description));
  }, [planning, lkwFilter, driverFilter, statusFilter, rundeFilter]);

  const planningLkw = useMemo(() => (
    lkw.filter((item) => item.isActive && !["INACTIVE", "SOLD", "RETURNED"].includes(item.status))
  ), [lkw]);

  const planningDrivers = useMemo(() => (
    drivers.filter((item) => item.isActive && !["INACTIVE", "DISMISSED"].includes(item.status))
  ), [drivers]);

  const lkwDriverSuggestions = useMemo(() => {
    const suggestions: Record<string, string> = {};
    (planning?.rows || []).forEach((row) => {
      if (row.lkw?.id && row.driver?.id && !suggestions[row.lkw.id]) {
        suggestions[row.lkw.id] = row.driver.id;
      }
    });
    return suggestions;
  }, [planning]);

  const filteredManagementLkw = useMemo(() => {
    const needle = lkwManagementFilter.toLowerCase();
    return lkw.filter((item) => {
      if (!needle) return true;
      return [
        item.externalId,
        item.number,
        item.type,
        item.status,
        item.rawStatus,
        item.company?.name,
      ].some((value) => (value || "").toLowerCase().includes(needle));
    });
  }, [lkw, lkwManagementFilter]);

  const filteredManagementDrivers = useMemo(() => {
    const needle = driverManagementFilter.toLowerCase();
    return drivers.filter((item) => {
      if (!needle) return true;
      return [
        item.externalId,
        item.fullName,
        item.surname,
        item.phone,
        item.status,
        item.rawStatus,
        item.company?.name,
      ].some((value) => (value || "").toLowerCase().includes(needle));
    });
  }, [drivers, driverManagementFilter]);

  const filteredAudit = useMemo(() => {
    const needle = auditFilter.toLowerCase();
    return audit.filter((item) => {
      if (!needle) return true;
      return [
        item.eventType,
        item.entityType,
        item.entityId,
        item.order?.description,
        item.order?.runde ? `Runde ${item.order.runde}` : null,
        item.order?.status,
        item.message,
        item.user?.displayName,
        item.user?.email,
        item.user?.role,
      ].some((value) => (value || "").toLowerCase().includes(needle));
    });
  }, [audit, auditFilter]);

  async function loadDashboardData(date: string): Promise<void> {
    const currentUser = user;
    if (!currentUser) return;

    setError(null);
    setLoading(true);
    try {
      const [planningResult, lkwResult, driversResult, auditResult] = await Promise.all([
        apiFetch<PlanningDayResponse>(`/api/planning/day?date=${date}`),
        apiFetch<{ ok: true; items: LkwItem[] }>("/api/lkw?limit=500"),
        apiFetch<{ ok: true; items: DriverItem[] }>("/api/drivers?limit=500"),
        hasManagerAccess(currentUser.role)
          ? apiFetch<{ ok: true; items: AuditItem[] }>("/api/audit-log?limit=200")
          : Promise.resolve({ ok: true as const, items: [] }),
      ]);
      const usersResult = currentUser.role === "ADMIN"
        ? await apiFetch<{ ok: true; items: ManagedUser[] }>("/api/users")
        : { ok: true as const, items: [] };
      setPlanning(planningResult);
      setLkw(lkwResult.items);
      setDrivers(driversResult.items);
      setAudit(auditResult.items);
      setManagedUsers(usersResult.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<{ ok: true; user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setUser(result.user);
      setPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout(): Promise<void> {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setUser(null);
    setPlanning(null);
  }

  async function runImportAction(action: ImportAction, mode: "preview" | "execute"): Promise<void> {
    setError(null);
    setImportBusy(`${action.key}:${mode}`);
    try {
      const path = mode === "preview" ? action.previewPath : action.executePath;
      const result = await apiFetch<ImportResult>(path, {
        method: mode === "preview" ? "GET" : "POST",
        body: mode === "preview" ? undefined : "{}",
      });
      setImportResults((current) => ({ ...current, [action.key]: result }));
      if (mode === "execute") {
        await loadDashboardData(selectedDate);
      }
    } catch (caught) {
      setImportResults((current) => ({
        ...current,
        [action.key]: { ok: false, error: caught instanceof Error ? caught.message : "Import failed" },
      }));
    } finally {
      setImportBusy(null);
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setUserBusy("create");
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({
          email: newUserEmail,
          displayName: newUserDisplayName,
          password: newUserPassword,
          role: newUserRole,
        }),
      });
      setNewUserEmail("");
      setNewUserDisplayName("");
      setNewUserPassword("");
      setNewUserRole("VIEWER");
      await loadDashboardData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "User create failed");
    } finally {
      setUserBusy(null);
    }
  }

  async function updateManagedUser(id: string, body: Partial<Pick<ManagedUser, "role" | "isActive" | "displayName">>): Promise<void> {
    setError(null);
    setUserBusy(id);
    try {
      await apiFetch(`/api/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await loadDashboardData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "User update failed");
    } finally {
      setUserBusy(null);
    }
  }

  async function createOrder(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setOrderBusy("create");
    try {
      await apiFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          planningDate: selectedDate,
          runde: Number(newOrderRunde),
          description: newOrderDescription,
          customer: newOrderCustomer || null,
          plz: newOrderPlz || null,
          city: newOrderCity || null,
          country: newOrderCountry || null,
          plannedTime: newOrderTime || null,
          info: newOrderInfo || null,
        }),
      });
      setNewOrderDescription("");
      setNewOrderCustomer("");
      setNewOrderPlz("");
      setNewOrderCity("");
      setNewOrderCountry("");
      setNewOrderTime("");
      setNewOrderInfo("");
      await loadDashboardData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Order create failed");
    } finally {
      setOrderBusy(null);
    }
  }

  async function saveAssignment(row: { orderId: string; lkwId: string; driverId: string }): Promise<void> {
    setError(null);
    setOrderBusy(row.orderId);
    const draft = assignmentDrafts[row.orderId] || { lkwId: row.lkwId, driverId: row.driverId };
    try {
      await apiFetch("/api/assignments/upsert", {
        method: "POST",
        body: JSON.stringify({
          orderId: row.orderId,
          lkwId: draft.lkwId || null,
          driverId: draft.driverId || null,
        }),
      });
      await loadDashboardData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Assignment save failed");
    } finally {
      setOrderBusy(null);
    }
  }

  async function saveOrder(row: { orderId: string; runde: number; description: string; customer: string; plz: string; cityName: string; country: string; plannedTime: string; info: string }): Promise<void> {
    setError(null);
    setOrderBusy(row.orderId);
    const draft = orderDrafts[row.orderId] || {
      runde: String(row.runde),
      description: row.description,
      customer: row.customer,
      plz: row.plz,
      city: row.cityName,
      country: row.country,
      plannedTime: row.plannedTime,
      info: row.info,
    };
    try {
      await apiFetch(`/api/orders/${row.orderId}`, {
        method: "PATCH",
        body: JSON.stringify({
          runde: Number(draft.runde),
          description: draft.description,
          customer: draft.customer || null,
          plz: draft.plz || null,
          city: draft.city || null,
          country: draft.country || null,
          plannedTime: draft.plannedTime || null,
          info: draft.info || null,
        }),
      });
      await loadDashboardData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Order save failed");
    } finally {
      setOrderBusy(null);
    }
  }

  async function saveOrderAndAssignment(row: EditableOrderRow): Promise<void> {
    setError(null);
    setOrderBusy(row.orderId);
    const orderDraft = orderDrafts[row.orderId] || {
      runde: String(row.runde),
      description: row.description,
      customer: row.customer,
      plz: row.plz,
      city: row.cityName,
      country: row.country,
      plannedTime: row.plannedTime,
      info: row.info,
    };
    const assignmentDraft = assignmentDrafts[row.orderId] || { lkwId: row.lkwId, driverId: row.driverId };
    try {
      await apiFetch(`/api/orders/${row.orderId}`, {
        method: "PATCH",
        body: JSON.stringify({
          runde: Number(orderDraft.runde),
          description: orderDraft.description,
          customer: orderDraft.customer || null,
          plz: orderDraft.plz || null,
          city: orderDraft.city || null,
          country: orderDraft.country || null,
          plannedTime: orderDraft.plannedTime || null,
          info: orderDraft.info || null,
        }),
      });
      if (row.lkwId || row.driverId || assignmentDraft.lkwId || assignmentDraft.driverId) {
        await apiFetch("/api/assignments/upsert", {
          method: "POST",
          body: JSON.stringify({
            orderId: row.orderId,
            lkwId: assignmentDraft.lkwId || null,
            driverId: assignmentDraft.driverId || null,
          }),
        });
      }
      await loadDashboardData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Order save failed");
    } finally {
      setOrderBusy(null);
    }
  }

  async function setOrderStatus(orderId: string, status: "DONE" | "PLANNED" | "CANCELLED"): Promise<void> {
    setError(null);
    setOrderBusy(orderId);
    try {
      if (status === "CANCELLED") {
        await apiFetch(`/api/orders/${orderId}/cancel`, { method: "POST", body: "{}" });
      } else {
        await apiFetch(`/api/orders/${orderId}`, { method: "PATCH", body: JSON.stringify({ status }) });
      }
      await loadDashboardData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Order status update failed");
    } finally {
      setOrderBusy(null);
    }
  }

  async function deleteOrder(orderId: string): Promise<void> {
    setError(null);
    setOrderBusy(orderId);
    try {
      await apiFetch(`/api/orders/${orderId}`, { method: "DELETE" });
      await loadDashboardData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Order delete failed");
    } finally {
      setOrderBusy(null);
    }
  }

  function updateOrderDraft(orderId: string, field: keyof OrderDraft, value: string, row: { runde: number; description: string; customer: string; plz: string; cityName: string; country: string; plannedTime: string; info: string }): void {
    setOrderDrafts((current) => ({
      ...current,
      [orderId]: {
        runde: current[orderId]?.runde ?? String(row.runde),
        description: current[orderId]?.description ?? row.description,
        customer: current[orderId]?.customer ?? row.customer,
        plz: current[orderId]?.plz ?? row.plz,
        city: current[orderId]?.city ?? row.cityName,
        country: current[orderId]?.country ?? row.country,
        plannedTime: current[orderId]?.plannedTime ?? row.plannedTime,
        info: current[orderId]?.info ?? row.info,
        [field]: value,
      },
    }));
  }

  function updateAssignmentDraft(
    orderId: string,
    field: "lkwId" | "driverId",
    value: string,
    base: { lkwId: string; driverId: string; runde: number; orderId: string },
  ): void {
    setAssignmentDrafts((current) => ({
      ...current,
      [orderId]: {
        lkwId: current[orderId]?.lkwId ?? base.lkwId,
        driverId: field === "lkwId"
          ? autoDriverForLkw(value, base.runde, base.orderId, current[orderId]?.driverId ?? base.driverId)
          : current[orderId]?.driverId ?? base.driverId,
        [field]: value,
      },
    }));
  }

  function isLkwAvailableForRunde(lkwId: string, runde: number, orderId: string): boolean {
    return !ordersFirstRows.some((row) => {
      const draft = assignmentDrafts[row.orderId];
      const rowLkwId = draft?.lkwId ?? row.lkwId;
      return row.orderId !== orderId && row.runde === runde && rowLkwId === lkwId;
    });
  }

  function isDriverAvailableForRunde(driverId: string, runde: number, orderId: string): boolean {
    return !ordersFirstRows.some((row) => {
      const draft = assignmentDrafts[row.orderId];
      const rowDriverId = draft?.driverId ?? row.driverId;
      return row.orderId !== orderId && row.runde === runde && rowDriverId === driverId;
    });
  }

  function autoDriverForLkw(lkwId: string, runde: number, orderId: string, currentDriverId: string): string {
    const suggestedDriverId = lkwDriverSuggestions[lkwId];
    if (!suggestedDriverId || currentDriverId) return currentDriverId;
    return isDriverAvailableForRunde(suggestedDriverId, runde, orderId) ? suggestedDriverId : currentDriverId;
  }

  function exportTagesplanung(): void {
    const params = new URLSearchParams({ date: selectedDate });
    if (lkwFilter) params.set("lkw", lkwFilter);
    if (driverFilter) params.set("driver", driverFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (rundeFilter) params.set("runde", rundeFilter);
    window.location.href = `${apiBaseUrl}/api/exports/tagesplanung.xls?${params.toString()}`;
  }

  if (loading && !user) {
    return <main className="shell"><p>Loading...</p></main>;
  }

  if (!user) {
    return (
      <main className="login-shell">
        <form className="login-panel" onSubmit={handleLogin}>
          <div>
            <p className="eyebrow">Internal logistics</p>
            <h1>LKW Planning</h1>
          </div>
          <label>
            Email
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
        </form>
      </main>
    );
  }

  const canEditPlanning = ["ADMIN", "OPERATOR", "MANAGER"].includes(user.role);
  const canViewImports = hasManagerAccess(user.role);
  const canExecuteImports = user.role === "ADMIN";
  const canViewAudit = hasManagerAccess(user.role);
  const visibleSections: Array<{ key: AppSection; label: string }> = [
    { key: "dashboard", label: "Dashboard" },
    { key: "planning", label: "Tagesplanung" },
    ...(canViewImports ? [{ key: "imports" as AppSection, label: "Imports" }] : []),
    { key: "lkw", label: "LKW management" },
    { key: "drivers", label: "Driver management" },
    ...(canViewAudit ? [{ key: "audit" as AppSection, label: "Audit Log" }] : []),
    ...(user.role === "ADMIN" ? [{ key: "users" as AppSection, label: "User management" }] : []),
  ];

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Internal logistics</p>
          <h1>LKW Planning</h1>
        </div>
        <div className="userbar">
          <span>{user.displayName} / {user.role}</span>
          <button type="button" className="secondary-button" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <nav className="app-tabs" aria-label="Application sections">
        {visibleSections.map((section) => (
          <button
            key={section.key}
            type="button"
            className={activeSection === section.key ? "" : "secondary-button"}
            onClick={() => setActiveSection(section.key)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <section className="toolbar">
        <label>
          Planning date
          <input type="date" value={selectedDate || todayDate()} onChange={(event) => setSelectedDate(event.target.value)} />
        </label>
        <button type="button" onClick={() => loadDashboardData(selectedDate)} disabled={loading}>
          Refresh
        </button>
        <button type="button" className="secondary-button" onClick={exportTagesplanung}>
          Export Excel
        </button>
        {error ? <span className="error">{error}</span> : null}
      </section>

      {activeSection === "dashboard" ? (
        <section className="dashboard">
          {metrics.map(([label, value]) => (
            <div className="metric" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </section>
      ) : null}

      {activeSection === "planning" && planning?.holidays?.length ? (
        <section className="warning-banner">
          Holiday warning: {planning.holidays.map((holiday) => `${holiday.name} (${holiday.region})`).join(", ")}
        </section>
      ) : null}

      {activeSection === "planning" ? (
      <section className="filters-panel">
        <label>
          LKW
          <input value={lkwFilter} onChange={(event) => setLkwFilter(event.target.value)} placeholder="GR-OO..." />
        </label>
        <label>
          Driver
          <input value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)} placeholder="Name" />
        </label>
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All</option>
            <option value="OPEN">OPEN</option>
            <option value="PLANNED">PLANNED</option>
            <option value="PROBLEM">PROBLEM</option>
            <option value="DONE">DONE</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </label>
        <label>
          Runde
          <select value={rundeFilter} onChange={(event) => setRundeFilter(event.target.value)}>
            <option value="">All</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </label>
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setLkwFilter("");
            setDriverFilter("");
            setStatusFilter("");
            setRundeFilter("");
          }}
        >
          Clear filters
        </button>
        <span className="muted">
          {viewMode === "lkw-first"
            ? `${filteredRows.length} visible / ${planning?.rows.length || 0} total`
            : `${ordersFirstRows.length} visible / ${(planning?.rows.length || 0) + (planning?.unassignedOrders.length || 0)} total`}
        </span>
      </section>
      ) : null}

      {activeSection === "planning" ? (
      <section className="planner">
        <div className="planner-header">
          <div>
            <h2>Tagesplanung</h2>
            <p>{viewMode === "lkw-first" ? "LKW-first" : "Orders-first"} view for {selectedDate}. Data is read from the isolated planning database.</p>
          </div>
          <div className="mode-switch">
            <button
              type="button"
              className={viewMode === "lkw-first" ? "" : "secondary-button"}
              onClick={() => setViewMode("lkw-first")}
            >
              LKW-first
            </button>
            <button
              type="button"
              className={viewMode === "orders-first" ? "" : "secondary-button"}
              onClick={() => setViewMode("orders-first")}
            >
              Orders-first
            </button>
          </div>
        </div>

        {canEditPlanning ? (
          <form className="order-create-form" onSubmit={createOrder}>
            <select value={newOrderRunde} onChange={(event) => setNewOrderRunde(event.target.value)}>
              <option value="1">Runde 1</option>
              <option value="2">Runde 2</option>
              <option value="3">Runde 3</option>
            </select>
            <input value={newOrderDescription} onChange={(event) => setNewOrderDescription(event.target.value)} placeholder="Auftrag" required />
            <input value={newOrderCustomer} onChange={(event) => setNewOrderCustomer(event.target.value)} placeholder="Customer" />
            <input value={newOrderPlz} onChange={(event) => setNewOrderPlz(event.target.value)} placeholder="PLZ" />
            <input value={newOrderCity} onChange={(event) => setNewOrderCity(event.target.value)} placeholder="City" />
            <input value={newOrderCountry} onChange={(event) => setNewOrderCountry(event.target.value)} placeholder="Country" />
            <input value={newOrderTime} onChange={(event) => setNewOrderTime(event.target.value)} placeholder="Time" />
            <input value={newOrderInfo} onChange={(event) => setNewOrderInfo(event.target.value)} placeholder="Info" />
            <button type="submit" disabled={Boolean(orderBusy)}>Create order</button>
          </form>
        ) : null}

        <div className="table-wrap">
          {viewMode === "lkw-first" ? (
            <div className="lkw-first-tables">
              <table className="lkw-first-table">
                <thead>
                  <tr>
                    <th>LKW</th>
                    <th>LKW status</th>
                    <th>Driver</th>
                    <th>Driver check</th>
                    <th>Chassis</th>
                    <th>Runde</th>
                    <th>Auftrag</th>
                    <th>City</th>
                    <th>Status</th>
                    <th>Info</th>
                    {canEditPlanning ? <th>Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {activeRows.map((row) => (
                    <tr key={row.id} className={row.status === "PROBLEM" || row.order.status === "PROBLEM" ? "problem-row" : ""}>
                      <td>{row.lkw?.number || "-"}</td>
                      <td>{row.lkw?.status || "-"}</td>
                      <td>{row.driver?.fullName || "-"}</td>
                      <td>{row.driver?.availability?.[0]?.status || "OK"}</td>
                      <td>{row.chassis?.number || "-"}</td>
                      <td>{row.runde}</td>
                      <td>{row.order.description}</td>
                      <td>{[row.order.plz, row.order.city, row.order.country].filter(Boolean).join(" ") || "-"}</td>
                      <td>
                        <span className={`status status-${(row.order.status || row.status).toLowerCase()}`}>
                          {row.order.status || row.status}
                        </span>
                      </td>
                      <td>{row.order.problemReason || row.problemReason || row.order.info || "-"}</td>
                      {canEditPlanning ? (
                        <td className="single-action-cell">
                          <button type="button" onClick={() => setOrderStatus(row.order.id, "DONE")} disabled={Boolean(orderBusy)}>
                            Mark assigned
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  {planning && activeRows.length === 0 ? (
                    <tr>
                      <td colSpan={canEditPlanning ? 11 : 10}>No active planning rows match the current filters.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              {assignedRows.length > 0 ? (
                <div className="assigned-orders-block">
                  <div className="panel-header">
                    <h3>Assigned orders</h3>
                    <span className="muted">{assignedRows.length}</span>
                  </div>
                  <table className="lkw-first-table">
                    <thead>
                      <tr>
                        <th>LKW</th>
                        <th>LKW status</th>
                        <th>Driver</th>
                        <th>Driver check</th>
                        <th>Chassis</th>
                        <th>Runde</th>
                        <th>Auftrag</th>
                        <th>City</th>
                    <th>Status</th>
                    <th>Info</th>
                    {canEditPlanning ? <th>Action</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {assignedRows.map((row) => (
                        <tr key={row.id}>
                          <td>{row.lkw?.number || "-"}</td>
                          <td>{row.lkw?.status || "-"}</td>
                          <td>{row.driver?.fullName || "-"}</td>
                          <td>{row.driver?.availability?.[0]?.status || "OK"}</td>
                          <td>{row.chassis?.number || "-"}</td>
                          <td>{row.runde}</td>
                          <td>{row.order.description}</td>
                          <td>{[row.order.plz, row.order.city, row.order.country].filter(Boolean).join(" ") || "-"}</td>
                          <td>
                            <span className={`status status-${(row.order.status || row.status).toLowerCase()}`}>
                              {row.order.status || row.status}
                            </span>
                          </td>
                          <td>{row.order.problemReason || row.problemReason || row.order.info || "-"}</td>
                          {canEditPlanning ? (
                            <td className="single-action-cell">
                              <button type="button" className="secondary-button" onClick={() => setOrderStatus(row.order.id, "PLANNED")} disabled={Boolean(orderBusy)}>
                                Return active
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : (
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Runde</th>
                  <th>Auftrag</th>
                  <th>LKW</th>
                  <th>Driver</th>
                  <th>Customer</th>
                  <th>City</th>
                  <th>Time</th>
                  <th>Info</th>
                  <th>Status</th>
                  <th>Problem</th>
                  {canEditPlanning ? <th>Action</th> : null}
                </tr>
              </thead>
              <tbody>
                {ordersFirstRows.map((row) => {
                  const draft = assignmentDrafts[row.orderId] || { lkwId: row.lkwId, driverId: row.driverId };
                  const orderDraft = orderDrafts[row.orderId] || {
                    runde: String(row.runde),
                    description: row.description,
                    customer: row.customer,
                    plz: row.plz,
                    city: row.cityName,
                    country: row.country,
                    plannedTime: row.plannedTime,
                    info: row.info,
                  };
                  const effectiveRunde = Number(orderDraft.runde || row.runde);
                  return (
                    <tr key={row.key} className={row.status === "PROBLEM" ? "problem-row" : ""}>
                      <td>
                        {canEditPlanning ? (
                          <select value={orderDraft.runde} onChange={(event) => updateOrderDraft(row.orderId, "runde", event.target.value, row)}>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                          </select>
                        ) : row.runde}
                      </td>
                      <td>
                        {canEditPlanning ? (
                          <input value={orderDraft.description} onChange={(event) => updateOrderDraft(row.orderId, "description", event.target.value, row)} />
                        ) : row.description}
                      </td>
                      <td>
                        {canEditPlanning ? (
                          <select value={draft.lkwId} onChange={(event) => updateAssignmentDraft(row.orderId, "lkwId", event.target.value, { ...row, runde: effectiveRunde })}>
                            <option value="">-</option>
                            {planningLkw.filter((item) => item.id === draft.lkwId || isLkwAvailableForRunde(item.id, effectiveRunde, row.orderId)).map((item) => (
                              <option value={item.id} key={item.id}>{item.number}</option>
                            ))}
                          </select>
                        ) : row.lkw}
                      </td>
                      <td>
                        {canEditPlanning ? (
                          <select value={draft.driverId} onChange={(event) => updateAssignmentDraft(row.orderId, "driverId", event.target.value, { ...row, runde: effectiveRunde })}>
                            <option value="">-</option>
                            {planningDrivers.filter((item) => item.id === draft.driverId || isDriverAvailableForRunde(item.id, effectiveRunde, row.orderId)).map((item) => (
                              <option value={item.id} key={item.id}>{item.fullName}</option>
                            ))}
                          </select>
                        ) : row.driver}
                      </td>
                      <td>
                        {canEditPlanning ? (
                          <input value={orderDraft.customer} onChange={(event) => updateOrderDraft(row.orderId, "customer", event.target.value, row)} />
                        ) : row.customer || "-"}
                      </td>
                      <td>
                        {canEditPlanning ? (
                          <div className="city-edit">
                            <input value={orderDraft.plz} onChange={(event) => updateOrderDraft(row.orderId, "plz", event.target.value, row)} placeholder="PLZ" />
                            <input value={orderDraft.city} onChange={(event) => updateOrderDraft(row.orderId, "city", event.target.value, row)} placeholder="City" />
                            <input value={orderDraft.country} onChange={(event) => updateOrderDraft(row.orderId, "country", event.target.value, row)} placeholder="Country" />
                          </div>
                        ) : row.city}
                      </td>
                      <td>
                        {canEditPlanning ? (
                          <input className="time-input" value={orderDraft.plannedTime} onChange={(event) => updateOrderDraft(row.orderId, "plannedTime", event.target.value, row)} />
                        ) : row.time}
                      </td>
                      <td>
                        {canEditPlanning ? (
                          <input value={orderDraft.info} onChange={(event) => updateOrderDraft(row.orderId, "info", event.target.value, row)} />
                        ) : row.info || "-"}
                      </td>
                      <td>
                        <span className={`status status-${row.status.toLowerCase()}`}>
                          {row.status}
                        </span>
                      </td>
                      <td>{row.problemReason || "-"}</td>
                      {canEditPlanning ? (
                        <td className="action-cell">
                          <button type="button" onClick={() => saveOrderAndAssignment(row)} disabled={Boolean(orderBusy)}>
                            Save
                          </button>
                          <button type="button" className="danger-button" onClick={() => deleteOrder(row.orderId)} disabled={Boolean(orderBusy)}>
                            Delete
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
                {planning && ordersFirstRows.length === 0 ? (
                  <tr>
                    <td colSpan={canEditPlanning ? 11 : 10}>No orders match the current filters.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </div>
      </section>
      ) : null}

      {activeSection === "imports" ? (
        <section className="section-grid">
        <div className="list-panel imports-panel">
          <h2>Imports</h2>
          <div className="imports-grid">
            {importActions.map((action) => {
              const result = importResults[action.key];
              return (
                <div className="import-card" key={action.key}>
                  <div>
                    <strong>{action.title}</strong>
                    <span>Reporting DB source</span>
                  </div>
                  <div className="import-buttons">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={Boolean(importBusy)}
                      onClick={() => runImportAction(action, "preview")}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(importBusy) || !canExecuteImports}
                      title={canExecuteImports ? "Execute import" : "Only Admin can execute imports"}
                      onClick={() => runImportAction(action, "execute")}
                    >
                      Execute
                    </button>
                  </div>
                  {result ? (
                    <pre className={result.ok === false ? "import-result import-error" : "import-result"}>
                      {JSON.stringify({
                        ok: result.ok,
                        scope: result.scope,
                        counts: result.counts,
                        applied: result.applied,
                        issues: result.issues?.length,
                        error: result.error,
                      }, null, 2)}
                    </pre>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
        </section>
      ) : null}

      {activeSection === "lkw" ? (
        <section className="section-grid">
        <div className="list-panel management-panel">
          <div className="panel-header">
            <h2>LKW management</h2>
            <span className="muted">{filteredManagementLkw.length} / {lkw.length}</span>
          </div>
          <input
            value={lkwManagementFilter}
            onChange={(event) => setLkwManagementFilter(event.target.value)}
            placeholder="Search LKW, status, company"
          />
          <div className="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>LKW</th>
                  <th>Type</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Sold</th>
                  <th>Returned</th>
                </tr>
              </thead>
              <tbody>
                {filteredManagementLkw.map((item) => (
                  <tr key={item.id}>
                    <td>{item.externalId || "-"}</td>
                    <td>{item.number}</td>
                    <td>{item.type || "-"}</td>
                    <td>{item.company?.name || "-"}</td>
                    <td>{item.status}</td>
                    <td>{item.soldDate ? item.soldDate.slice(0, 10) : "-"}</td>
                    <td>{item.returnedDate ? item.returnedDate.slice(0, 10) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </section>
      ) : null}

      {activeSection === "drivers" ? (
        <section className="section-grid">
        <div className="list-panel management-panel">
          <div className="panel-header">
            <h2>Driver management</h2>
            <span className="muted">{filteredManagementDrivers.length} / {drivers.length}</span>
          </div>
          <input
            value={driverManagementFilter}
            onChange={(event) => setDriverManagementFilter(event.target.value)}
            placeholder="Search driver, phone, status, company"
          />
          <div className="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Driver</th>
                  <th>Phone</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th>Dismissed</th>
                </tr>
              </thead>
              <tbody>
                {filteredManagementDrivers.map((item) => (
                  <tr key={item.id}>
                    <td>{item.externalId || "-"}</td>
                    <td>{item.fullName}</td>
                    <td>{item.phone || "-"}</td>
                    <td>{item.company?.name || "-"}</td>
                    <td>{item.status}</td>
                    <td>{item.dismissedDate ? item.dismissedDate.slice(0, 10) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </section>
      ) : null}

      {activeSection === "audit" ? (
        <section className="section-grid">
        <div className="list-panel audit-panel management-panel">
          <div className="panel-header">
            <h2>Audit Log</h2>
            <span className="muted">{filteredAudit.length} / {audit.length}</span>
          </div>
          <input
            value={auditFilter}
            onChange={(event) => setAuditFilter(event.target.value)}
            placeholder="Search event, Auftrag, entity, user"
          />
          <div className="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Auftrag</th>
                  <th>Entity</th>
                  <th>User</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {filteredAudit.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.createdAt).toLocaleString()}</td>
                    <td>{item.eventType}</td>
                    <td>{item.order ? `R${item.order.runde}: ${item.order.description}` : "-"}</td>
                    <td>{item.entityType}</td>
                    <td>{item.user?.displayName || "system"}</td>
                    <td>{item.message || "-"}</td>
                  </tr>
                ))}
                {filteredAudit.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No audit events match the current filter.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        </section>
      ) : null}

        {activeSection === "users" && user.role === "ADMIN" ? (
          <section className="section-grid">
          <div className="list-panel audit-panel management-panel">
            <div className="panel-header">
              <h2>User management</h2>
              <span className="muted">{managedUsers.length} users</span>
            </div>
            <form className="user-create-form" onSubmit={createUser}>
              <input
                type="email"
                value={newUserEmail}
                onChange={(event) => setNewUserEmail(event.target.value)}
                placeholder="Email"
                required
              />
              <input
                value={newUserDisplayName}
                onChange={(event) => setNewUserDisplayName(event.target.value)}
                placeholder="Display name"
                required
              />
              <input
                type="password"
                value={newUserPassword}
                onChange={(event) => setNewUserPassword(event.target.value)}
                placeholder="Temporary password"
                minLength={10}
                required
              />
              <select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value)}>
                <option value="VIEWER">VIEWER</option>
                <option value="OPERATOR">OPERATOR</option>
                <option value="MANAGER">MANAGER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <button type="submit" disabled={Boolean(userBusy)}>Create user</button>
            </form>
            <div className="table-wrap compact-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Active</th>
                    <th>Last login</th>
                  </tr>
                </thead>
                <tbody>
                  {managedUsers.map((item) => (
                    <tr key={item.id}>
                      <td>{item.displayName}</td>
                      <td>{item.email}</td>
                      <td>
                        <select
                          value={item.role}
                          disabled={Boolean(userBusy) || item.id === user.id}
                          onChange={(event) => updateManagedUser(item.id, { role: event.target.value })}
                          title={item.id === user.id ? "Own role cannot be changed here" : "Change role"}
                        >
                          <option value="VIEWER">VIEWER</option>
                          <option value="OPERATOR">OPERATOR</option>
                          <option value="MANAGER">MANAGER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={item.isActive}
                          disabled={Boolean(userBusy) || item.id === user.id}
                          onChange={(event) => updateManagedUser(item.id, { isActive: event.target.checked })}
                          title={item.id === user.id ? "Own account cannot be deactivated here" : "Set active"}
                        />
                      </td>
                      <td>{item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </section>
        ) : null}
    </main>
  );
}
