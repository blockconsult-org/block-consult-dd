import { dialog, type BrowserWindow } from "electron";

/** Electron needs an explicit choice when the renderer blocks closing or reloading. */
export function protectUnsavedChanges(win: BrowserWindow, confirmDiscard: () => boolean = () => dialog.showMessageBoxSync(win, {
  type: "warning",
  title: "Unsaved changes",
  message: "Leave without saving?",
  detail: "Your unsaved changes will be lost.",
  buttons: ["Keep editing", "Discard changes"],
  defaultId: 0,
  cancelId: 0,
  noLink: true,
}) === 1): void {
  win.webContents.on("will-prevent-unload", (event) => {
    // For this Electron event, preventDefault allows unloading despite beforeunload.
    if (confirmDiscard()) event.preventDefault();
  });
}
