export const STORAGE_KEY = "nookspace:v2";
export const LEGACY_STORAGE_KEY = "nookspace:v1";
export const SESSION_KEY = "nookspace:session";

export const uid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

export function createBlock(type = "paragraph", text = "", extra = {}) {
  return { id: uid(), type, text, level: 0, checked: false, ...extra };
}

export function slugify(value) {
  const base = String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return base || "untitled";
}

function uniqueSlug(base, used) {
  let slug = base;
  let index = 2;
  while (used.has(slug)) slug = `${base}-${index++}`;
  used.add(slug);
  return slug;
}

export function ensureSlugs(state) {
  const usedTeamspaces = new Set();
  for (const teamspace of state.teamspaces) {
    teamspace.oldSlugs = Array.isArray(teamspace.oldSlugs) ? teamspace.oldSlugs : [];
    if (teamspace.slug) usedTeamspaces.add(teamspace.slug);
    else teamspace.slug = uniqueSlug(slugify(teamspace.name), usedTeamspaces);
  }

  const usedPages = new Set();
  for (const page of state.pages) {
    page.oldSlugs = Array.isArray(page.oldSlugs) ? page.oldSlugs : [];
    if (page.slug) usedPages.add(page.slug);
    else page.slug = uniqueSlug(slugify(page.title), usedPages);
  }

  return state;
}

export function findPageBySlug(state, slug) {
  const needle = String(slug || "").toLowerCase();
  return (
    state.pages.find(
      (page) => page.slug === needle || (page.oldSlugs || []).includes(needle)
    ) ?? null
  );
}

export function findTeamspaceBySlug(state, slug) {
  const needle = String(slug || "").toLowerCase();
  return (
    state.teamspaces.find(
      (teamspace) => teamspace.slug === needle || (teamspace.oldSlugs || []).includes(needle)
    ) ?? null
  );
}

export function updatePageSlug(state, page) {
  if (!page) return;
  const base = slugify(page.title);
  if (base === page.slug) return;
  const used = new Set();
  for (const item of state.pages) {
    if (item === page) continue;
    if (item.slug) used.add(item.slug);
    for (const old of item.oldSlugs || []) used.add(old);
  }
  page.oldSlugs = Array.isArray(page.oldSlugs) ? page.oldSlugs : [];
  if (page.slug) page.oldSlugs = [...new Set([...page.oldSlugs, page.slug])].slice(-8);
  page.slug = uniqueSlug(base, used);
}

export function updateTeamspaceSlug(state, teamspace) {
  if (!teamspace) return;
  const base = slugify(teamspace.name);
  if (base === teamspace.slug) return;
  const used = new Set();
  for (const item of state.teamspaces) {
    if (item === teamspace) continue;
    if (item.slug) used.add(item.slug);
    for (const old of item.oldSlugs || []) used.add(old);
  }
  teamspace.oldSlugs = Array.isArray(teamspace.oldSlugs) ? teamspace.oldSlugs : [];
  if (teamspace.slug) {
    teamspace.oldSlugs = [...new Set([...teamspace.oldSlugs, teamspace.slug])].slice(-8);
  }
  teamspace.slug = uniqueSlug(base, used);
}

const now = Date.now();

export const SEED_TEAMSPACES = [
  {
    id: "ts-ramp",
    name: "Ramp HQ",
    icon: "🏢",
    color: "#2f6b4f",
    description: "Product, design, and launch planning. The home base for everything we ship.",
    members: [
      {
        name: "Alex Morgan",
        initials: "AM",
        color: "#2383e2",
        email: "alex.morgan@ramp.co",
        role: "Admin",
      },
      {
        name: "Mia Chen",
        initials: "MC",
        color: "#d9730d",
        email: "mia.chen@ramp.co",
        role: "Member",
      },
      {
        name: "Ari Patel",
        initials: "AP",
        color: "#4dab9a",
        email: "ari.patel@ramp.co",
        role: "Member",
      },
    ],
  },
  {
    id: "ts-growth",
    name: "Growth",
    icon: "📈",
    color: "#7a4a1f",
    description: "Campaigns, experiments, content, and the ideas that bring new people in.",
    members: [
      {
        name: "Alex Morgan",
        initials: "AM",
        color: "#2383e2",
        email: "alex.morgan@ramp.co",
        role: "Admin",
      },
      {
        name: "Noah Williams",
        initials: "NW",
        color: "#8a5a3b",
        email: "noah.williams@ramp.co",
        role: "Member",
      },
    ],
  },
];

