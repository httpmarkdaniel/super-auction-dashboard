// Campaign schedule for the Interactive Calendar page, transcribed from
// "HRH_Online_Campaign_Calendar.html" (the marketing team's September 2026
// calendar). Static for now: there is no campaign table in the warehouse
// yet, so new months are added here until one exists.
//
// `strong` marks the headline launch of a campaign week (drawn solid, and
// counted as an "upcoming launch"). `variant` overrides the platform color
// for special events: yellow = on-ground/branch event, purple = double-day
// sale, crm = payday sale.

export const PLATFORMS = {
  hmr: { name: "HMR Retail", short: "HMR" },
  shopee: { name: "Shopee", short: "SHOPEE" },
  tiktok: { name: "TikTok Shop", short: "TIKTOK SHOP" },
  crm: { name: "CRM / Email / SMS", short: "CRM" },
};

// [date, title, platform, extras]
const SEPTEMBER_2026 = [
  ["2026-09-01", "TuesYourself", "hmr", { objective: "Launch weekly TuesYourself savings and conversion push." }],
  ["2026-09-01", "FINDMAS Launch", "hmr", { strong: true, objective: "Kick off FINDMAS: 12 Weeks of Christmas." }],
  ["2026-09-01", "Shopee: Unli Free Shipping", "shopee", { objective: "Drive Shopee traffic with free shipping and BNPL." }],
  ["2026-09-01", "9.9 Prehype Sale", "shopee"],
  ["2026-09-02", "Negosyo Finds", "hmr"],
  ["2026-09-02", "Fashion Wednesday", "shopee"],
  ["2026-09-03", "TFT", "hmr"],
  ["2026-09-04", "TikTok Shop 9.9", "tiktok"],
  ["2026-09-05", "Teachers' Day Special", "hmr"],
  ["2026-09-07", "Shopee VIP Monday", "shopee"],
  ["2026-09-08", "FINDMAS W1 - TuesYourself", "hmr", { strong: true }],
  ["2026-09-08", "9.9 Prehype Sale", "shopee"],
  ["2026-09-08", "EMAIL: FINDMAS Week 1", "crm"],
  ["2026-09-09", "Negosyo Finds", "hmr"],
  ["2026-09-09", "9.9 Double Digit Sale", "hmr", { variant: "purple" }],
  ["2026-09-09", "9.9 Spike Day", "shopee"],
  ["2026-09-09", "TikTok Shop 9.9", "tiktok"],
  ["2026-09-10", "TFT", "hmr"],
  ["2026-09-10", "9.9 Double Digit Sale", "hmr", { variant: "purple" }],
  ["2026-09-10", "PHILBEX Cebu", "hmr", { variant: "yellow" }],
  ["2026-09-10", "9.9 Sale (Extended)", "shopee"],
  ["2026-09-11", "PHILBEX Cebu", "hmr", { variant: "yellow" }],
  ["2026-09-12", "PHILBEX Cebu", "hmr", { variant: "yellow" }],
  ["2026-09-13", "PHILBEX Cebu", "hmr", { variant: "yellow" }],
  ["2026-09-13", "Payday Sale Sneak Peek", "shopee"],
  ["2026-09-13", "Shopee Supermarket", "shopee"],
  ["2026-09-13", "Home Care Sunday", "tiktok"],
  ["2026-09-14", "Mid-Month Payday Sale", "hmr", { variant: "crm" }],
  ["2026-09-14", "Payday Sale Sneak Peek", "shopee"],
  ["2026-09-14", "Shopee VIP Monday", "shopee"],
  ["2026-09-14", "Funtastic Payday", "tiktok"],
  [
    "2026-09-15",
    "FINDMAS W2 - TuesYourself",
    "hmr",
    {
      strong: true,
      end: "2026-09-16",
      objective: "Drive mid-month sales with FINDMAS Week 2 and promote TuesYourself deals.",
      description:
        "Continuation of the FINDMAS campaign, featuring TuesYourself deals across select categories. Focus on driving mid-month traffic and conversions.",
      tags: ["FINDMAS", "TuesYourself", "Mid-Month"],
    },
  ],
  ["2026-09-15", "Mid-Month Payday Sale", "hmr", { variant: "crm" }],
  ["2026-09-15", "Payday Sale (Spike Day)", "shopee"],
  ["2026-09-15", "Funtastic Payday", "tiktok"],
  ["2026-09-15", "SMS: Tuesday TuesYourself", "crm"],
  ["2026-09-16", "Negosyo Finds", "hmr"],
  ["2026-09-16", "Mid-Month Payday Sale", "hmr", { variant: "crm" }],
  ["2026-09-16", "Fashion Wednesday", "shopee"],
  ["2026-09-16", "Funtastic Payday", "tiktok"],
  ["2026-09-17", "TFT", "hmr"],
  ["2026-09-17", "Friday FRIYAY", "tiktok"],
  ["2026-09-18", "Shopee Beauty Fair", "shopee"],
  ["2026-09-18", "Friday FRIYAY", "tiktok"],
  ["2026-09-18", "Buy Local Shop Local", "tiktok"],
  ["2026-09-19", "HMR Sucat & CDO Anniversary", "hmr", { variant: "yellow" }],
  ["2026-09-19", "Shopee Beauty Fair", "shopee"],
  ["2026-09-20", "Shopee Styles Sale", "shopee"],
  ["2026-09-20", "TikTok Shop Mega Day Sale", "tiktok"],
  ["2026-09-21", "National Family Week", "hmr"],
  ["2026-09-21", "Shopee Styles Sale", "shopee"],
  ["2026-09-21", "Shopee VIP Monday", "shopee"],
  ["2026-09-22", "FINDMAS W3 - TuesYourself", "hmr", { strong: true }],
  ["2026-09-22", "Mom's Club Members", "shopee"],
  ["2026-09-22", "PUSH: App Doorbuster Push", "crm", { variant: "yellow" }],
  ["2026-09-23", "Negosyo Finds", "hmr"],
  ["2026-09-23", "Fashion Wednesday", "shopee"],
  ["2026-09-24", "TFT", "hmr"],
  ["2026-09-24", "Payday Sale Sneak Peek", "shopee"],
  ["2026-09-24", "Buy Local Shop Local", "tiktok"],
  ["2026-09-24", "TikTok Shop Mega Day Sale", "tiktok"],
  ["2026-09-24", "Friday FRIYAY", "tiktok"],
  ["2026-09-25", "Payday Sale Sneak Peek", "shopee"],
  ["2026-09-25", "25th Mall Day", "shopee"],
  ["2026-09-25", "Friday FRIYAY", "tiktok"],
  ["2026-09-26", "Payday Prehype - 10.10", "shopee"],
  ["2026-09-27", "National Family Week", "hmr"],
  ["2026-09-27", "Payday Prehype", "shopee"],
  ["2026-09-27", "10.10 Sneak Peek", "shopee"],
  ["2026-09-27", "Funtastic Payday", "tiktok"],
  ["2026-09-28", "End-Month Payday Sale", "hmr", { variant: "crm" }],
  ["2026-09-28", "Payday Prehype", "shopee"],
  ["2026-09-28", "10.10 Sneak Peek", "shopee"],
  ["2026-09-28", "Shopee VIP Monday", "shopee"],
  ["2026-09-28", "Funtastic Payday", "tiktok"],
  ["2026-09-29", "FINDMAS W4 - TuesYourself", "hmr", { strong: true }],
  ["2026-09-29", "End-Month Payday Sale", "hmr", { variant: "crm" }],
  ["2026-09-29", "Payday Prehype", "shopee"],
  ["2026-09-29", "10.10 Sneak Peek", "shopee"],
  ["2026-09-29", "Funtastic Payday", "tiktok"],
  ["2026-09-30", "Negosyo Finds", "hmr"],
  ["2026-09-30", "End-Month Payday Sale", "hmr", { variant: "crm" }],
  ["2026-09-30", "Shopee: Unli Free Shipping", "shopee"],
  ["2026-09-30", "10.10 Sneak Peek", "shopee"],
  ["2026-09-30", "Payday Sale (Spike Day)", "shopee"],
];

