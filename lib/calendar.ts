// ============================================================
// ECONOMIC CALENDAR — Real event data for trading
// ============================================================

export interface CalendarEvent {
  id: string;
  title: string;
  country: string;
  impact: "low" | "medium" | "high";
  datetime: Date;
  forecast?: string;
  previous?: string;
  actual?: string;
}

export interface UpcomingEvent {
  event: CalendarEvent;
  minutesUntil: number;
}

// Cache for calendar events
let cachedEvents: CalendarEvent[] = [];
let cacheExpiry = 0;
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Known high-impact recurring events (fallback when API unavailable)
const RECURRING_EVENTS = {
  // NFP: First Friday of each month at 13:30 UTC
  NFP: { title: "Non-Farm Payrolls", impact: "high" as const, hour: 13, minute: 30 },
  // CPI: Typically 10th-13th of month at 13:30 UTC
  CPI: { title: "CPI m/m", impact: "high" as const, hour: 13, minute: 30 },
  // Jobless Claims: Every Thursday at 13:30 UTC
  CLAIMS: { title: "Unemployment Claims", impact: "medium" as const, hour: 13, minute: 30 },
  // FOMC Rate Decision: 8x/year at 19:00 UTC
  FOMC: { title: "FOMC Rate Decision", impact: "high" as const, hour: 19, minute: 0 },
};

// Known FOMC dates for 2025-2026
const FOMC_DATES = [
  "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18",
  "2025-07-30", "2025-09-17", "2025-11-05", "2025-12-17",
  "2026-01-28", "2026-03-18", "2026-05-06", "2026-06-17",
  "2026-07-29", "2026-09-16", "2026-11-04", "2026-12-16",
];

/**
 * Generates recurring events for fallback calendar
 */
function generateRecurringEvents(now: Date): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  // Check current and next month
  for (let mo = m; mo <= m + 1; mo++) {
    const month = mo % 12;
    const year = mo > 11 ? y + 1 : y;

    // NFP: First Friday of month
    let nfpDay = 1;
    while (new Date(Date.UTC(year, month, nfpDay)).getUTCDay() !== 5) nfpDay++;
    events.push({
      id: `nfp-${year}-${month}`,
      title: RECURRING_EVENTS.NFP.title,
      country: "USD",
      impact: RECURRING_EVENTS.NFP.impact,
      datetime: new Date(Date.UTC(year, month, nfpDay, RECURRING_EVENTS.NFP.hour, RECURRING_EVENTS.NFP.minute)),
    });

    // CPI: Approximately 12th of month
    events.push({
      id: `cpi-${year}-${month}`,
      title: RECURRING_EVENTS.CPI.title,
      country: "USD",
      impact: RECURRING_EVENTS.CPI.impact,
      datetime: new Date(Date.UTC(year, month, 12, RECURRING_EVENTS.CPI.hour, RECURRING_EVENTS.CPI.minute)),
    });

    // Jobless Claims: Every Thursday
    for (let d = 1; d <= 28; d++) {
      if (new Date(Date.UTC(year, month, d)).getUTCDay() === 4) {
        events.push({
          id: `claims-${year}-${month}-${d}`,
          title: RECURRING_EVENTS.CLAIMS.title,
          country: "USD",
          impact: RECURRING_EVENTS.CLAIMS.impact,
          datetime: new Date(Date.UTC(year, month, d, RECURRING_EVENTS.CLAIMS.hour, RECURRING_EVENTS.CLAIMS.minute)),
        });
      }
    }
  }

  // FOMC dates
  for (const dateStr of FOMC_DATES) {
    const [fy, fm, fd] = dateStr.split("-").map(Number);
    events.push({
      id: `fomc-${dateStr}`,
      title: RECURRING_EVENTS.FOMC.title,
      country: "USD",
      impact: RECURRING_EVENTS.FOMC.impact,
      datetime: new Date(Date.UTC(fy, fm - 1, fd, RECURRING_EVENTS.FOMC.hour, RECURRING_EVENTS.FOMC.minute)),
    });
  }

  return events;
}

/**
 * Attempts to fetch real calendar data from ForexFactory or similar API
 * Falls back to recurring events if unavailable
 */
export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  const now = Date.now();

  // Return cached events if still valid
  if (cachedEvents.length > 0 && now < cacheExpiry) {
    return cachedEvents;
  }

  try {
    // Try to fetch from ForexFactory JSON feed
    // Note: This URL may need to be proxied or use a different API in production
    const response = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json();
      const events: CalendarEvent[] = [];

      for (const item of data) {
        // Only include USD events for gold correlation
        if (item.country !== "USD") continue;

        const impact = item.impact === "High" ? "high" :
                       item.impact === "Medium" ? "medium" : "low";

        // Parse date and time
        const datetime = new Date(`${item.date}T${item.time || "00:00"}:00Z`);

        events.push({
          id: `ff-${item.date}-${item.title}`,
          title: item.title,
          country: item.country,
          impact,
          datetime,
          forecast: item.forecast,
          previous: item.previous,
          actual: item.actual,
        });
      }

      cachedEvents = events;
      cacheExpiry = now + CACHE_DURATION_MS;
      return events;
    }
  } catch (error) {
    console.warn("Calendar fetch failed, using fallback:", error);
  }

  // Fallback to recurring events
  cachedEvents = generateRecurringEvents(new Date());
  cacheExpiry = now + CACHE_DURATION_MS;
  return cachedEvents;
}

/**
 * Gets the next upcoming high-impact events
 */
export async function getUpcomingEvents(limit = 5): Promise<UpcomingEvent[]> {
  const events = await fetchCalendarEvents();
  const now = Date.now();

  return events
    .filter(e => e.datetime.getTime() > now && e.impact !== "low")
    .map(e => ({
      event: e,
      minutesUntil: Math.round((e.datetime.getTime() - now) / 60000),
    }))
    .sort((a, b) => a.minutesUntil - b.minutesUntil)
    .slice(0, limit);
}

/**
 * Gets minutes until the next high-impact event
 */
export async function getMinutesToNextHighImpact(): Promise<number | null> {
  const upcoming = await getUpcomingEvents(1);

  // Only consider high-impact events for trading restrictions
  const highImpact = upcoming.filter(u => u.event.impact === "high");

  if (highImpact.length === 0) return null;
  return highImpact[0].minutesUntil;
}

/**
 * Synchronous version using cached data only (for hot path)
 */
export function getMinutesToNextEventSync(): number | null {
  if (cachedEvents.length === 0) {
    // Generate fallback if no cache
    cachedEvents = generateRecurringEvents(new Date());
    cacheExpiry = Date.now() + CACHE_DURATION_MS;
  }

  const now = Date.now();
  let closest = Infinity;

  for (const event of cachedEvents) {
    if (event.impact !== "high") continue;
    const diff = (event.datetime.getTime() - now) / 60000;
    if (diff > 0 && diff < closest) {
      closest = diff;
    }
  }

  return closest === Infinity ? null : Math.round(closest);
}

/**
 * Gets event risk level based on time to next high-impact event
 */
export function getEventRiskLevel(minutesToEvent: number | null): "none" | "low" | "moderate" | "high" | "critical" {
  if (minutesToEvent === null) return "none";
  if (minutesToEvent >= 120) return "low";
  if (minutesToEvent >= 60) return "moderate";
  if (minutesToEvent >= 30) return "high";
  return "critical";
}