const MEMBER_EMAIL_FALLBACKS = {
  "alex morgan": "alex.morgan@ramp.co",
  "mia chen": "mia.chen@ramp.co",
  "ari patel": "ari.patel@ramp.co",
  "noah williams": "noah.williams@ramp.co",
};

function normalizeMember(member = {}, index = 0) {
  const source = member && typeof member === "object" ? member : {};
  const name = String(source.name || "").trim() || "Member";
  const email = String(
    source.email || MEMBER_EMAIL_FALLBACKS[name.toLowerCase()] || ""
  )
    .trim()
    .toLowerCase();
  const role =
    source.role === "Admin" || source.role === "Member"
      ? source.role
      : index === 0
        ? "Admin"
        : "Member";
  return {
    id: typeof source.id === "string" && source.id ? source.id : uid(),
    name,
    email,
    initials: source.initials || initials(name),
    color: source.color || avatarColor(email || name),
    role,
  };
}

export const SEED_PAGES = [
  {
    id: "page-ramp-hq",
    title: "Ramp HQ",
    icon: "🏢",
    cover: 0,
    section: "teamspace",
    teamspaceId: "ts-ramp",
    parentId: null,
    favorite: true,
    updatedAt: now,
    trashedAt: null,
    comments: [
      {
        id: "comment-q4-kickoff",
        text: "Kicking off Q4 planning here. Add your priorities before Friday.",
        author: { name: "Mia Chen", initials: "MC", color: "#d9730d" },
        createdAt: now - 1000 * 60 * 90,
        resolved: false,
      },
    ],
    blocks: [
      createBlock("callout", "<strong>Welcome to your workspace.</strong> This is a live demo of the editor — type, drag blocks, and press / anywhere to insert something.", { emoji: "✦" }),
      createBlock("h2", "Team priorities"),
      createBlock("todo", "Ship the new spend dashboard"),
      createBlock("todo", "Review onboarding flow", { checked: true }),
      createBlock("todo", "Publish Q4 roadmap"),
      createBlock("h3", "This week"),
      createBlock("bulleted", "Design review — Tuesday 10:00"),
      createBlock("bulleted", "Eng kickoff — Wednesday 12:00"),
      createBlock("quote", "We stay small by making the workspace do the work."),
      createBlock("divider"),
      createBlock("h3", "Launch checklist"),
      createBlock("numbered", "Freeze scope"),
      createBlock("numbered", "Run the accessibility audit"),
      createBlock("numbered", "Ship to 10% of workspaces"),
      createBlock("code", 'const launch = await notion.pages.create({\n  parent: { database_id: ROADMAP },\n  properties: { Status: { select: { name: "Shipped" } } }\n});', { language: "javascript" }),
    ],
  },
  {
    id: "page-getting-started",
    title: "Getting started",
    icon: "👋",
    cover: null,
    section: "private",
    teamspaceId: null,
    parentId: null,
    favorite: false,
    updatedAt: now - 1000 * 60 * 60 * 26,
    trashedAt: null,
    blocks: [
      createBlock("paragraph", "Everything here works like Notion — type, drag, and press <code>/</code> to insert blocks."),
      createBlock("h2", "Try it"),
      createBlock("bulleted", "Click anywhere and start typing."),
      createBlock("bulleted", "Type <code>/</code> on an empty line for the block menu."),
      createBlock("bulleted", "Select text for the formatting toolbar."),
      createBlock("bulleted", "Press <code>Tab</code> to indent list items."),
      createBlock("callout", "Create a teamspace from the sidebar to group pages for a team or project.", { emoji: "🚀" }),
      createBlock("h2", "Keyboard shortcuts"),
      createBlock("code", "Enter            new block\nBackspace        merge with previous\nTab / Shift+Tab  indent / outdent\n⌘K               search\n⌘J               new private page\n⌘⇧N              new teamspace\n⌘B / ⌘I          bold / italic", { language: "plain text" }),
    ],
  },
  {
    id: "page-product-roadmap",
    title: "Product roadmap",
    icon: "🗺️",
    cover: 1,
    section: "teamspace",
    teamspaceId: "ts-ramp",
    parentId: null,
    favorite: false,
    updatedAt: now - 1000 * 60 * 60 * 3,
    trashedAt: null,
    blocks: [
      createBlock("paragraph", "A single source of truth for what we are building and why."),
      createBlock("h2", "Now"),
      createBlock("todo", "Spend controls v2"),
      createBlock("todo", "Support inbox for the team"),
      createBlock("todo", "Mobile quick capture"),
      createBlock("h2", "Next"),
      createBlock("todo", "Per-workspace model routing"),
      createBlock("todo", "Audit log exports"),
      createBlock("h2", "Later"),
      createBlock("todo", "Offline editing"),
    ],
  },
  {
    id: "page-design-system",
    title: "Design system",
    icon: "🎨",
    cover: null,
    section: "teamspace",
    teamspaceId: "ts-ramp",
    parentId: "page-product-roadmap",
    favorite: false,
    updatedAt: now - 1000 * 60 * 60 * 8,
    trashedAt: null,
    blocks: [
      createBlock("paragraph", "Tokens, components, and the rules that keep the product consistent."),
      createBlock("h3", "Color"),
      createBlock("bulleted", "Ink 900 — primary text"),
      createBlock("bulleted", "Blue 500 — actions and links"),
      createBlock("bulleted", "Green 100 — success and highlights"),
      createBlock("h3", "Type"),
      createBlock("code", "--font-sans: Inter, -apple-system, Segoe UI\n--text-base: 16px / 1.5\n--text-title: 40px / 1.2", { language: "css" }),
    ],
  },
  {
    id: "page-growth-experiments",
    title: "Growth experiments",
    icon: "🧪",
    cover: 2,
    section: "teamspace",
    teamspaceId: "ts-growth",
    parentId: null,
    favorite: false,
    updatedAt: now - 1000 * 60 * 60 * 12,
    trashedAt: null,
    blocks: [
      createBlock("paragraph", "Running list of experiments, the hypothesis behind each, and what we learned."),
      createBlock("h2", "This quarter"),
      createBlock("todo", "Referral loop v2", { checked: true }),
      createBlock("todo", "Onboarding email sequence"),
      createBlock("todo", "Template gallery SEO page"),
      createBlock("callout", "Rule of thumb: five interviews before a single line of copy.", { emoji: "🧠" }),
    ],
  },
  {
    id: "page-growth-calendar",
    title: "Campaign calendar",
    icon: "🗓️",
    cover: null,
    section: "teamspace",
    teamspaceId: "ts-growth",
    parentId: null,
    favorite: false,
    updatedAt: now - 1000 * 60 * 55,
    trashedAt: null,
    blocks: [
      createBlock("h2", "October"),
      createBlock("bulleted", "Oct 8 — launch teaser"),
      createBlock("bulleted", "Oct 15 — customer story"),
      createBlock("bulleted", "Oct 24 — webinar"),
      createBlock("h2", "Owners"),
      createBlock("todo", "Draft webinar outline"),
      createBlock("todo", "Collect three customer quotes"),
    ],
  },
  {
    id: "page-weekly-sync",
    title: "Weekly sync notes",
    icon: "📝",
    cover: null,
    section: "private",
    teamspaceId: null,
    parentId: null,
    favorite: false,
    updatedAt: now - 1000 * 60 * 42,
    trashedAt: null,
    blocks: [
      createBlock("h3", "Friday, Oct 17"),
      createBlock("bulleted", "Onboarding drop-off is down 18% after removing step 3."),
      createBlock("bulleted", "Support volume up slightly — mostly billing questions."),
      createBlock("bulleted", "Agent triage is live for 20% of tickets."),
      createBlock("h3", "Follow-ups"),
      createBlock("todo", "Share the updated funnel with the team"),
      createBlock("todo", "Draft the billing FAQ"),
    ],
  },
  {
    id: "page-reading-list",
    title: "Reading list",
    icon: "📚",
    cover: null,
    section: "private",
    teamspaceId: null,
    parentId: null,
    favorite: false,
    updatedAt: now - 1000 * 60 * 60 * 60,
    trashedAt: null,
    blocks: [
      createBlock("bulleted", "The Design of Everyday Things — Don Norman"),
      createBlock("bulleted", "Thinking in Systems — Donella Meadows"),
      createBlock("bulleted", "The Mom Test — Rob Fitzpatrick"),
      createBlock("bulleted", "Working in Public — Nadia Eghbal"),
    ],
  },
];