export const CAMPAIGN_EVENTS = SEPTEMBER_2026.map(([date, title, platform, extras = {}], i) => ({
  id: `${date}-${i}`,
  date,
  title,
  platform,
  ...extras,
}));

// Multi-week campaigns shown in the "Continuous campaigns" band for any
// month they overlap. `date`/`end` match the single-day campaigns above so
// both kinds go through the same editor.
const CONTINUOUS = [
  [
    "TUESDAY TUESYOURSELF",
    "hmr",
    "2026-09-08",
    "2027-01-26",
    {
      tagline: "Treat yourself to curated weekly Tuesday discoveries.",
      campaignType: "Brand Campaign",
      category: "Brand Campaign",
      priority: "High Priority",
      status: "Upcoming",
      description:
        "Master ongoing recurring HMR campaign property. Integrated into FINDMAS (Sep 8 - Nov 24), paused in December for peak Christmas campaigns, and returns as standalone recurring campaign starting Jan 5, 2027.",
      scopeType: "chainwide",
      onlineComponent: true,
      channels: ["HMR.PH", "TikTok Shop", "Email", "Facebook", "Viber"],
      planningStart: "2026-08-15",
      teaserDate: "2026-08-31",
      strategicHook: "Weekly Tuesday self-reward cadence building consistent shopping habits across branches and online.",
      tracking: { sms: "Scheduled", appNotif: "Scheduled", appPush: "Sent (Live)" },
      postingLinks: [
        { platform: "Facebook", url: "https://facebook.com/HMRTradingHaus/posts/tuesyourself-sep8" },
        { platform: "TikTok", url: "https://tiktok.com/@hmrph/video/tuesday-finds-preview" },
      ],
      recurring: true,
      frequency: "Weekly",
      cadence: "Tuesday",
      recurringState: "SEASONALLY INTEGRATED",
      parentCampaign: "FINDMAS: 12 WEEKS OF CHRISTMAS",
      repeatInterval: 1,
      recurrenceStart: "2026-09-08",
      recurrenceEnd: "2027-01-26",
      occurrences: 16,
      recurrenceNotes: "Sep 8-Nov 24: Seasonally Integrated with FINDMAS. Dec: Paused. Jan 5 onward: Standalone Active.",
    },
  ],
  ["NEGOSYO FINDS", "hmr", "2026-09-02", "2027-01-27", { recurring: true, frequency: "Weekly", cadence: "Wednesday" }],
  ["TFT: TECH FIND THURSDAY", "hmr", "2026-09-03", "2027-01-28", { recurring: true, frequency: "Weekly", cadence: "Thursday" }],
  ["PAYDAY FINDS", "hmr", "2026-09-14", "2027-01-31", { recurring: true, frequency: "Semi-monthly", cadence: "15th and 30th" }],
  ["FINDMAS: 12 WEEKS OF CHRISTMAS", "hmr", "2026-09-08", "2026-11-24", { campaignType: "Seasonal Campaign", category: "Seasonal Campaign", priority: "High Priority" }],
  ["NATIONAL FAMILY WEEK", "hmr", "2026-09-21", "2026-09-27", { campaignType: "Seasonal Campaign", category: "Seasonal Campaign" }],
  ["Unli Free Shipping & SPayLater 0% BNPL", "shopee", "2026-09-01", "2026-09-30", {}],
  ["9.9 Prehype Sale", "shopee", "2026-09-01", "2026-09-08", { campaignType: "Mega Sale", category: "Mega Sale" }],
  ["TikTok Shop 9.9", "tiktok", "2026-09-04", "2026-09-09", { campaignType: "Mega Sale", category: "Mega Sale" }],
  ["Buy Local Shop Local", "tiktok", "2026-09-18", "2026-09-24", {}],
];

