"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { KalenderView } from "./kalender-view";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

type User = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  mustChangePassword: boolean;
};

type MetricCounters = {
  ordersToday: number;
  assignedLkw: number;
  freeLkw: number;
  openOrders: number;
  activeOrders: number;
  assignedOrders: number;
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
    company: string | null;
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
  lkwDriverPairings: Array<{
    id: string;
    lkwId: string;
    driverId: string;
    lkwNumber: string;
    driverName: string;
    source: string;
    confidence: number;
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
  availability?: Array<{ status: string; rawStatus: string | null; source: string }>;
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
  mustChangePassword: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AppSettings = {
  defaultCountry: string;
  defaultPeriod: PeriodFilter;
  rundeCount: string;
  holidayRegion: string;
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

type ImportRunItem = {
  id: string;
  sourceType: string;
  sourceFileName: string;
  status: string;
  createdAt: string;
  executedAt: string | null;
  rolledBackAt: string | null;
  errorCount: number;
  createdBy: string | null;
};

type ImportFreshness = Record<string, { executedAt: string; sourceFileName: string }>;

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
  {
    key: "pairings",
    title: "LKW-driver pairings",
    previewPath: "/api/imports/lkw-driver-pairings/preview",
    executePath: "/api/imports/lkw-driver-pairings/execute",
  },
  {
    key: "daily-plan",
    title: "Daily plan (Tagesplanung Excel)",
    previewPath: "/api/imports/daily-plan/preview",
    executePath: "/api/imports/daily-plan/execute",
  },
];

const countryOptions = [
  { value: "DE", label: "DE - Germany" },
  { value: "NL", label: "NL - Netherlands" },
  { value: "BE", label: "BE - Belgium" },
  { value: "LU", label: "LU - Luxembourg" },
  { value: "FR", label: "FR - France" },
  { value: "CH", label: "CH - Switzerland" },
  { value: "AT", label: "AT - Austria" },
  { value: "CZ", label: "CZ - Czech Republic" },
  { value: "PL", label: "PL - Poland" },
  { value: "DK", label: "DK - Denmark" },
];

const EMPTY_LKW_FILTER = "__EMPTY_LKW__";
const masterStatusOptions = [
  "ACTIVE",
  "INACTIVE",
  "SOLD",
  "RETURNED",
  "WORKSHOP",
  "RESERVE",
  "DISMISSED",
  "VACATION",
  "SICK",
  "UNKNOWN",
];

type ViewMode = "lkw-first" | "orders-first";
type AppSection = "planning" | "kalender" | "imports" | "lkw" | "drivers" | "audit" | "users" | "settings" | "exports";

type ExportLogItem = {
  id: string;
  exportType: string;
  format: string;
  filters: Record<string, unknown>;
  outputPath: string | null;
  createdAt: string;
  createdBy: string | null;
};
type PeriodFilter = "day" | "week" | "month";
type Language = "de" | "en" | "ru";

const languageOptions: Array<{ value: Language; label: string }> = [
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
  { value: "ru", label: "Русский" },
];

const translations = {
  en: {
    active: "Active",
    activeOrders: "Active orders",
    action: "Action",
    all: "All",
    applicationSections: "Application sections",
    assignedLkw: "Assigned LKW",
    assignedOrders: "Assigned orders",
    auditLog: "Audit Log",
    auftrag: "Auftrag",
    cancel: "Cancel",
    changePassword: "Change password",
    city: "City",
    clearFilters: "Clear filters",
    company: "Company",
    confirmNewPassword: "Confirm new password",
    country: "Country",
    createOrder: "Create order",
    createDriver: "Create driver",
    createLkw: "Create LKW",
    createUser: "Create user",
    currentTemporaryPassword: "Current temporary password",
    customer: "Customer",
    delete: "Delete",
    dailyPlanning: "Tagesplanung",
    day: "Day",
    defaultCountry: "Default country",
    defaultPeriod: "Default period",
    dismissDate: "Dismissed",
    driver: "Driver",
    driverManagement: "Driver management",
    email: "Email",
    emptyLkw: "Empty",
    execute: "Execute",
    executeImport: "Execute import",
    exportExcel: "Export Excel",
    exportPdf: "Export PDF",
    exporte: "Exports",
    exportHistory: "Export history",
    downloadLkwListe: "Download LKW list",
    downloadFahrerListe: "Download driver list",
    importHistory: "Import history",
    lastSync: "Last sync",
    never: "Never",
    errors: "Errors",
    freeLkw: "Free LKW",
    hide: "Hide",
    imports: "Imports",
    info: "Info",
    internalLogistics: "Internal logistics",
    kalender: "Kalender",
    language: "Language",
    lastLogin: "Last login",
    lkwManagement: "LKW management",
    lkwUsage: "LKW usage",
    loading: "Loading...",
    logout: "Logout",
    markAssigned: "Mark assigned",
    month: "Month",
    name: "Name",
    newPassword: "New password",
    newTemporaryPassword: "New temporary password",
    noActiveRows: "No active planning rows match the current filters.",
    noAuditRows: "No audit events match the current filter.",
    noOrders: "No orders match the current filters.",
    onlyAdminCanExecute: "Only Admin can execute imports",
    orderText: "Order text",
    password: "Password",
    passwordTemporaryActive: " Temporary password active",
    period: "Period",
    phone: "Phone",
    planningDatabaseNote: "Data is read from the isolated planning database.",
    planningDate: "Planning date",
    preview: "Preview",
    problem: "Problem",
    problems: "Problems",
    refresh: "Refresh",
    reportingDbSource: "Reporting DB source",
    resetPassword: "Reset password",
    returned: "Returned",
    role: "Role",
    runde: "Runde",
    rundeCount: "Runde count",
    save: "Save",
    saveNewPassword: "Save new password",
    searchAudit: "Search event, Auftrag, entity, user",
    searchDriver: "Search driver, phone, status, company",
    searchLkw: "Search LKW, status, company",
    setActive: "Set active",
    settings: "Settings",
    holidayRegion: "Holiday region",
    show: "Show",
    signIn: "Sign in",
    signingIn: "Signing in...",
    sold: "Sold",
    status: "Status",
    temporaryPassword: "Temporary password",
    temporaryPasswordMustChange: "Temporary password must be changed before using the app.",
    time: "Time",
    total: "total",
    totalOrders: "Total orders",
    type: "Type",
    user: "User",
    userManagement: "User management",
    users: "users",
    viewFor: "view for",
    visible: "visible",
    week: "Week",
  },
  de: {
    active: "Aktiv",
    activeOrders: "Aktive Aufträge",
    action: "Aktion",
    all: "Alle",
    applicationSections: "App-Bereiche",
    assignedLkw: "Zugewiesene LKW",
    assignedOrders: "Zugewiesene Aufträge",
    auditLog: "Audit Log",
    auftrag: "Auftrag",
    cancel: "Abbrechen",
    changePassword: "Passwort ändern",
    city: "Stadt",
    clearFilters: "Filter löschen",
    company: "Firma",
    confirmNewPassword: "Neues Passwort bestätigen",
    country: "Land",
    createOrder: "Auftrag erstellen",
    createDriver: "Fahrer erstellen",
    createLkw: "LKW erstellen",
    createUser: "Benutzer erstellen",
    currentTemporaryPassword: "Aktuelles temporäres Passwort",
    customer: "Kunde",
    delete: "Löschen",
    dailyPlanning: "Tagesplanung",
    day: "Tag",
    defaultCountry: "Standardland",
    defaultPeriod: "Standardzeitraum",
    dismissDate: "Entlassen",
    driver: "Fahrer",
    driverManagement: "Fahrerverwaltung",
    email: "E-Mail",
    emptyLkw: "Leer",
    execute: "Ausführen",
    executeImport: "Import ausführen",
    exportExcel: "Excel exportieren",
    exportPdf: "PDF exportieren",
    exporte: "Exporte",
    exportHistory: "Exportverlauf",
    downloadLkwListe: "LKW-Liste herunterladen",
    downloadFahrerListe: "Fahrerliste herunterladen",
    importHistory: "Importverlauf",
    lastSync: "Letzte Sync",
    never: "Nie",
    errors: "Fehler",
    freeLkw: "Freie LKW",
    hide: "Ausblenden",
    imports: "Importe",
    info: "Info",
    internalLogistics: "Interne Logistik",
    kalender: "Kalender",
    language: "Sprache",
    lastLogin: "Letzter Login",
    lkwManagement: "LKW-Verwaltung",
    lkwUsage: "LKW-Auslastung",
    loading: "Lädt...",
    logout: "Abmelden",
    markAssigned: "Als zugewiesen markieren",
    month: "Monat",
    name: "Name",
    newPassword: "Neues Passwort",
    newTemporaryPassword: "Neues temporäres Passwort",
    noActiveRows: "Keine aktiven Planungszeilen für die aktuellen Filter.",
    noAuditRows: "Keine Audit-Einträge für den aktuellen Filter.",
    noOrders: "Keine Aufträge für die aktuellen Filter.",
    onlyAdminCanExecute: "Nur Admin darf Importe ausführen",
    orderText: "Auftragstext",
    password: "Passwort",
    passwordTemporaryActive: " Temporäres Passwort aktiv",
    period: "Zeitraum",
    phone: "Telefon",
    planningDatabaseNote: "Daten werden aus der isolierten Planungsdatenbank gelesen.",
    planningDate: "Planungsdatum",
    preview: "Vorschau",
    problem: "Problem",
    problems: "Probleme",
    refresh: "Aktualisieren",
    reportingDbSource: "Reporting-DB-Quelle",
    resetPassword: "Passwort zurücksetzen",
    returned: "Rückgabe",
    role: "Rolle",
    runde: "Runde",
    rundeCount: "Runde-Anzahl",
    save: "Speichern",
    saveNewPassword: "Neues Passwort speichern",
    searchAudit: "Event, Auftrag, Entität, Benutzer suchen",
    searchDriver: "Fahrer, Telefon, Status, Firma suchen",
    searchLkw: "LKW, Status, Firma suchen",
    setActive: "Aktiv setzen",
    settings: "Einstellungen",
    holidayRegion: "Feiertagsregion",
    show: "Anzeigen",
    signIn: "Anmelden",
    signingIn: "Anmeldung...",
    sold: "Verkauft",
    status: "Status",
    temporaryPassword: "Temporäres Passwort",
    temporaryPasswordMustChange: "Das temporäre Passwort muss vor Nutzung der App geändert werden.",
    time: "Zeit",
    total: "gesamt",
    totalOrders: "Aufträge gesamt",
    type: "Typ",
    user: "Benutzer",
    userManagement: "Benutzerverwaltung",
    users: "Benutzer",
    viewFor: "Ansicht für",
    visible: "sichtbar",
    week: "Woche",
  },
  ru: {
    active: "Активен",
    activeOrders: "Активные заказы",
    action: "Действие",
    all: "Все",
    applicationSections: "Разделы приложения",
    assignedLkw: "Назначенные LKW",
    assignedOrders: "Назначенные заказы",
    auditLog: "Журнал аудита",
    auftrag: "Заказ",
    cancel: "Отмена",
    changePassword: "Сменить пароль",
    city: "Город",
    clearFilters: "Очистить фильтры",
    company: "Компания",
    confirmNewPassword: "Повторите новый пароль",
    country: "Страна",
    createOrder: "Создать заказ",
    createDriver: "Создать водителя",
    createLkw: "Создать LKW",
    createUser: "Создать пользователя",
    currentTemporaryPassword: "Текущий временный пароль",
    customer: "Клиент",
    delete: "Удалить",
    dailyPlanning: "Планирование дня",
    day: "День",
    defaultCountry: "Страна по умолчанию",
    defaultPeriod: "Период по умолчанию",
    dismissDate: "Уволен",
    driver: "Водитель",
    driverManagement: "Водители",
    email: "Email",
    emptyLkw: "Пусто",
    execute: "Выполнить",
    executeImport: "Выполнить импорт",
    exportExcel: "Экспорт Excel",
    exportPdf: "Экспорт PDF",
    exporte: "Отчёты",
    exportHistory: "История экспортов",
    downloadLkwListe: "Скачать список LKW",
    downloadFahrerListe: "Скачать список водителей",
    importHistory: "История импортов",
    lastSync: "Последняя синхр.",
    never: "Никогда",
    errors: "Ошибки",
    freeLkw: "Свободные LKW",
    hide: "Скрыть",
    imports: "Импорты",
    info: "Инфо",
    internalLogistics: "Внутренняя логистика",
    kalender: "Календарь",
    language: "Язык",
    lastLogin: "Последний вход",
    lkwManagement: "LKW",
    lkwUsage: "Загрузка LKW",
    loading: "Загрузка...",
    logout: "Выйти",
    markAssigned: "Отметить назначенным",
    month: "Месяц",
    name: "Имя",
    newPassword: "Новый пароль",
    newTemporaryPassword: "Новый временный пароль",
    noActiveRows: "Нет активных строк по текущим фильтрам.",
    noAuditRows: "Нет событий аудита по текущему фильтру.",
    noOrders: "Нет заказов по текущим фильтрам.",
    onlyAdminCanExecute: "Только Admin может выполнять импорт",
    orderText: "Текст заказа",
    password: "Пароль",
    passwordTemporaryActive: " Временный пароль активен",
    period: "Период",
    phone: "Телефон",
    planningDatabaseNote: "Данные читаются из отдельной базы планирования.",
    planningDate: "Дата планирования",
    preview: "Предпросмотр",
    problem: "Проблема",
    problems: "Проблемы",
    refresh: "Обновить",
    reportingDbSource: "Источник Reporting DB",
    resetPassword: "Сбросить пароль",
    returned: "Возврат",
    role: "Роль",
    runde: "Рейс",
    rundeCount: "Количество рейсов",
    save: "Сохранить",
    saveNewPassword: "Сохранить новый пароль",
    searchAudit: "Поиск: событие, заказ, объект, пользователь",
    searchDriver: "Поиск: водитель, телефон, статус, компания",
    searchLkw: "Поиск: LKW, статус, компания",
    setActive: "Сделать активным",
    settings: "Настройки",
    holidayRegion: "Регион праздников",
    show: "Показать",
    signIn: "Войти",
    signingIn: "Вход...",
    sold: "Продан",
    status: "Статус",
    temporaryPassword: "Временный пароль",
    temporaryPasswordMustChange: "Временный пароль нужно изменить перед использованием приложения.",
    time: "Время",
    total: "всего",
    totalOrders: "Всего заказов",
    type: "Тип",
    user: "Пользователь",
    userManagement: "Пользователи",
    users: "пользователей",
    viewFor: "вид на",
    visible: "видно",
    week: "Неделя",
  },
} satisfies Record<Language, Record<string, string>>;

type TranslationKey = keyof typeof translations.en;

function detectLanguage(): Language {
  if (typeof navigator === "undefined") return "en";
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  const match = candidates
    .map((value) => value.toLowerCase().slice(0, 2))
    .find((value) => value === "de" || value === "en" || value === "ru");
  return (match as Language | undefined) || "en";
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDisplayDate(value: string): string {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

function dateInputValue(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function hasManagerAccess(role: string): boolean {
  return ["ADMIN", "MANAGER"].includes(role);
}

function isAfterPlanningDate(value: string | null, selectedDate: string): boolean {
  return Boolean(value && value.slice(0, 10) > selectedDate);
}

function isLkwVisibleForPlanning(item: LkwItem, selectedDate: string): boolean {
  if (item.status === "INACTIVE") return false;
  if (item.status === "SOLD") return isAfterPlanningDate(item.soldDate, selectedDate);
  if (item.status === "RETURNED") return isAfterPlanningDate(item.returnedDate, selectedDate);
  return item.isActive;
}

function isDriverVisibleForPlanning(item: DriverItem, selectedDate: string): boolean {
  if (item.status === "INACTIVE") return false;
  if (item.status === "DISMISSED") return isAfterPlanningDate(item.dismissedDate, selectedDate);
  return item.isActive;
}

function isDriverAvailableForPlanningDate(item: DriverItem): boolean {
  return !(item.availability || []).some((availability) => ["VACATION", "SICK"].includes(availability.status));
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
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [selectedDate, setSelectedDate] = useState("2026-05-04");
  const [planning, setPlanning] = useState<PlanningDayResponse | null>(null);
  const [lkw, setLkw] = useState<LkwItem[]>([]);
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [exportHistory, setExportHistory] = useState<ExportLogItem[]>([]);
  const [importHistory, setImportHistory] = useState<ImportRunItem[]>([]);
  const [importFreshness, setImportFreshness] = useState<ImportFreshness>({});
  const [dataLoadedAt, setDataLoadedAt] = useState<string | null>(null);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    defaultCountry: "DE",
    defaultPeriod: "day",
    rundeCount: "3",
    holidayRegion: "HH",
  });
  const [importResults, setImportResults] = useState<Record<string, ImportResult>>({});
  const [importBusy, setImportBusy] = useState<string | null>(null);
  const [userBusy, setUserBusy] = useState<string | null>(null);
  const [orderBusy, setOrderBusy] = useState<string | null>(null);
  const [managementBusy, setManagementBusy] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const [newUserRole, setNewUserRole] = useState("VIEWER");
  const [resetPasswordUserId, setResetPasswordUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [newOrderRunde, setNewOrderRunde] = useState("1");
  const [newOrderDescription, setNewOrderDescription] = useState("");
  const [newOrderCustomer, setNewOrderCustomer] = useState("");
  const [newOrderPlz, setNewOrderPlz] = useState("");
  const [newOrderCity, setNewOrderCity] = useState("");
  const [newOrderCountry, setNewOrderCountry] = useState("");
  const [newOrderTime, setNewOrderTime] = useState("");
  const [newOrderInfo, setNewOrderInfo] = useState("");
  const [newLkwNumber, setNewLkwNumber] = useState("");
  const [newLkwType, setNewLkwType] = useState("");
  const [newLkwStatus, setNewLkwStatus] = useState("ACTIVE");
  const [newDriverName, setNewDriverName] = useState("");
  const [newDriverPhone, setNewDriverPhone] = useState("");
  const [newDriverStatus, setNewDriverStatus] = useState("ACTIVE");
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, { lkwId: string; driverId: string }>>({});
  const [orderDrafts, setOrderDrafts] = useState<Record<string, OrderDraft>>({});
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("day");
  const [auftragFilter, setAuftragFilter] = useState("");
  const [lkwFilter, setLkwFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [rundeFilter, setRundeFilter] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("lkw-first");
  const [activeSection, setActiveSection] = useState<AppSection>("planning");
  const [language, setLanguage] = useState<Language>("en");
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
    const savedLanguage = window.localStorage.getItem("lkwPlanningLanguage") as Language | null;
    setLanguage(savedLanguage && savedLanguage in translations ? savedLanguage : detectLanguage());
  }, []);

  useEffect(() => {
    if (!user) return;
    loadDashboardData(selectedDate);
  }, [user, selectedDate, periodFilter]);

  useEffect(() => {
    if (!user || activeSection !== "exports") return;
    apiFetch<{ ok: true; logs: ExportLogItem[] }>("/api/exports/history?limit=100")
      .then((result) => setExportHistory(result.logs))
      .catch(() => {});
  }, [user, activeSection]);

  useEffect(() => {
    if (!user || activeSection !== "imports") return;
    Promise.all([
      apiFetch<{ ok: true; freshness: ImportFreshness }>("/api/imports/freshness"),
      apiFetch<{ ok: true; runs: ImportRunItem[] }>("/api/imports/history?limit=60"),
    ])
      .then(([fr, hr]) => {
        setImportFreshness(fr.freshness);
        setImportHistory(hr.runs);
      })
      .catch(() => {});
  }, [user, activeSection]);

  const metrics = useMemo(() => {
    const counters = planning?.counters || {
      ordersToday: 0,
      assignedLkw: 0,
      freeLkw: 0,
      openOrders: 0,
      activeOrders: 0,
      assignedOrders: 0,
      problemOrders: 0,
      lkwUsagePercent: 0,
    };

    return [
      [t("totalOrders"), String(counters.ordersToday)],
      [t("activeOrders"), String(counters.activeOrders)],
      [t("assignedOrders"), String(counters.assignedOrders)],
      [t("assignedLkw"), String(counters.assignedLkw)],
      [t("freeLkw"), String(counters.freeLkw)],
      [t("lkwUsage"), `${counters.lkwUsagePercent}%`],
      [t("problems"), String(counters.problemOrders)],
    ];
  }, [planning, language]);

  function t(key: TranslationKey): string {
    return translations[language][key] || translations.en[key];
  }

  function updateLanguage(value: Language): void {
    setLanguage(value);
    window.localStorage.setItem("lkwPlanningLanguage", value);
  }

  const allOrdersFirstRows = useMemo(() => {
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
      lkwCompany: row.lkw?.company || "",
      driverId: row.driver?.id || "",
      driver: row.driver?.fullName || "-",
      driverCompany: row.driver?.company || "",
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
      lkwCompany: "",
      driverId: "",
      driver: "-",
      driverCompany: "",
      city: [order.plz, order.city, order.country].filter(Boolean).join(" ") || "-",
      time: order.plannedTime || "-",
      status: order.status,
      problemReason: order.problemReason,
    }));

    return [...assigned, ...unassigned]
      .sort((a, b) => a.runde - b.runde || a.description.localeCompare(b.description));
  }, [planning]);

  const ordersFirstRows = useMemo(() => {
    return allOrdersFirstRows.filter((row) => {
      const auftragMatch = !auftragFilter || row.description.toLowerCase().includes(auftragFilter.toLowerCase());
      const lkwMatch = !lkwFilter
        || (lkwFilter === EMPTY_LKW_FILTER ? !row.lkwId : row.lkw.toLowerCase().includes(lkwFilter.toLowerCase()));
      const driverMatch = !driverFilter || row.driver.toLowerCase().includes(driverFilter.toLowerCase());
      const companyMatch = !companyFilter || [row.lkwCompany, row.driverCompany].some((value) => (
        value.toLowerCase().includes(companyFilter.toLowerCase())
      ));
      const statusMatch = !statusFilter || row.status === statusFilter;
      const rundeMatch = !rundeFilter || String(row.runde) === rundeFilter;
      return auftragMatch && lkwMatch && driverMatch && companyMatch && statusMatch && rundeMatch;
    });
  }, [allOrdersFirstRows, auftragFilter, lkwFilter, driverFilter, companyFilter, statusFilter, rundeFilter]);

  const activeRows = useMemo(() => (
    ordersFirstRows.filter((row) => row.status !== "DONE")
  ), [ordersFirstRows]);

  const assignedRows = useMemo(() => (
    ordersFirstRows.filter((row) => row.status === "DONE")
  ), [ordersFirstRows]);

  const planningLkw = useMemo(() => (
    lkw.filter((item) => isLkwVisibleForPlanning(item, selectedDate))
  ), [lkw, selectedDate]);

  const planningDrivers = useMemo(() => (
    drivers.filter((item) => isDriverVisibleForPlanning(item, selectedDate) && isDriverAvailableForPlanningDate(item))
  ), [drivers, selectedDate]);

  const companyOptions = useMemo(() => (
    Array.from(new Set([
      ...lkw.map((item) => item.company?.name),
      ...drivers.map((item) => item.company?.name),
    ].filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b))
  ), [lkw, drivers]);

  const lkwDriverSuggestions = useMemo(() => {
    const suggestions: Record<string, string> = {};
    (planning?.lkwDriverPairings || []).forEach((pairing) => {
      if (pairing.lkwId && pairing.driverId && !suggestions[pairing.lkwId]) {
        suggestions[pairing.lkwId] = pairing.driverId;
      }
    });
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
        apiFetch<PlanningDayResponse>(`/api/planning/day?date=${date}&scope=${periodFilter}`),
        apiFetch<{ ok: true; items: LkwItem[] }>("/api/lkw?limit=500"),
        apiFetch<{ ok: true; items: DriverItem[] }>(`/api/drivers?limit=500&planningDate=${date}`),
        hasManagerAccess(currentUser.role)
          ? apiFetch<{ ok: true; items: AuditItem[] }>("/api/audit-log?limit=200")
          : Promise.resolve({ ok: true as const, items: [] }),
      ]);
      const usersResult = currentUser.role === "ADMIN"
        ? await apiFetch<{ ok: true; items: ManagedUser[] }>("/api/users")
        : { ok: true as const, items: [] };
      const settingsResult = hasManagerAccess(currentUser.role)
        ? await apiFetch<{ ok: true; settings: AppSettings }>("/api/settings")
        : { ok: true as const, settings };
      setPlanning(planningResult);
      setLkw(lkwResult.items);
      setDrivers(driversResult.items);
      setAudit(auditResult.items);
      setManagedUsers(usersResult.items);
      setSettings(settingsResult.settings);
      setDataLoadedAt(new Date().toISOString());
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
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
  }

  async function changeOwnPassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirmNewPassword) {
      setError("New passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetch<{ ok: true; user: User }>("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setUser(result.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Password change failed");
    } finally {
      setLoading(false);
    }
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
      setShowNewUserPassword(false);
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

  async function resetManagedUserPassword(id: string): Promise<void> {
    setError(null);
    setUserBusy(id);
    try {
      await apiFetch(`/api/users/${id}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password: resetPassword }),
      });
      setResetPasswordUserId(null);
      setResetPassword("");
      setShowResetPassword(false);
      await loadDashboardData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Password reset failed");
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

  async function markOrderAssigned(row: EditableOrderRow): Promise<void> {
    setError(null);
    setOrderBusy(row.orderId);
    const assignmentDraft = assignmentDrafts[row.orderId] || { lkwId: row.lkwId, driverId: row.driverId };
    if (!assignmentDraft.lkwId || !assignmentDraft.driverId) {
      setError("Select LKW and driver before marking assigned.");
      setOrderBusy(null);
      return;
    }
    try {
      await apiFetch("/api/assignments/upsert", {
        method: "POST",
        body: JSON.stringify({
          orderId: row.orderId,
          lkwId: assignmentDraft.lkwId,
          driverId: assignmentDraft.driverId,
        }),
      });
      await apiFetch(`/api/orders/${row.orderId}`, { method: "PATCH", body: JSON.stringify({ status: "DONE" }) });
      await loadDashboardData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mark assigned failed");
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

  function updateLkwLocal(id: string, patch: Partial<LkwItem>): void {
    setLkw((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function updateDriverLocal(id: string, patch: Partial<DriverItem>): void {
    setDrivers((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function saveLkwItem(item: LkwItem): Promise<void> {
    setError(null);
    setManagementBusy(item.id);
    try {
      await apiFetch(`/api/lkw/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          number: item.number,
          type: item.type || null,
          status: item.status,
          soldDate: dateInputValue(item.soldDate) || null,
          returnedDate: dateInputValue(item.returnedDate) || null,
          isActive: item.isActive,
        }),
      });
      await loadDashboardData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "LKW update failed");
    } finally {
      setManagementBusy(null);
    }
  }

  async function createLkwItem(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setManagementBusy("create-lkw");
    try {
      await apiFetch("/api/lkw", {
        method: "POST",
        body: JSON.stringify({
          number: newLkwNumber,
          type: newLkwType || null,
          status: newLkwStatus,
          isActive: newLkwStatus === "ACTIVE",
        }),
      });
      setNewLkwNumber("");
      setNewLkwType("");
      setNewLkwStatus("ACTIVE");
      await loadDashboardData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "LKW create failed");
    } finally {
      setManagementBusy(null);
    }
  }

  async function saveDriverItem(item: DriverItem): Promise<void> {
    setError(null);
    setManagementBusy(item.id);
    try {
      await apiFetch(`/api/drivers/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: item.fullName,
          phone: item.phone || null,
          status: item.status,
          dismissedDate: dateInputValue(item.dismissedDate) || null,
          isActive: item.isActive,
        }),
      });
      await loadDashboardData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Driver update failed");
    } finally {
      setManagementBusy(null);
    }
  }

  async function createDriverItem(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setManagementBusy("create-driver");
    try {
      await apiFetch("/api/drivers", {
        method: "POST",
        body: JSON.stringify({
          fullName: newDriverName,
          phone: newDriverPhone || null,
          status: newDriverStatus,
          isActive: newDriverStatus === "ACTIVE",
        }),
      });
      setNewDriverName("");
      setNewDriverPhone("");
      setNewDriverStatus("ACTIVE");
      await loadDashboardData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Driver create failed");
    } finally {
      setManagementBusy(null);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSettingsBusy(true);
    try {
      const result = await apiFetch<{ ok: true; settings: AppSettings }>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      setSettings(result.settings);
      setPeriodFilter(result.settings.defaultPeriod);
      setNewOrderCountry(result.settings.defaultCountry);
      await loadDashboardData(selectedDate);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Settings save failed");
    } finally {
      setSettingsBusy(false);
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
    return !allOrdersFirstRows.some((row) => {
      const draft = assignmentDrafts[row.orderId];
      const rowLkwId = draft?.lkwId ?? row.lkwId;
      return row.orderId !== orderId && row.runde === runde && rowLkwId === lkwId;
    });
  }

  function isDriverAvailableForRunde(driverId: string, runde: number, orderId: string): boolean {
    return !allOrdersFirstRows.some((row) => {
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

  function exportTagesplanung(format: "xls" | "pdf"): void {
    const params = new URLSearchParams({ date: selectedDate, scope: periodFilter });
    if (auftragFilter) params.set("auftrag", auftragFilter);
    if (lkwFilter === EMPTY_LKW_FILTER) {
      params.set("lkwMissing", "1");
    } else if (lkwFilter) {
      params.set("lkw", lkwFilter);
    }
    if (driverFilter) params.set("driver", driverFilter);
    if (companyFilter) params.set("company", companyFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (rundeFilter) params.set("runde", rundeFilter);
    window.location.href = `${apiBaseUrl}/api/exports/tagesplanung.${format}?${params.toString()}`;
  }

  if (loading && !user) {
    return <main className="shell"><p>{t("loading")}</p></main>;
  }

  if (!user) {
    return (
      <main className="login-shell">
        <form className="login-panel" onSubmit={handleLogin}>
          <div>
            <p className="eyebrow">{t("internalLogistics")}</p>
            <h1>LKW Planning</h1>
          </div>
          <label>
            {t("language")}
            <select value={language} onChange={(event) => updateLanguage(event.target.value as Language)}>
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            {t("email")}
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </label>
          <label>
            {t("password")}
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={loading}>{loading ? t("signingIn") : t("signIn")}</button>
        </form>
      </main>
    );
  }

  if (user.mustChangePassword) {
    return (
      <main className="login-shell">
        <form className="login-panel" onSubmit={changeOwnPassword}>
          <div>
            <p className="eyebrow">{t("internalLogistics")}</p>
            <h1>{t("changePassword")}</h1>
            <p className="muted">{t("temporaryPasswordMustChange")}</p>
          </div>
          <label>
            {t("language")}
            <select value={language} onChange={(event) => updateLanguage(event.target.value as Language)}>
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            {t("currentTemporaryPassword")}
            <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" required />
          </label>
          <label>
            {t("newPassword")}
            <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" minLength={10} required />
          </label>
          <label>
            {t("confirmNewPassword")}
            <input value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} type="password" minLength={10} required />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" disabled={loading}>{loading ? `${t("save")}...` : t("saveNewPassword")}</button>
          <button type="button" className="secondary-button" onClick={handleLogout}>{t("logout")}</button>
        </form>
      </main>
    );
  }

  const canEditPlanning = ["ADMIN", "OPERATOR", "MANAGER"].includes(user.role);
  const canViewImports = hasManagerAccess(user.role);
  const canExecuteImports = user.role === "ADMIN";
  const canViewAudit = hasManagerAccess(user.role);
  const canManageMasterData = hasManagerAccess(user.role);
  const visibleSections: Array<{ key: AppSection; label: string }> = [
    { key: "planning", label: t("dailyPlanning") },
    { key: "kalender", label: t("kalender") },
    ...(canViewImports ? [{ key: "imports" as AppSection, label: t("imports") }] : []),
    { key: "lkw", label: t("lkwManagement") },
    { key: "drivers", label: t("driverManagement") },
    ...(canViewAudit ? [{ key: "audit" as AppSection, label: t("auditLog") }] : []),
    { key: "exports" as AppSection, label: t("exporte") },
    ...(user.role === "ADMIN" ? [{ key: "users" as AppSection, label: t("userManagement") }] : []),
    ...(hasManagerAccess(user.role) ? [{ key: "settings" as AppSection, label: t("settings") }] : []),
  ];

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{t("internalLogistics")}</p>
          <h1>LKW Planning</h1>
        </div>
        <div className="userbar">
          <span>{user.displayName} / {user.role}</span>
          <label className="language-field">
            {t("language")}
            <select value={language} onChange={(event) => updateLanguage(event.target.value as Language)}>
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary-button" onClick={handleLogout}>{t("logout")}</button>
        </div>
      </header>

      <div className={activeSection === "planning" ? "sticky-planning-toolbar" : undefined}>
        <nav className="app-tabs" aria-label={t("applicationSections")}>
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

        {activeSection === "planning" ? (
        <section className="planning-controls">
          <div className="planning-main-column">
            <div className="filters-panel">
              <label>
                {t("auftrag")}
                <input value={auftragFilter} onChange={(event) => setAuftragFilter(event.target.value)} placeholder={t("orderText")} />
              </label>
              <label>
                {t("period")}
                <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value as PeriodFilter)}>
                  <option value="day">{t("day")}</option>
                  <option value="week">{t("week")}</option>
                  <option value="month">{t("month")}</option>
                </select>
              </label>
              <label>
                LKW
                <span className="filter-combo">
                  <input
                    value={lkwFilter === EMPTY_LKW_FILTER ? "" : lkwFilter}
                    onChange={(event) => setLkwFilter(event.target.value)}
                    placeholder={lkwFilter === EMPTY_LKW_FILTER ? "-" : "GR-OO..."}
                    disabled={lkwFilter === EMPTY_LKW_FILTER}
                  />
                  <button
                    type="button"
                    className={lkwFilter === EMPTY_LKW_FILTER ? "" : "secondary-button"}
                    onClick={() => setLkwFilter(lkwFilter === EMPTY_LKW_FILTER ? "" : EMPTY_LKW_FILTER)}
                  >
                    {t("emptyLkw")}
                  </button>
                </span>
              </label>
              <label>
                {t("driver")}
                <input value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)} placeholder={t("name")} />
              </label>
              <label>
                {t("company")}
                <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
                  <option value="">{t("all")}</option>
                  {companyOptions.map((company) => (
                    <option key={company} value={company}>{company}</option>
                  ))}
                </select>
              </label>
              <label>
                {t("status")}
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="">{t("all")}</option>
                  <option value="OPEN">OPEN</option>
                  <option value="PLANNED">PLANNED</option>
                  <option value="PROBLEM">PROBLEM</option>
                  <option value="DONE">DONE</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </label>
              <label>
                {t("runde")}
                <select value={rundeFilter} onChange={(event) => setRundeFilter(event.target.value)}>
                  <option value="">{t("all")}</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </label>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setAuftragFilter("");
                  setLkwFilter("");
                  setDriverFilter("");
                  setCompanyFilter("");
                  setStatusFilter("");
                  setRundeFilter("");
                }}
              >
                {t("clearFilters")}
              </button>
              <span className="muted">
                {viewMode === "lkw-first"
                  ? `${ordersFirstRows.length} ${t("visible")} / ${(planning?.rows.length || 0) + (planning?.unassignedOrders.length || 0)} ${t("total")}`
                  : `${ordersFirstRows.length} ${t("visible")} / ${(planning?.rows.length || 0) + (planning?.unassignedOrders.length || 0)} ${t("total")}`}
              </span>
              {error ? <span className="error">{error}</span> : null}
            </div>
            <section className="dashboard planning-dashboard">
              {metrics.map(([label, value]) => (
                <div className="metric" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </section>
          </div>
          <div className="planning-actions-panel">
            <label>
              {t("planningDate")}
              <input type="date" value={selectedDate || todayDate()} onChange={(event) => setSelectedDate(event.target.value)} />
            </label>
            <button type="button" onClick={() => loadDashboardData(selectedDate)} disabled={loading}>
              {t("refresh")}
            </button>
            {dataLoadedAt ? (
              <span className="data-freshness-badge" title={new Date(dataLoadedAt).toISOString()}>
                ✓ {new Date(dataLoadedAt).toLocaleTimeString()}
              </span>
            ) : null}
            <div className="export-actions">
              <button type="button" className="secondary-button" onClick={() => exportTagesplanung("xls")}>
                {t("exportExcel")}
              </button>
              <button type="button" className="secondary-button" onClick={() => exportTagesplanung("pdf")}>
                {t("exportPdf")}
              </button>
            </div>
          </div>
        </section>
        ) : null}

        {activeSection === "planning" && planning?.holidays?.length ? (
          <section className="warning-banner">
            Holiday warning: {planning.holidays.map((holiday) => `${holiday.name} (${holiday.region})`).join(", ")}
          </section>
        ) : null}
      </div>

      {activeSection === "planning" ? (
      <section className="planner">
        <div className="planner-header">
          <div className="planner-title-row">
            <h2>{t("dailyPlanning")}</h2>
            <span className="planning-date-title">{formatDisplayDate(selectedDate)}</span>
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

        {canEditPlanning && viewMode === "orders-first" ? (
          <form className="order-create-form" onSubmit={createOrder}>
            <select value={newOrderRunde} onChange={(event) => setNewOrderRunde(event.target.value)}>
              <option value="1">{t("runde")} 1</option>
              <option value="2">{t("runde")} 2</option>
              <option value="3">{t("runde")} 3</option>
            </select>
            <input value={newOrderDescription} onChange={(event) => setNewOrderDescription(event.target.value)} placeholder={t("auftrag")} required />
            <input value={newOrderCustomer} onChange={(event) => setNewOrderCustomer(event.target.value)} placeholder={t("customer")} />
            <select value={newOrderCountry} onChange={(event) => setNewOrderCountry(event.target.value)}>
              <option value="">{t("country")}</option>
              {countryOptions.map((country) => (
                <option key={country.value} value={country.value}>{country.label}</option>
              ))}
            </select>
            <input value={newOrderInfo} onChange={(event) => setNewOrderInfo(event.target.value)} placeholder={t("info")} />
            <button type="submit" disabled={Boolean(orderBusy)}>{t("createOrder")}</button>
          </form>
        ) : null}

        <div className="table-wrap">
          {viewMode === "lkw-first" ? (
            <div className="lkw-first-tables">
              <table className="orders-table lkw-first-table">
                <thead>
                  <tr>
                    <th>LKW</th>
                    <th>{t("runde")}</th>
                    <th>{t("auftrag")}</th>
                    <th>{t("driver")}</th>
                    <th>{t("customer")}</th>
                    <th>{t("country")}</th>
                    <th>{t("info")}</th>
                    <th>{t("status")}</th>
                    <th>{t("problem")}</th>
                    {canEditPlanning ? <th>{t("action")}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {activeRows.map((row) => {
                    const editableRow: EditableOrderRow = {
                      orderId: row.orderId,
                      runde: row.runde,
                      description: row.description,
                      customer: row.customer,
                      plz: row.plz,
                      cityName: row.cityName,
                      country: row.country,
                      plannedTime: row.plannedTime,
                      info: row.info,
                      lkwId: row.lkwId,
                      driverId: row.driverId,
                    };
                    const draft = assignmentDrafts[row.orderId] || {
                      lkwId: editableRow.lkwId,
                      driverId: editableRow.driverId,
                    };
                    const effectiveRunde = row.runde;
                    return (
                      <tr key={row.key} className={row.status === "PROBLEM" ? "problem-row" : ""}>
                        <td>
                          {canEditPlanning ? (
                            <select value={draft.lkwId} onChange={(event) => updateAssignmentDraft(row.orderId, "lkwId", event.target.value, { ...editableRow, runde: effectiveRunde })}>
                              <option value="">-</option>
                              {planningLkw.filter((item) => item.id === draft.lkwId || isLkwAvailableForRunde(item.id, effectiveRunde, row.orderId)).map((item) => (
                                <option value={item.id} key={item.id}>{item.number}</option>
                              ))}
                            </select>
                          ) : row.lkw}
                        </td>
                        <td>{row.runde}</td>
                        <td>{row.description}</td>
                        <td>
                          {canEditPlanning ? (
                            <select value={draft.driverId} onChange={(event) => updateAssignmentDraft(row.orderId, "driverId", event.target.value, { ...editableRow, runde: effectiveRunde })}>
                              <option value="">-</option>
                              {planningDrivers.filter((item) => item.id === draft.driverId || isDriverAvailableForRunde(item.id, effectiveRunde, row.orderId)).map((item) => (
                                <option value={item.id} key={item.id}>{item.fullName}</option>
                              ))}
                            </select>
                          ) : row.driver}
                        </td>
                        <td>{row.customer || "-"}</td>
                        <td>{row.city}</td>
                        <td>{row.info || "-"}</td>
                        <td>
                          <span className={`status status-${row.status.toLowerCase()}`}>
                            {row.status}
                          </span>
                        </td>
                        <td>{row.problemReason || "-"}</td>
                        {canEditPlanning ? (
                          <td className="single-action-cell">
                            <button type="button" onClick={() => markOrderAssigned(editableRow)} disabled={Boolean(orderBusy)}>
                              {t("markAssigned")}
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                  {planning && activeRows.length === 0 ? (
                    <tr>
                    <td colSpan={canEditPlanning ? 10 : 9}>{t("noActiveRows")}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              {assignedRows.length > 0 ? (
                <div className="assigned-orders-block">
                  <div className="panel-header">
                    <h3>{t("assignedOrders")}</h3>
                    <span className="muted">{assignedRows.length}</span>
                  </div>
                  <table className="orders-table lkw-first-table">
                    <thead>
                      <tr>
                        <th>LKW</th>
                        <th>{t("runde")}</th>
                        <th>{t("auftrag")}</th>
                        <th>{t("driver")}</th>
                        <th>{t("customer")}</th>
                        <th>{t("country")}</th>
                        <th>{t("info")}</th>
                        <th>{t("status")}</th>
                        <th>{t("problem")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedRows.map((row) => (
                        <tr key={row.key}>
                          <td>{row.lkw}</td>
                          <td>{row.runde}</td>
                          <td>{row.description}</td>
                          <td>{row.driver}</td>
                          <td>{row.customer || "-"}</td>
                          <td>{row.city}</td>
                          <td>{row.info || "-"}</td>
                          <td>
                            <span className={`status status-${row.status.toLowerCase()}`}>
                              {row.status}
                            </span>
                          </td>
                          <td>{row.problemReason || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : (
            <table className="orders-table order-data-table">
              <thead>
                <tr>
                  <th>{t("runde")}</th>
                  <th>{t("auftrag")}</th>
                  <th>{t("customer")}</th>
                  <th>{t("country")}</th>
                  <th>{t("info")}</th>
                  <th>{t("status")}</th>
                  <th>{t("problem")}</th>
                  {canEditPlanning ? <th>{t("action")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {ordersFirstRows.map((row) => {
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
                          <input value={orderDraft.customer} onChange={(event) => updateOrderDraft(row.orderId, "customer", event.target.value, row)} />
                        ) : row.customer || "-"}
                      </td>
                      <td>
                        {canEditPlanning ? (
                          <select value={orderDraft.country} onChange={(event) => updateOrderDraft(row.orderId, "country", event.target.value, row)}>
                            <option value="">{t("country")}</option>
                            {countryOptions.map((country) => (
                              <option key={country.value} value={country.value}>{country.label}</option>
                            ))}
                          </select>
                        ) : row.city}
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
                          <button type="button" onClick={() => saveOrder(row)} disabled={Boolean(orderBusy)}>
                            {t("save")}
                          </button>
                          <button type="button" className="danger-button" onClick={() => deleteOrder(row.orderId)} disabled={Boolean(orderBusy)}>
                            {t("delete")}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
                {planning && ordersFirstRows.length === 0 ? (
                  <tr>
                    <td colSpan={canEditPlanning ? 8 : 7}>{t("noOrders")}</td>
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
          <h2>{t("imports")}</h2>
          <div className="imports-grid">
            {importActions.map((action) => {
              const result = importResults[action.key];
              const sourceType = ({
                master: "reporting-db-master-data",
                schedules: "reporting-db-schedules",
                availability: "reporting-db-driver-availability",
                pairings: "planning-lkw-driver-pairings",
                "daily-plan": "excel-daily-plan",
              } as Record<string, string>)[action.key];
              const fresh = sourceType ? importFreshness[sourceType] : null;
              return (
                <div className="import-card" key={action.key}>
                  <div>
                    <strong>{action.title}</strong>
                    <span>{t("reportingDbSource")}</span>
                    {fresh ? (
                      <span className="import-freshness-badge" title={fresh.sourceFileName}>
                        ✓ {t("lastSync")}: {new Date(fresh.executedAt).toLocaleString()}
                      </span>
                    ) : (
                      <span className="import-freshness-badge import-freshness-never">{t("never")}</span>
                    )}
                  </div>
                  <div className="import-buttons">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={Boolean(importBusy)}
                      onClick={() => runImportAction(action, "preview")}
                    >
                      {t("preview")}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(importBusy) || !canExecuteImports}
                      title={canExecuteImports ? t("executeImport") : t("onlyAdminCanExecute")}
                      onClick={() => runImportAction(action, "execute")}
                    >
                      {t("execute")}
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

          {importHistory.length > 0 ? (
            <>
              <h3 className="export-history-heading" style={{ marginTop: 28 }}>{t("importHistory")}</h3>
              <div className="table-wrap compact-table">
                <table>
                  <thead>
                    <tr>
                      <th>{t("time")}</th>
                      <th>{t("type")}</th>
                      <th>{t("status")}</th>
                      <th>{t("user")}</th>
                      <th>Executed</th>
                      <th>{t("errors")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importHistory.map((run) => (
                      <tr key={run.id} className={run.status === "FAILED" ? "import-run-failed" : run.status === "EXECUTED" ? "import-run-ok" : ""}>
                        <td>{new Date(run.createdAt).toLocaleString()}</td>
                        <td className="import-run-sourcetype">{run.sourceType}</td>
                        <td><span className={`import-status-badge import-status-${run.status.toLowerCase()}`}>{run.status}</span></td>
                        <td>{run.createdBy ?? "—"}</td>
                        <td>{run.executedAt ? new Date(run.executedAt).toLocaleString() : "—"}</td>
                        <td>{run.errorCount > 0 ? <span className="import-error-count">{run.errorCount}</span> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
        </section>
      ) : null}

      {activeSection === "lkw" ? (
        <section className="section-grid">
        <div className="list-panel management-panel">
          <div className="panel-header">
            <h2>{t("lkwManagement")}</h2>
            <span className="muted">{filteredManagementLkw.length} / {lkw.length}</span>
          </div>
          {canManageMasterData ? (
            <form className="management-create-form" onSubmit={createLkwItem}>
              <input value={newLkwNumber} onChange={(event) => setNewLkwNumber(event.target.value)} placeholder="LKW" required />
              <input value={newLkwType} onChange={(event) => setNewLkwType(event.target.value)} placeholder={t("type")} />
              <select value={newLkwStatus} onChange={(event) => setNewLkwStatus(event.target.value)}>
                {masterStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <button type="submit" disabled={managementBusy === "create-lkw"}>{t("createLkw")}</button>
            </form>
          ) : null}
          <input
            value={lkwManagementFilter}
            onChange={(event) => setLkwManagementFilter(event.target.value)}
            placeholder={t("searchLkw")}
          />
          <div className="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>LKW</th>
                  <th>{t("type")}</th>
                  <th>{t("company")}</th>
                  <th>{t("status")}</th>
                  <th>{t("active")}</th>
                  <th>{t("sold")}</th>
                  <th>{t("returned")}</th>
                  {canManageMasterData ? <th>{t("action")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredManagementLkw.map((item) => (
                  <tr key={item.id}>
                    <td>{item.externalId || "-"}</td>
                    <td>
                      {canManageMasterData ? (
                        <input className="management-input" value={item.number} onChange={(event) => updateLkwLocal(item.id, { number: event.target.value })} />
                      ) : item.number}
                    </td>
                    <td>
                      {canManageMasterData ? (
                        <input className="management-input" value={item.type || ""} onChange={(event) => updateLkwLocal(item.id, { type: event.target.value })} />
                      ) : item.type || "-"}
                    </td>
                    <td>{item.company?.name || "-"}</td>
                    <td>
                      {canManageMasterData ? (
                        <select className="management-input" value={item.status} onChange={(event) => updateLkwLocal(item.id, { status: event.target.value })}>
                          {masterStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      ) : item.status}
                    </td>
                    <td>
                      <input
                        checked={item.isActive}
                        disabled={!canManageMasterData}
                        onChange={(event) => updateLkwLocal(item.id, { isActive: event.target.checked })}
                        type="checkbox"
                      />
                    </td>
                    <td>
                      {canManageMasterData ? (
                        <input className="management-input" type="date" value={dateInputValue(item.soldDate)} onChange={(event) => updateLkwLocal(item.id, { soldDate: event.target.value || null })} />
                      ) : item.soldDate ? item.soldDate.slice(0, 10) : "-"}
                    </td>
                    <td>
                      {canManageMasterData ? (
                        <input className="management-input" type="date" value={dateInputValue(item.returnedDate)} onChange={(event) => updateLkwLocal(item.id, { returnedDate: event.target.value || null })} />
                      ) : item.returnedDate ? item.returnedDate.slice(0, 10) : "-"}
                    </td>
                    {canManageMasterData ? (
                      <td>
                        <button type="button" onClick={() => saveLkwItem(item)} disabled={managementBusy === item.id}>{t("save")}</button>
                      </td>
                    ) : null}
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
            <h2>{t("driverManagement")}</h2>
            <span className="muted">{filteredManagementDrivers.length} / {drivers.length}</span>
          </div>
          {canManageMasterData ? (
            <form className="management-create-form" onSubmit={createDriverItem}>
              <input value={newDriverName} onChange={(event) => setNewDriverName(event.target.value)} placeholder={t("driver")} required />
              <input value={newDriverPhone} onChange={(event) => setNewDriverPhone(event.target.value)} placeholder={t("phone")} />
              <select value={newDriverStatus} onChange={(event) => setNewDriverStatus(event.target.value)}>
                {masterStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <button type="submit" disabled={managementBusy === "create-driver"}>{t("createDriver")}</button>
            </form>
          ) : null}
          <input
            value={driverManagementFilter}
            onChange={(event) => setDriverManagementFilter(event.target.value)}
            placeholder={t("searchDriver")}
          />
          <div className="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>{t("driver")}</th>
                  <th>{t("phone")}</th>
                  <th>{t("company")}</th>
                  <th>{t("status")}</th>
                  <th>{t("active")}</th>
                  <th>{t("dismissDate")}</th>
                  {canManageMasterData ? <th>{t("action")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredManagementDrivers.map((item) => (
                  <tr key={item.id}>
                    <td>{item.externalId || "-"}</td>
                    <td>
                      {canManageMasterData ? (
                        <input className="management-input" value={item.fullName} onChange={(event) => updateDriverLocal(item.id, { fullName: event.target.value })} />
                      ) : item.fullName}
                    </td>
                    <td>
                      {canManageMasterData ? (
                        <input className="management-input" value={item.phone || ""} onChange={(event) => updateDriverLocal(item.id, { phone: event.target.value })} />
                      ) : item.phone || "-"}
                    </td>
                    <td>{item.company?.name || "-"}</td>
                    <td>
                      {canManageMasterData ? (
                        <select className="management-input" value={item.status} onChange={(event) => updateDriverLocal(item.id, { status: event.target.value })}>
                          {masterStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      ) : item.status}
                    </td>
                    <td>
                      <input
                        checked={item.isActive}
                        disabled={!canManageMasterData}
                        onChange={(event) => updateDriverLocal(item.id, { isActive: event.target.checked })}
                        type="checkbox"
                      />
                    </td>
                    <td>
                      {canManageMasterData ? (
                        <input className="management-input" type="date" value={dateInputValue(item.dismissedDate)} onChange={(event) => updateDriverLocal(item.id, { dismissedDate: event.target.value || null })} />
                      ) : item.dismissedDate ? item.dismissedDate.slice(0, 10) : "-"}
                    </td>
                    {canManageMasterData ? (
                      <td>
                        <button type="button" onClick={() => saveDriverItem(item)} disabled={managementBusy === item.id}>{t("save")}</button>
                      </td>
                    ) : null}
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
            <h2>{t("auditLog")}</h2>
            <span className="muted">{filteredAudit.length} / {audit.length}</span>
          </div>
          <input
            value={auditFilter}
            onChange={(event) => setAuditFilter(event.target.value)}
            placeholder={t("searchAudit")}
          />
          <div className="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th>{t("time")}</th>
                  <th>Event</th>
                  <th>{t("auftrag")}</th>
                  <th>Entity</th>
                  <th>{t("user")}</th>
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
                    <td colSpan={6}>{t("noAuditRows")}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
        </section>
      ) : null}

      {activeSection === "settings" && hasManagerAccess(user.role) ? (
        <section className="section-grid">
          <div className="list-panel audit-panel management-panel">
            <div className="panel-header">
              <h2>{t("settings")}</h2>
              <span className="muted">planning DB</span>
            </div>
            <form className="settings-form" onSubmit={saveSettings}>
              <label>
                {t("defaultCountry")}
                <select
                  disabled={user.role !== "ADMIN"}
                  value={settings.defaultCountry}
                  onChange={(event) => setSettings((current) => ({ ...current, defaultCountry: event.target.value }))}
                >
                  {countryOptions.map((country) => (
                    <option key={country.value} value={country.value}>{country.label}</option>
                  ))}
                </select>
              </label>
              <label>
                {t("defaultPeriod")}
                <select
                  disabled={user.role !== "ADMIN"}
                  value={settings.defaultPeriod}
                  onChange={(event) => setSettings((current) => ({ ...current, defaultPeriod: event.target.value as PeriodFilter }))}
                >
                  <option value="day">{t("day")}</option>
                  <option value="week">{t("week")}</option>
                  <option value="month">{t("month")}</option>
                </select>
              </label>
              <label>
                {t("rundeCount")}
                <input
                  disabled={user.role !== "ADMIN"}
                  min="1"
                  max="9"
                  type="number"
                  value={settings.rundeCount}
                  onChange={(event) => setSettings((current) => ({ ...current, rundeCount: event.target.value }))}
                />
              </label>
              <label>
                {t("holidayRegion")}
                <input
                  disabled={user.role !== "ADMIN"}
                  value={settings.holidayRegion}
                  onChange={(event) => setSettings((current) => ({ ...current, holidayRegion: event.target.value }))}
                />
              </label>
              {user.role === "ADMIN" ? (
                <button type="submit" disabled={settingsBusy}>{t("save")}</button>
              ) : null}
            </form>
          </div>
        </section>
      ) : null}

        {activeSection === "users" && user.role === "ADMIN" ? (
          <section className="section-grid">
          <div className="list-panel audit-panel management-panel">
            <div className="panel-header">
              <h2>{t("userManagement")}</h2>
              <span className="muted">{managedUsers.length} {t("users")}</span>
            </div>
            <form className="user-create-form" onSubmit={createUser}>
              <input
                type="email"
                value={newUserEmail}
                onChange={(event) => setNewUserEmail(event.target.value)}
                placeholder={t("email")}
                required
              />
              <input
                value={newUserDisplayName}
                onChange={(event) => setNewUserDisplayName(event.target.value)}
                placeholder={t("name")}
                required
              />
              <input
                type={showNewUserPassword ? "text" : "password"}
                value={newUserPassword}
                onChange={(event) => setNewUserPassword(event.target.value)}
                placeholder={t("temporaryPassword")}
                minLength={10}
                required
              />
              <button
                type="button"
                className="secondary-button"
                onClick={() => setShowNewUserPassword((current) => !current)}
              >
                {showNewUserPassword ? t("hide") : t("show")}
              </button>
              <select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value)}>
                <option value="VIEWER">VIEWER</option>
                <option value="OPERATOR">OPERATOR</option>
                <option value="MANAGER">MANAGER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <button type="submit" disabled={Boolean(userBusy)}>{t("createUser")}</button>
            </form>
            <div className="table-wrap compact-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("name")}</th>
                    <th>{t("email")}</th>
                    <th>{t("role")}</th>
                    <th>{t("password")}</th>
                    <th>{t("active")}</th>
                    <th>{t("lastLogin")}</th>
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
                        {resetPasswordUserId === item.id ? (
                          <div className="reset-password-row">
                            <input
                              type={showResetPassword ? "text" : "password"}
                              value={resetPassword}
                              onChange={(event) => setResetPassword(event.target.value)}
                              placeholder={t("newTemporaryPassword")}
                              minLength={10}
                            />
                            <button type="button" className="secondary-button" onClick={() => setShowResetPassword((current) => !current)}>
                              {showResetPassword ? t("hide") : t("show")}
                            </button>
                            <button type="button" onClick={() => resetManagedUserPassword(item.id)} disabled={Boolean(userBusy) || resetPassword.length < 10}>
                              {t("save")}
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => {
                                setResetPasswordUserId(null);
                                setResetPassword("");
                                setShowResetPassword(false);
                              }}
                            >
                              {t("cancel")}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="secondary-button"
                            disabled={Boolean(userBusy)}
                            onClick={() => {
                              setResetPasswordUserId(item.id);
                              setResetPassword("");
                              setShowResetPassword(false);
                            }}
                          >
                            {t("resetPassword")}
                          </button>
                        )}
                        {item.mustChangePassword ? <span className="muted">{t("passwordTemporaryActive")}</span> : null}
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

      {activeSection === "exports" ? (
        <section className="section-grid">
          <div className="list-panel management-panel">
            <div className="panel-header">
              <h2>{t("exporte")}</h2>
            </div>
            <div className="export-download-row">
              <a
                className="primary-button"
                href={`${apiBaseUrl}/api/exports/lkw-liste.xlsx`}
                download
              >
                ↓ {t("downloadLkwListe")}
              </a>
              <a
                className="primary-button"
                href={`${apiBaseUrl}/api/exports/fahrer-liste.xlsx`}
                download
              >
                ↓ {t("downloadFahrerListe")}
              </a>
            </div>
            <h3 className="export-history-heading">{t("exportHistory")}</h3>
            <div className="table-wrap compact-table">
              <table>
                <thead>
                  <tr>
                    <th>{t("time")}</th>
                    <th>{t("type")}</th>
                    <th>Format</th>
                    <th>{t("user")}</th>
                    <th>Filters</th>
                  </tr>
                </thead>
                <tbody>
                  {exportHistory.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.createdAt).toLocaleString()}</td>
                      <td>{item.exportType}</td>
                      <td>{item.format.toUpperCase()}</td>
                      <td>{item.createdBy ?? "—"}</td>
                      <td className="export-filters-cell">
                        {Object.entries(item.filters)
                          .filter(([, v]) => v !== null && v !== undefined && v !== "")
                          .map(([k, v]) => `${k}=${String(v)}`)
                          .join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                  {exportHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">{t("loading")}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {activeSection === "kalender" ? (
        <section className="section-grid kalender-section">
          <KalenderView
            apiBase={apiBaseUrl}
            canEdit={user.role === "ADMIN" || user.role === "OPERATOR" || user.role === "MANAGER"}
          />
        </section>
      ) : null}
    </main>
  );
}
