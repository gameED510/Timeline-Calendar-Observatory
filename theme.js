(() => {
  const key = "tl-calendar-planner-theme";
  try {
    const theme = localStorage.getItem(key);
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
    }
  } catch {
    // System theme remains available when browser storage is restricted.
  }
})();