export const PAGE_TEMPLATES = [
  {
    id: "meeting-notes",
    name: "Meeting notes",
    icon: "🗒️",
    description: "Agenda, decisions, and action items in one place.",
    title: "Meeting notes",
    blocks: [
      createBlock("callout", "<strong>Meeting:</strong> add the topic<br><strong>Date:</strong> today<br><strong>Attendees:</strong> you", { emoji: "🗒️" }),
      createBlock("h2", "Agenda"),
      createBlock("bulleted", "First topic"),
      createBlock("bulleted", "Second topic"),
      createBlock("h2", "Notes"),
      createBlock("paragraph", "Capture decisions, open questions, and useful context here."),
      createBlock("h2", "Action items"),
      createBlock("todo", "Owner — follow-up task"),
      createBlock("todo", "Share notes with the team"),
    ],
  },
  {
    id: "project-tracker",
    name: "Project tracker",
    icon: "🚀",
    description: "Goals, milestones, and risks for a project.",
    title: "Project tracker",
    blocks: [
      createBlock("callout", "<strong>Owner:</strong> you<br><strong>Status:</strong> planning", { emoji: "🚀" }),
      createBlock("h2", "Goal"),
      createBlock("paragraph", "What does success look like? Write one sentence."),
      createBlock("h2", "Milestones"),
      createBlock("todo", "Kickoff and scope"),
      createBlock("todo", "First review"),
      createBlock("todo", "Ship v1"),
      createBlock("h2", "Risks"),
      createBlock("bulleted", "Unknowns that could slow us down"),
    ],
  },
  {
    id: "weekly-review",
    name: "Weekly review",
    icon: "🗓️",
    description: "Reflect on wins, challenges, and next week.",
    title: "Weekly review",
    blocks: [
      createBlock("h2", "Wins"),
      createBlock("bulleted", "Something that went well"),
      createBlock("h2", "Challenges"),
      createBlock("bulleted", "Something that was harder than expected"),
      createBlock("h2", "Next week"),
      createBlock("todo", "Top priority"),
      createBlock("todo", "One thing to improve"),
    ],
  },
  {
    id: "reading-list",
    name: "Reading list",
    icon: "📚",
    description: "Books, articles, and notes worth keeping.",
    title: "Reading list",
    blocks: [
      createBlock("paragraph", "A running list of things worth reading — and what you took from them."),
      createBlock("h2", "To read"),
      createBlock("bulleted", "Title — author"),
      createBlock("h2", "Finished"),
      createBlock("bulleted", "Title — one-line takeaway"),
    ],
  },
  {
    id: "daily-journal",
    name: "Daily journal",
    icon: "🌤️",
    description: "A lightweight daily check-in.",
    title: "Daily journal",
    blocks: [
      createBlock("h3", "Today"),
      createBlock("paragraph", "What matters most today?"),
      createBlock("todo", "One meaningful task"),
      createBlock("h3", "Gratitude"),
      createBlock("bulleted", "Something good"),
      createBlock("callout", "Keep it small. A sentence is enough.", { emoji: "🌤️" }),
    ],
  },
  {
    id: "okrs",
    name: "OKRs",
    icon: "🎯",
    description: "Objectives and measurable key results.",
    title: "OKRs",
    blocks: [
      createBlock("h2", "Objective"),
      createBlock("callout", "A qualitative, inspiring goal for the quarter.", { emoji: "🎯" }),
      createBlock("h3", "Key results"),
      createBlock("todo", "Metric — from X to Y"),
      createBlock("todo", "Metric — from X to Y"),
      createBlock("todo", "Metric — from X to Y"),
    ],
  },
  {
    id: "content-calendar",
    name: "Content calendar",
    icon: "📅",
    description: "Plan ideas, drafts, and publish dates.",
    title: "Content calendar",
    blocks: [
      createBlock("h2", "Ideas"),
      createBlock("bulleted", "Idea — audience — angle"),
      createBlock("h2", "This month"),
      createBlock("todo", "Draft"),
      createBlock("todo", "Edit"),
      createBlock("todo", "Publish"),
      createBlock("h2", "Channels"),
      createBlock("bulleted", "Blog"),
      createBlock("bulleted", "Newsletter"),
      createBlock("bulleted", "Social"),
    ],
  },
  {
    id: "product-roadmap",
    name: "Product roadmap",
    icon: "🗺️",
    description: "Now, next, later — with owners.",
    title: "Product roadmap",
    blocks: [
      createBlock("paragraph", "A single source of truth for what we are building and why."),
      createBlock("h2", "Now"),
      createBlock("todo", "In progress"),
      createBlock("h2", "Next"),
      createBlock("todo", "Up next"),
      createBlock("h2", "Later"),
      createBlock("todo", "Not scheduled yet"),
    ],
  },
];

