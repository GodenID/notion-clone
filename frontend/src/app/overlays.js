/* Command palette, keyboard-shortcut sheet, and first-run onboarding. */

import { formatShortcut, fuzzyRank, SHORTCUT_GROUPS } from "./commands.js";

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));

/* ---------------- command palette ---------------- */

export function createCommandPalette({ modal, input, results, commands, onRun }) {
  let matches = [];
  let index = 0;

  function render(query) {
    const ranked = fuzzyRank(
      query,
      commands.map((command) => ({
        id: command.id,
        label: command.label,
        keywords: [command.group, ...(command.keywords || [])],
        weight: command.weight || 0,
      }))
    );

    matches = ranked.map((hit) => ({ command: commands.find((c) => c.id === hit.item.id), positions: hit.positions }));
    if (!matches.some((match) => match.command)) matches = [];
    index = Math.min(index, Math.max(0, matches.length - 1));

    results.innerHTML = "";
    if (!matches.length) {
      const empty = document.createElement("div");
      empty.className = "search__empty";
      empty.textContent = "No commands match.";
      results.appendChild(empty);
      return;
    }

    matches.forEach((match, position) => {
      const button = document.createElement("button");
      button.className = `search-result${position === index ? " is-active" : ""}`;
      button.dataset.commandIndex = String(position);
      button.innerHTML = `
        <span class="search-result__icon">${escapeHtml(match.command.icon || "⌘")}</span>
        <span class="search-result__text">
          <span class="search-result__label">${highlight(match.command.label, match.positions)}</span>
          ${match.command.hint ? `<span class="search-result__snippet">${escapeHtml(match.command.hint)}</span>` : ""}
        </span>
        <span class="command-item__group">${
          match.command.shortcut ? escapeHtml(formatShortcut(match.command.shortcut)) : escapeHtml(match.command.group)
        }</span>`;
      button.addEventListener("click", () => {
        close();
        onRun?.(match.command);
      });
      results.appendChild(button);
    });
  }

  function highlight(label, positions) {
    const source = String(label ?? "");
    if (!positions?.length) return escapeHtml(source);
    const marks = new Set(positions);
    let out = "";
    for (let i = 0; i < source.length; i += 1) {
      const char = escapeHtml(source[i]);
      out += marks.has(i) ? `<mark>${char}</mark>` : char;
    }
    return out;
  }

  function move(delta) {
    if (!matches.length) return;
    index = (index + delta + matches.length) % matches.length;
    results.querySelector(".is-active")?.classList.remove("is-active");
    results
      .querySelector(`[data-command-index="${index}"]`)
      ?.classList.add("is-active");
    results.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
  }

  function open(initial = "") {
    index = 0;
    input.value = initial;
    modal.hidden = false;
    render(initial);
    setTimeout(() => {
      input.focus();
      input.select();
    }, 10);
  }

  function close() {
    modal.hidden = true;
    input.value = "";
  }

  function isOpen() {
    return !modal.hidden;
  }

  input.addEventListener("input", () => {
    index = 0;
    render(input.value);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const match = matches[index];
      if (!match?.command) return;
      close();
      onRun?.(match.command);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });

  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-command]")) close();
  });

  return { open, close, isOpen, render };
}

/* ---------------- shortcut sheet ---------------- */

export function createShortcutSheet({ modal, grid, closeButton }) {
  function render() {
    grid.innerHTML = "";
    for (const group of SHORTCUT_GROUPS) {
      const section = document.createElement("section");
      section.className = "shortcut-group";
      const heading = document.createElement("h3");
      heading.textContent = group.label;
      const list = document.createElement("dl");

      for (const item of group.items) {
        const term = document.createElement("dt");
        term.innerHTML = item.keys
          .split("/")
          .map((chunk) => `<kbd class="shortcut-keys">${escapeHtml(chunk.trim())}</kbd>`)
          .join("");
        const description = document.createElement("dd");
        description.textContent = item.label;
        list.append(term, description);
      }

      section.append(heading, list);
      grid.appendChild(section);
    }
  }

  function open() {
    render();
    modal.hidden = false;
  }

  function close() {
    modal.hidden = true;
  }

  function isOpen() {
    return !modal.hidden;
  }

  closeButton?.addEventListener("click", close);
  document.getElementById("shortcuts-done")?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-shortcuts]")) close();
  });

  return { open, close, isOpen, render };
}

