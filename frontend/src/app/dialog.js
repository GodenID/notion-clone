/* In-app dialog replacing window.prompt / window.confirm.
   Returns a promise so callers can await the user's answer. */

const appDialog = document.getElementById("app-dialog");
const appDialogTitle = document.getElementById("app-dialog-title");
const appDialogMessage = document.getElementById("app-dialog-message");
const appDialogInput = document.getElementById("app-dialog-input");

export function showDialog({
  title = "",
  message = "",
  defaultValue = "",
  input = false,
  okLabel = "OK",
  cancelLabel = "Cancel",
} = {}) {
  return new Promise((resolve) => {
    if (!appDialog) {
      resolve(input ? window.prompt(title, defaultValue) : window.confirm(message || title));
      return;
    }
    appDialogTitle.textContent = title;
    appDialogMessage.hidden = !message;
    appDialogMessage.textContent = message;
    appDialogInput.hidden = !input;
    appDialogInput.value = defaultValue;
    const okButton = appDialog.querySelector(".app-dialog__ok");
    const cancelButton = appDialog.querySelector(".app-dialog__cancel");
    okButton.textContent = okLabel;
    cancelButton.textContent = cancelLabel;

    const cleanup = () => {
      okButton.removeEventListener("click", onOk);
    };
    const onOk = (event) => {
      event.preventDefault();
      const value = input ? appDialogInput.value : true;
      cleanup();
      appDialog.close("ok");
      resolve(value);
    };
    const onClose = () => {
      cleanup();
      resolve(input ? null : false);
    };

    appDialog.addEventListener("close", onClose, { once: true });
    okButton.addEventListener("click", onOk);
    if (typeof appDialog.showModal === "function") appDialog.showModal();
    else appDialog.setAttribute("open", "");
    if (input) setTimeout(() => appDialogInput.focus(), 30);
  });
}

export function promptDialog(title, defaultValue = "") {
  return showDialog({ title, input: true, defaultValue });
}

export function confirmDialog(message) {
  return showDialog({ title: "Confirm", message, okLabel: "Yes", cancelLabel: "Cancel" });
}