export function createPageFromTemplate(state, template, options = {}) {
  const page = createPage(state, {
    ...options,
    title: template.title,
    icon: template.icon,
  });
  page.blocks = template.blocks.map((block) => ({ ...structuredClone(block), id: uid() }));
  return page;
}

export function createDefaultState() {
  return ensureSlugs({
    version: 2,
    workspace: { name: "NookSpace" },
    theme: "light",
    activeView: { type: "page", id: "page-getting-started" },
    collapsedTeamspaces: [],
    syncedBlocks: {},
    teamspaces: SEED_TEAMSPACES.map((teamspace) => ({
      ...teamspace,
      members: teamspace.members.map(normalizeMember),
    })),
    pages: SEED_PAGES.map((page) => ({
      ...page,
      trashedAt: null,
      locked: false,
      fullWidth: false,
      smallText: false,
      font: "default",
      versions: [],
      lastVersionAt: 0,
      comments: (page.comments || []).map((comment) => ({
        ...comment,
        author: { ...comment.author },
      })),
      blocks: page.blocks.map((block) => ({ ...block, id: uid() })),
    })),
  });
}

function normalizePage(page, fallbackTeamspaceId) {
  const section = page.section === "teamspace" ? "teamspace" : "private";
  return {
    title: "",
    icon: "📄",
    cover: null,
    parentId: null,
    favorite: false,
    updatedAt: Date.now(),
    trashedAt: null,
    comments: [],
    blocks: [],
    locked: false,
    fullWidth: false,
    smallText: false,
    font: "default",
    versions: [],
    lastVersionAt: 0,
    ...page,
    section,
    teamspaceId: section === "teamspace" ? page.teamspaceId ?? fallbackTeamspaceId ?? null : null,
  };
}