/* ---------------- onboarding ---------------- */

const ONBOARDING_STEPS = [
  {
    art: "👋",
    title: "Welcome to your workspace",
    text: "This clone runs entirely in your browser. Pages, comments, and settings save automatically to this device.",
    points: [
      "Everything you write is stored locally — nothing leaves this browser",
      "Pages, teamspaces, and a trash bin are already set up",
      "Press ? any time to see every keyboard shortcut",
    ],
    keys: [["Mod+K", "search"], ["Mod+Shift+P", "commands"]],
  },
  {
    art: "🧱",
    title: "Write with blocks",
    text: "Every paragraph, heading, list, table, and database is a block you can move, restyle, or turn into something else.",
    points: [
      "Type / on an empty line to open the block menu",
      "Type @ to link another page or insert today's date",
      "Type = followed by a calculation, like = 12*3",
      "Drag the ⠿ handle on the left of a block to reorder it",
    ],
    keys: [["/", "insert block"], ["@", "mention"], ["=", "math"]],
  },
  {
    art: "🗂️",
    title: "Databases that behave",
    text: "One database, six views. Change the view without losing your rows.",
    points: [
      "Table, board, gallery, list, calendar, and timeline views",
      "Properties include status, formula, rollup, relation, people, and files",
      "Drag a card between board columns, or a row to another day",
      "Add a linked view to mirror another database",
    ],
    keys: [["drag", "move rows"], ["+ Property", "add a field"]],
  },
  {
    art: "⌨️",
    title: "You are ready",
    text: "Learn the shortcuts once and the mouse becomes optional. The command palette holds every action in the app.",
    points: [
      "Mod+Shift+P opens the command palette with every command",
      "Mod+/ opens the full shortcut sheet",
      "Mod+Z and Mod+Shift+Z undo and redo",
      "Select any text to comment, highlight, or link it",
    ],
    keys: [["Mod+Shift+P", "palette"], ["Mod+/", "shortcuts"], ["Mod+Z", "undo"]],
  },
];

export function createOnboarding({ modal, progress, art, title, text, points, keys, back, next, skip }) {
  let step = 0;

  function paint() {
    const current = ONBOARDING_STEPS[step];
    art.textContent = current.art;
    title.textContent = current.title;
    text.textContent = current.text;

    points.innerHTML = "";
    for (const point of current.points) {
      const item = document.createElement("li");
      item.textContent = point;
      points.appendChild(item);
    }

    keys.innerHTML = "";
    for (const [shortcut, label] of current.keys) {
      const chip = document.createElement("span");
      chip.innerHTML = `<kbd class="shortcut-keys">${escapeHtml(formatShortcut(shortcut))}</kbd>${escapeHtml(label)}`;
      keys.appendChild(chip);
    }

    progress.innerHTML = "";
    ONBOARDING_STEPS.forEach((unused, position) => {
      const dot = document.createElement("span");
      if (position === step) dot.classList.add("is-active");
      progress.appendChild(dot);
    });

    back.disabled = step === 0;
    next.textContent = step === ONBOARDING_STEPS.length - 1 ? "Start writing" : "Next";
  }

  function open(fromStart = false) {
    step = fromStart ? 0 : step;
    paint();
    modal.hidden = false;
  }

  function close() {
    modal.hidden = true;
  }

  function finish() {
    step = 0;
    close();
  }

  function isOpen() {
    return !modal.hidden;
  }

  next.addEventListener("click", () => {
    if (step === ONBOARDING_STEPS.length - 1) {
      finish();
      return;
    }
    step += 1;
    paint();
  });

  back.addEventListener("click", () => {
    step = Math.max(0, step - 1);
    paint();
  });

  skip.addEventListener("click", finish);
  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-onboarding]")) finish();
  });

  return { open, close, finish, isOpen, get step() { return step; } };
}

export { ONBOARDING_STEPS };