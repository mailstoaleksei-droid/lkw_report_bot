export type HolidayWarning = {
  date: string;
  name: string;
  region: "DE" | "HH";
  isNational: boolean;
};

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month, day);
}

export function getGermanHamburgHolidays(dateOnly: string): HolidayWarning[] {
  const year = Number(dateOnly.slice(0, 4));
  const easter = easterSunday(year);
  const holidays: HolidayWarning[] = [
    { date: dateKey(utcDate(year, 1, 1)), name: "New Year", region: "DE", isNational: true },
    { date: dateKey(addDays(easter, -2)), name: "Good Friday", region: "DE", isNational: true },
    { date: dateKey(addDays(easter, 1)), name: "Easter Monday", region: "DE", isNational: true },
    { date: dateKey(utcDate(year, 5, 1)), name: "Labor Day", region: "DE", isNational: true },
    { date: dateKey(addDays(easter, 39)), name: "Ascension Day", region: "DE", isNational: true },
    { date: dateKey(addDays(easter, 50)), name: "Whit Monday", region: "DE", isNational: true },
    { date: dateKey(utcDate(year, 10, 3)), name: "German Unity Day", region: "DE", isNational: true },
    { date: dateKey(utcDate(year, 12, 25)), name: "Christmas Day", region: "DE", isNational: true },
    { date: dateKey(utcDate(year, 12, 26)), name: "Second Christmas Day", region: "DE", isNational: true },
    { date: dateKey(utcDate(year, 10, 31)), name: "Reformation Day", region: "HH", isNational: false },
  ];

  return holidays.filter((holiday) => holiday.date === dateOnly);
}