function normalizeState(parsed) {
  const defaults = createDefaultState();
  const teamspaces = (Array.isArray(parsed.teamspaces) && parsed.teamspaces.length
    ? parsed.teamspaces
    : defaults.teamspaces
  ).map((teamspace) => ({
    ...teamspace,
    comments: Array.isArray(teamspace.comments) ? teamspace.comments : [],
    members: (Array.isArray(teamspace.members) ? teamspace.members : []).map(normalizeMember),
  }));

  const fallbackTeamspaceId = teamspaces[0]?.id ?? null;

  let activeView = parsed.activeView;
  if (!activeView) {
    activeView = parsed.activePageId
      ? { type: "page", id: parsed.activePageId }
      : defaults.activeView;
  }

  return ensureSlugs({
    ...defaults,
    ...parsed,
    version: 2,
    activeView,
    collapsedTeamspaces: Array.isArray(parsed.collapsedTeamspaces) ? parsed.collapsedTeamspaces : [],
    syncedBlocks:
      parsed.syncedBlocks && typeof parsed.syncedBlocks === "object" ? parsed.syncedBlocks : {},
    teamspaces,
    pages: (Array.isArray(parsed.pages) ? parsed.pages : defaults.pages).map((page) =>
      normalizePage(page, fallbackTeamspaceId)
    ),
  });
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const next = ensureValidView(normalizeState(JSON.parse(raw)));
      saveState(next);
      return next;
    }

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const next = ensureValidView(normalizeState(JSON.parse(legacy)));
      saveState(next);
      return next;
    }
  } catch {
    /* fall through to a clean workspace */
  }
  return ensureValidView(createDefaultState());
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage can be unavailable or full; the app keeps working in memory */
  }
}

