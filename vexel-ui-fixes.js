(() => {
  "use strict";

  /*
    ============================================================
    VEXEL UI / NAVIGATION STABILITY PATCH
    ============================================================
    This patch fixes:
    - Login / signup navigation
    - Mobile sidebar opening / closing
    - Touch responsiveness
    - Sidebar backdrop behavior
    - Keyboard accessibility
    - Auth-link navigation
    - Defensive UI behavior
  */

  const isMobile = () => window.innerWidth <= 768;

  const get = (id) => document.getElementById(id);

  function goTo(path) {
    try {
      window.location.assign(path);
    } catch (error) {
      console.error("Vexel navigation error:", error);
      window.location.href = path;
    }
  }

  /*
    ============================================================
    HARD NAVIGATION
    ============================================================
    Prevent other document handlers from interfering with
    the login/signup links.
  */

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest("a[href]");

      if (!link) return;

      const href = link.getAttribute("href");

      if (!href) return;

      const normalized = href
        .replace(window.location.origin, "")
        .split("?")[0]
        .split("#")[0];

      if (
        normalized === "/login.html" ||
        normalized === "login.html"
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();

        goTo("/login.html");
        return;
      }

      if (
        normalized === "/signup.html" ||
        normalized === "signup.html"
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();

        goTo("/signup.html");
        return;
      }
    },
    true
  );

  /*
    ============================================================
    MOBILE SIDEBAR
    ============================================================
  */

  function setSidebarState(open) {
    const sidebar = get("sidebar");
    const backdrop = get("mobileBackdrop");
    const menuToggle = get("menuToggle");
    const closeButton = get("closeSidebarBtn");

    if (!sidebar) return;

    if (!isMobile()) {
      sidebar.classList.remove("open");
      sidebar.classList.remove("hidden");

      if (backdrop) {
        backdrop.classList.remove("active");
      }

      if (menuToggle) {
        menuToggle.setAttribute("aria-expanded", "false");
      }

      return;
    }

    sidebar.classList.toggle("open", open);
    sidebar.classList.remove("hidden");

    if (backdrop) {
      backdrop.classList.toggle("active", open);
    }

    if (menuToggle) {
      menuToggle.setAttribute(
        "aria-expanded",
        String(open)
      );
      menuToggle.setAttribute(
        "aria-label",
        open ? "Close sidebar" : "Open sidebar"
      );
    }

    if (closeButton) {
      closeButton.setAttribute(
        "aria-expanded",
        String(open)
      );
    }
  }

  function hardToggleSidebar(forceState = null) {
    const sidebar = get("sidebar");

    if (!sidebar) return;

    if (!isMobile()) {
      sidebar.classList.remove("hidden");
      sidebar.classList.remove("open");
      return;
    }

    const shouldOpen =
      forceState === null
        ? !sidebar.classList.contains("open")
        : Boolean(forceState);

    setSidebarState(shouldOpen);
  }

  /*
    Replace the old global function used by inline onclick=""
    attributes in index.html.
  */
  window.toggleSidebar = hardToggleSidebar;

  /*
    The capture-phase listener prevents the old handler from
    firing twice.
  */
  const menuToggle = get("menuToggle");

  if (menuToggle) {
    menuToggle.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        hardToggleSidebar();
      },
      true
    );
  }

  const closeSidebarBtn = get("closeSidebarBtn");

  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        setSidebarState(false);
      },
      true
    );
  }

  const mobileBackdrop = get("mobileBackdrop");

  if (mobileBackdrop) {
    mobileBackdrop.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();

        setSidebarState(false);
      },
      true
    );
  }

  /*
    ============================================================
    TOUCH SUPPORT
    ============================================================
  */

  const style = document.createElement("style");

  style.id = "vexelInteractionFixes";

  style.textContent = `
    button,
    a,
    .chat-list-item,
    .profile-button,
    .tool-icon-btn,
    .new-chat-btn,
    .send-btn,
    .menu-item,
    .auth-link {
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }

    .sidebar {
      pointer-events: auto !important;
    }

    .chat-list-item {
      user-select: none;
      -webkit-user-select: none;
    }

    #menuToggle,
    #closeSidebarBtn,
    #profileButton,
    #headerProfileButton {
      pointer-events: auto !important;
    }
  `;

  document.head.appendChild(style);

  /*
    ============================================================
    RESPONSIVE SIDEBAR STATE
    ============================================================
  */

  window.addEventListener(
    "resize",
    () => {
      if (!isMobile()) {
        setSidebarState(false);
      }
    },
    {
      passive: true
    }
  );

  /*
    ============================================================
    ESCAPE KEY
    ============================================================
  */

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") return;

      if (isMobile()) {
        const sidebar = get("sidebar");

        if (sidebar?.classList.contains("open")) {
          setSidebarState(false);
        }
      }
    },
    true
  );

  /*
    ============================================================
    CHAT ROW TOUCH / CLICK SAFETY
    ============================================================
    Existing chat rows already have their own click handler.
    This simply makes sure they are treated as interactive
    controls on touch devices.
  */

  const chatList = get("chatList");

  if (chatList) {
    chatList.addEventListener(
      "pointerup",
      (event) => {
        const row = event.target.closest(".chat-list-item");

        if (!row) return;

        /*
          Do not interfere with the context-menu button,
          checkbox, or bulk-selection controls.
        */
        if (
          event.target.closest(".chat-row-menu-btn") ||
          event.target.closest("input") ||
          event.target.closest(".chat-actions")
        ) {
          return;
        }

        row.style.webkitTapHighlightColor = "transparent";
      },
      {
        passive: true
      }
    );
  }

  /*
    ============================================================
    AUTH BUTTON SAFETY
    ============================================================
  */

  function attachAuthNavigation(id, path) {
    const element = get(id);

    if (!element) return;

    element.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();

        goTo(path);
      },
      true
    );
  }

  attachAuthNavigation(
    "loginLink",
    "/login.html"
  );

  attachAuthNavigation(
    "signupLink",
    "/signup.html"
  );

  attachAuthNavigation(
    "menuLoginLink",
    "/login.html"
  );

  attachAuthNavigation(
    "menuSignupLink",
    "/signup.html"
  );

  /*
    ============================================================
    INITIAL STATE
    ============================================================
  */

  if (isMobile()) {
    setSidebarState(false);
  }

  /*
    ============================================================
    DEBUGGING
    ============================================================
    These make future frontend errors much easier to identify.
  */

  window.addEventListener(
    "error",
    (event) => {
      console.error(
        "[Vexel frontend error]",
        event.error || event.message
      );
    }
  );

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      console.error(
        "[Vexel unhandled promise rejection]",
        event.reason
      );
    }
  );

  console.log(
    "%cVexel UI fixes loaded successfully.",
    "color:#8b7cf6;font-weight:700;"
  );
})();