export const CONTINUOUS_CAMPAIGNS = CONTINUOUS.map(([title, platform, date, end, extras], i) => ({
  id: `continuous-${i}`,
  continuous: true,
  title,
  platform,
  date,
  end,
  ...extras,
}));

// ---- Campaign editor options ----

export const CAMPAIGN_TYPES = [
  "Brand Campaign",
  "Seasonal Campaign",
  "Sale Event",
  "Payday Sale",
  "Mega Sale",
  "Marketplace Campaign",
  "Branch Event",
  "CRM Blast",
];
export const PRIORITIES = ["High Priority", "Medium Priority", "Low Priority"];
export const STATUSES = ["Draft", "Upcoming", "Active", "Paused", "Ended"];

export const HMR_BRANCHES = [
  "Pioneer, Mandaluyong",
  "Cainta / S&C Cainta",
  "Sucat",
  "North Caloocan",
  "Mabalacat / Pampanga",
  "Subic",
  "Santa Rosa",
  "Cebu",
  "Cagayan de Oro (CDO)",
];

export const DIGITAL_CHANNELS = [
  "HMR.PH",
  "TikTok Shop",
  "Shopee",
  "Email",
  "Push Notifications",
  "Facebook",
  "Instagram",
  "TikTok",
  "Viber",
  "Live Commerce",
];

