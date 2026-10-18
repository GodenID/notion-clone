import { loadSession, saveSession } from "../app/store.js";

if (loadSession()) {
  window.location.replace("app.html");
}

const form = document.getElementById("login-form");
const emailInput = document.getElementById("login-email");
const nameInput = document.getElementById("login-name");
const emailError = document.getElementById("email-error");
const nameError = document.getElementById("name-error");
const submitBtn = document.getElementById("login-btn");
const submitLabel = submitBtn.querySelector(".auth-submit__label");
const spinner = document.getElementById("login-spinner");
const demoBtn = document.getElementById("demo-btn");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

  const emailValid = EMAIL_PATTERN.test(email);
  const nameValid = !name || name.length >= 2;

  emailError.hidden = emailValid;
  nameError.hidden = nameValid;
  emailInput.setAttribute("aria-invalid", String(!emailValid));

  if (emailValid) return { email, name: name || nameFromEmail(email) };
  return null;
}

function setLoading(loading) {
  submitBtn.classList.toggle("is-loading", loading);
  submitBtn.disabled = loading;
  spinner.hidden = !loading;
  submitLabel.textContent = loading ? "Signing in…" : "Continue";
}

function enter(email, name) {
  cancelPending();
  setLoading(true);
  pending = window.setTimeout(() => {
    saveSession({ email, name });
    window.location.assign("app.html");
  }, 550);
}

let pending = 0;
function cancelPending() {
  if (pending) window.clearTimeout(pending);
  pending = 0;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = validate();
  if (!values) {
    (emailError.hidden ? nameInput : emailInput).focus();
    return;
  }
  enter(values.email, values.name);
});

emailInput.addEventListener("input", () => {
  emailError.hidden = true;
});

nameInput.addEventListener("input", () => {
  nameError.hidden = true;
});

demoBtn.addEventListener("click", () => {
  emailInput.value = "alex@notion.clone";
  nameInput.value = "Alex Morgan";
  emailError.hidden = true;
  nameError.hidden = true;
  enter("alex@notion.clone", "Alex Morgan");
});

emailInput.focus();