/* ---------------- session ---------------- */
export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session || typeof session.email !== "string" || typeof session.name !== "string") return null;
    return session;
  } catch {
    return null;
  }
}

export function saveSession({ name, email, color }) {
  const normalizedEmail = email.trim().toLowerCase();
  const session = {
    name: name.trim(),
    email: normalizedEmail,
    color: color || avatarColor(normalizedEmail),
    createdAt: Date.now(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarColor(seed) {
  const palette = ["#2383e2", "#d9730d", "#4dab9a", "#8a5a3b", "#7a2f86", "#b07d2b", "#2f6b4f", "#4b5563"];
  let hash = 0;
  for (let i = 0; i < String(seed).length; i += 1) hash = (hash * 31 + String(seed).charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

/* ---------------- lookups ---------------- */
export function getPage(state, id) {
  return state.pages.find((page) => page.id === id) ?? null;
}

export function getTeamspace(state, id) {
  return state.teamspaces.find((teamspace) => teamspace.id === id) ?? null;
}

export function isLive(page) {
  return Boolean(page) && !page.trashedAt;
}

export function childPages(state, parentId, options = {}) {
  const { section, teamspaceId } = options;
  return state.pages.filter(
    (page) =>
      isLive(page) &&
      page.parentId === parentId &&
      (section ? page.section === section : true) &&
      (teamspaceId ? page.teamspaceId === teamspaceId : true)
  );
}

export function teamspacePages(state, teamspaceId, { rootsOnly = false } = {}) {
  return state.pages.filter(
    (page) =>
      isLive(page) &&
      page.section === "teamspace" &&
      page.teamspaceId === teamspaceId &&
      (rootsOnly ? page.parentId === null : true)
  );
}

export function trashedPages(state) {
  return state.pages.filter((page) => Boolean(page.trashedAt)).sort((a, b) => b.trashedAt - a.trashedAt);
}

export function livePages(state) {
  return state.pages.filter(isLive);
}

/* ---------------- pages ---------------- */
export function createPage(
  state,
  { section = "private", teamspaceId = null, parentId = null, title = "", icon = "📄" } = {}
) {
  const used = new Set();
  for (const item of state.pages) {
    if (item.slug) used.add(item.slug);
    for (const old of item.oldSlugs || []) used.add(old);
  }
  const page = {
    id: uid(),
    title,
    icon,
    cover: null,
    section,
    teamspaceId: section === "teamspace" ? teamspaceId : null,
    parentId,
    favorite: false,
    updatedAt: Date.now(),
    trashedAt: null,
    slug: uniqueSlug(slugify(title), used),
    oldSlugs: [],
    comments: [],
    locked: false,
    fullWidth: false,
    smallText: false,
    font: "default",
    versions: [],
    lastVersionAt: 0,
    blocks: [createBlock("paragraph")],
  };
  state.pages.unshift(page);
  return page;
}

export function duplicatePage(state, sourceId) {
  const source = getPage(state, sourceId);
  if (!source) return null;
  const used = new Set();
  for (const item of state.pages) {
    if (item.slug) used.add(item.slug);
    for (const old of item.oldSlugs || []) used.add(old);
  }
  const copy = {
    ...structuredClone(source),
    id: uid(),
    title: source.title ? `${source.title} (copy)` : "Untitled",
    favorite: false,
    trashedAt: null,
    updatedAt: Date.now(),
    slug: uniqueSlug(slugify(source.title ? `${source.title} copy` : "Untitled"), used),
    oldSlugs: [],
    comments: [],
    locked: false,
    versions: [],
    lastVersionAt: 0,
    blocks: source.blocks.map((block) => ({ ...block, id: uid() })),
  };
  const index = state.pages.findIndex((page) => page.id === sourceId);
  state.pages.splice(index + 1, 0, copy);
  return copy;
}

function descendantsOf(state, pageId) {
  const found = [];
  const walk = (id) => {
    for (const page of state.pages) {
      if (page.parentId === id) {
        found.push(page);
        walk(page.id);
      }
    }
  };
  walk(pageId);
  return found;
}

export function trashPage(state, pageId) {
  const page = getPage(state, pageId);
  if (!page) return [];
  const group = [page, ...descendantsOf(state, pageId)];
  const stamp = Date.now();
  for (const item of group) item.trashedAt = item.trashedAt ?? stamp;
  return group.map((item) => item.id);
}

export function restorePage(state, pageId) {
  const page = getPage(state, pageId);
  if (!page) return;
  const parent = page.parentId ? getPage(state, page.parentId) : null;
  if (parent && parent.trashedAt) page.parentId = null;
  page.trashedAt = null;
  for (const child of descendantsOf(state, pageId)) child.trashedAt = null;
}

export function purgePage(state, pageId) {
  const ids = new Set([pageId, ...descendantsOf(state, pageId).map((page) => page.id)]);
  state.pages = state.pages.filter((page) => !ids.has(page.id));
  if (state.activeView.type === "page" && ids.has(state.activeView.id)) {
    state.activeView = { type: "page", id: null };
  }
}

export function emptyTrash(state) {
  state.pages = state.pages.filter((page) => !page.trashedAt);
}

export function movePageTo(state, pageId, { section, teamspaceId }) {
  const page = getPage(state, pageId);
  if (!page) return;
  const group = [page, ...descendantsOf(state, pageId)];
  for (const item of group) {
    item.section = section;
    item.teamspaceId = section === "teamspace" ? teamspaceId : null;
  }
  page.parentId = null;
  page.updatedAt = Date.now();
}

/* ---------------- teamspaces ---------------- */
export function createTeamspace(state, { name, icon = "🚀", color = "#2f6b4f", description = "", members = [] }) {
  const used = new Set();
  for (const item of state.teamspaces) {
    if (item.slug) used.add(item.slug);
    for (const old of item.oldSlugs || []) used.add(old);
  }
  const teamspace = {
    id: uid(),
    name: name.trim() || "Untitled teamspace",
    icon,
    color,
    description: description.trim(),
    members,
    slug: uniqueSlug(slugify(name.trim() || "Untitled teamspace"), used),
    oldSlugs: [],
    comments: [],
    createdAt: Date.now(),
  };
  state.teamspaces.unshift(teamspace);
  return teamspace;
}

export function deleteTeamspace(state, teamspaceId) {
  const affected = state.pages.filter((page) => page.teamspaceId === teamspaceId);
  for (const page of affected) {
    page.section = "private";
    page.teamspaceId = null;
    page.parentId = null;
  }
  state.teamspaces = state.teamspaces.filter((teamspace) => teamspace.id !== teamspaceId);
  state.collapsedTeamspaces = state.collapsedTeamspaces.filter((id) => id !== teamspaceId);
  return affected.length;
}

export function pagesMovedToPrivate(state, teamspaceId) {
  return state.pages.filter((page) => page.teamspaceId === teamspaceId).length;
}

/* ---------------- views ---------------- */
export function ensureValidView(state) {
  const view = state.activeView ?? { type: "page", id: null };
  if (view.type === "teamspace") {
    if (getTeamspace(state, view.id)) return state;
  } else {
    const page = getPage(state, view.id);
    if (page && isLive(page)) return state;
    const fallbackPage = state.pages.find((item) => isLive(item));
    if (fallbackPage) {
      state.activeView = { type: "page", id: fallbackPage.id };
      return state;
    }
  }
  const teamspace = state.teamspaces[0];
  state.activeView = teamspace
    ? { type: "teamspace", id: teamspace.id }
    : { type: "page", id: null };
  return state;
}

export function pageBreadcrumb(state, page) {
  const chain = [];
  let current = page;
  let guard = 0;
  while (current && guard < 12) {
    chain.unshift(current);
    current = current.parentId ? getPage(state, current.parentId) : null;
    guard += 1;
  }
  return chain;
}

export function touchPage(page) {
  page.updatedAt = Date.now();
}

export function relativeUpdated(page) {
  if (!page?.updatedAt) return "Edited just now";
  const diff = Date.now() - page.updatedAt;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Edited just now";
  if (minutes < 60) return `Edited ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Edited ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Edited ${days}d ago`;
}