export const TRACKING_STATES = ["Not Needed", "Draft", "Scheduled", "Sent (Live)", "Failed"];
export const POSTING_PLATFORMS = ["Facebook", "Instagram", "TikTok", "YouTube", "Shopee", "TikTok Shop", "HMR.PH", "Viber"];
export const FREQUENCIES = ["Daily", "Weekly", "Bi-weekly", "Semi-monthly", "Monthly"];
export const RECURRING_STATES = ["ACTIVE", "SEASONALLY INTEGRATED", "PAUSED", "STANDALONE ACTIVE", "ENDED"];

// Sensible starting values for campaigns that were only transcribed as a
// date + title — what someone would otherwise have to fill in every time.
export function withCampaignDefaults(c) {
  const byVariant = { yellow: "Branch Event", purple: "Mega Sale", crm: "Payday Sale" };
  const type = c.campaignType || byVariant[c.variant] || (c.platform === "crm" ? "CRM Blast" : c.platform === "hmr" ? "Brand Campaign" : "Marketplace Campaign");
  const channelsByPlatform = { hmr: ["HMR.PH"], shopee: ["Shopee"], tiktok: ["TikTok Shop"], crm: ["Email", "Viber"] };
  return {
    tagline: "",
    campaignType: type,
    category: c.category || type,
    priority: c.strong ? "High Priority" : "Medium Priority",
    status: "",
    description: "",
    scopeType: c.platform === "hmr" && c.variant !== "yellow" ? "chainwide" : c.variant === "yellow" ? "selected" : "online",
    branches: [],
    onlineComponent: c.platform !== "hmr" || c.variant !== "yellow",
    channels: channelsByPlatform[c.platform] || [],
    planningStart: "",
    teaserDate: "",
    strategicHook: "",
    marketplaceNotes: "",
    tracking: { sms: "Not Needed", appNotif: "Not Needed", appPush: "Not Needed" },
    postingLinks: [],
    recurring: false,
    frequency: "Weekly",
    cadence: "",
    recurringState: "ACTIVE",
    parentCampaign: "",
    repeatInterval: 1,
    recurrenceStart: "",
    recurrenceEnd: "",
    occurrences: "",
    recurrenceNotes: "",
    ...c,
  };
}

// Month tabs across the top of the calendar (the campaign season).
export const SEASON_MONTHS = [
  { year: 2026, month: 8 },
  { year: 2026, month: 9 },
  { year: 2026, month: 10 },
  { year: 2026, month: 11 },
  { year: 2027, month: 0 },
];
