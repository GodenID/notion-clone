import { loadSession, saveSession } from "../app/store.js";
import { auth, detectMode, isServer } from "../app/api.js";

const form = document.getElementById("login-form");
const emailInput = document.getElementById("login-email");
const nameInput = document.getElementById("login-name");
const passwordField = document.getElementById("password-field");
const passwordInput = document.getElementById("login-password");
const emailError = document.getElementById("email-error");
const nameError = document.getElementById("name-error");
const passwordError = document.getElementById("password-error");
const submitBtn = document.getElementById("login-btn");
const submitLabel = submitBtn.querySelector(".auth-submit__label");
const spinner = document.getElementById("login-spinner");
const demoBtn = document.getElementById("demo-btn");
const modeHint = document.getElementById("mode-hint");
const localHint = document.getElementById("local-hint");
const modeToggle = document.getElementById("auth-mode-toggle");
const magicLinkBtn = document.getElementById("magic-link-btn");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;

let serverMode = false;
let createMode = false;

/** Carry debugging flags (mode, realtime) across the login → app navigation. */
function appUrl() {
  const params = new URLSearchParams();
  for (const key of ["mode", "realtime"]) {
    const value = new URLSearchParams(window.location.search).get(key);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `app.html?${query}` : "app.html";
}

function nameFromEmail(email) {
  const local = email.split("@")[0] || "Member";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .slice(0, 60);
}

function validate() {
  const email = emailInput.value.trim();
  const name = nameInput.value.trim();
  const password = passwordInput.value;

  const emailValid = EMAIL_PATTERN.test(email);
  const nameValid = !name || name.length >= 2;
  const passwordValid = !serverMode || password.length >= MIN_PASSWORD;

  emailError.hidden = emailValid;
  nameError.hidden = nameValid;
  passwordError.hidden = passwordValid;
  emailInput.setAttribute("aria-invalid", String(!emailValid));
  passwordInput.setAttribute("aria-invalid", String(!passwordValid));

  if (!emailValid) return null;
  if (!nameValid) return null;
  if (!passwordValid) return null;

  return { email, name: name || nameFromEmail(email), password };
}

function setLoading(loading) {
  submitBtn.classList.toggle("is-loading", loading);
  submitBtn.disabled = loading;
  spinner.hidden = !loading;
  submitLabel.textContent = loading
    ? createMode
      ? "Creating account…"
      : "Signing in…"
    : createMode
      ? "Create account"
      : "Sign in";
}

function showError(message) {
  if (!serverMode) {
    emailError.textContent = message;
    emailError.hidden = false;
    return;
  }
  passwordError.textContent = message;
  passwordError.hidden = false;
}

function renderMode() {
  if (!serverMode) return;
  passwordField.hidden = false;
  modeToggle.hidden = false;
  modeToggle.textContent = createMode
    ? "Already have an account? Sign in"
    : "No account yet? Create one";
  nameInput.closest(".auth-field").hidden = createMode;
  submitLabel.textContent = createMode ? "Create account" : "Sign in";
  passwordInput.autocomplete = createMode ? "new-password" : "current-password";
  modeHint.hidden = false;
  localHint.hidden = true;
}

async function signIn(values) {
  if (serverMode) {
    try {
      const result = createMode
        ? await auth.register({ email: values.email, name: values.name, password: values.password })
        : await auth.login({ email: values.email, password: values.password });
      saveSession({ email: result.user.email, name: result.user.name, color: result.user.color });
      window.location.assign(appUrl());
      return;
    } catch (error) {
      setLoading(false);
      if (error.status === 401 && !createMode) {
        showError(`${error.message} Use “Create one” below if this is a new account.`);
        passwordInput.focus();
        return;
      }
      showError(error.message || "Could not sign in");
      return;
    }
  }

  /* Local demo mode: no server, the session just lives in this browser. */
  window.setTimeout(() => {
    saveSession({ email: values.email, name: values.name });
    window.location.assign(appUrl());
  }, 400);
}

function submit(event) {
  event.preventDefault();
  emailError.hidden = true;
  nameError.hidden = true;
  passwordError.hidden = true;

  const values = validate();
  if (!values) {
    (emailError.hidden ? (passwordError.hidden ? nameInput : passwordInput) : emailInput).focus();
    return;
  }
  setLoading(true);
  signIn(values);
}

async function demo() {
  emailInput.value = "alex@notion.clone";
  nameInput.value = "Alex Morgan";
  if (serverMode) {
    passwordInput.value = "demo-password";
    createMode = true;
    renderMode();
  }
  emailError.hidden = true;
  nameError.hidden = true;
  passwordError.hidden = true;
  setLoading(true);
  signIn({ email: emailInput.value, name: nameInput.value, password: passwordInput.value });
}

async function boot() {
  serverMode = (await detectMode()) === "server";
  if (serverMode) {
    magicLinkBtn.hidden = false;
    magicLinkBtn.addEventListener("click", async () => {
      const email = emailInput.value.trim();
      if (!EMAIL_PATTERN.test(email)) {
        emailError.hidden = false;
        emailError.textContent = "Enter a valid email address first.";
        return;
      }
      setLoading(true);
      try {
        const response = await auth.requestMagicLink(email);
        setLoading(false);
        if (response?.ok) {
          passwordError.hidden = false;
          passwordError.textContent = response.message || "Check your inbox for the sign-in link.";
        } else {
          showError(response?.error || "Could not send the link.");
        }
      } catch (error) {
        setLoading(false);
        showError(error.message || "Could not send the link.");
      }
    });

    renderMode();
    try {
      const me = await auth.me();
      if (me?.user) {
        saveSession({ email: me.user.email, name: me.user.name, color: me.user.color });
        window.location.replace(appUrl());
        return;
      }
    } catch {
      /* not signed in yet — stay here */
    }
  } else if (loadSession()) {
    window.location.replace(appUrl());
    return;
  }
  emailInput.focus();
}

form.addEventListener("submit", submit);

emailInput.addEventListener("input", () => {
  emailError.hidden = true;
});

nameInput.addEventListener("input", () => {
  nameError.hidden = true;
});

passwordInput.addEventListener("input", () => {
  passwordError.hidden = true;
});

modeToggle.addEventListener("click", () => {
  createMode = !createMode;
  passwordError.hidden = true;
  renderMode();
  passwordInput.focus();
});

demoBtn.addEventListener("click", demo);

boot();

export { isServer };
