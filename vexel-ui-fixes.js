(() => {
  "use strict";

  /*
    ============================================================
    VEXEL UI FIXES
    ============================================================
    This file is intentionally lightweight.

    The main index.html already contains the actual:
    - sidebar logic
    - auth navigation
    - account menu logic
    - chat interactions

    This file only provides:
    - mobile viewport-height handling
    - safe sidebar fallback
    - touch behavior
    - accessibility helpers

    IMPORTANT:
    Do NOT add duplicate click handlers here.
  */

  const isMobile = () => window.innerWidth <= 768;

  /*
    ============================================================
    MOBILE VIEWPORT HEIGHT
    ============================================================
    Helps with mobile browsers and keyboard/open-address-bar
    viewport changes.
  */

  function updateViewportHeight() {
    const root = document.documentElement;
    const viewport = window.visualViewport;

    const height =
      viewport && viewport.height
        ? viewport.height
        : window.innerHeight;

    root.style.setProperty(
      "--viewport-height",
      `${height}px`
    );
  }

  updateViewportHeight();

  window.addEventListener(
    "resize",
    updateViewportHeight,
    { passive: true }
  );

  if (window.visualViewport) {
    window.visualViewport.addEventListener(
      "resize",
      updateViewportHeight,
      { passive: true }
    );

    window.visualViewport.addEventListener(
      "scroll",
      updateViewportHeight,
      { passive: true }
    );
  }

  /*
    ============================================================
    SIDEBAR FALLBACK
    ============================================================
    index.html already defines toggleSidebar().
    We only create a fallback when it does not exist.
  */

  if (typeof window.toggleSidebar !== "function") {
    window.toggleSidebar = function (forceState = null) {
      const sidebar =
        document.getElementById("sidebar");

      const backdrop =
        document.getElementById("mobileBackdrop");

      const menuToggle =
        document.getElementById("menuToggle");

      if (!sidebar) {
        return;
      }

      /*
        Desktop:
        sidebar should always remain visible.
      */

      if (!isMobile()) {
        sidebar.classList.remove("open");
        sidebar.classList.remove("hidden");

        if (backdrop) {
          backdrop.classList.remove("active");
        }

        if (menuToggle) {
          menuToggle.setAttribute(
            "aria-expanded",
            "false"
          );
        }

        return;
      }

      /*
        Mobile:
        calculate desired state.
      */

      const shouldOpen =
        forceState === null
          ? !sidebar.classList.contains("open")
          : Boolean(forceState);

      sidebar.classList.toggle(
        "open",
        shouldOpen
      );

      sidebar.classList.remove("hidden");

      if (backdrop) {
        backdrop.classList.toggle(
          "active",
          shouldOpen
        );
      }

      if (menuToggle) {
        menuToggle.setAttribute(
          "aria-expanded",
          String(shouldOpen)
        );

        menuToggle.setAttribute(
          "aria-label",
          shouldOpen
            ? "Close sidebar"
            : "Open sidebar"
        );
      }
    };
  }

  /*
    ============================================================
    MOBILE BACKDROP SAFETY
    ============================================================
    Only attach this fallback when the main app has not already
    installed its own handler.
  */

  const backdrop =
    document.getElementById("mobileBackdrop");

  if (backdrop && !backdrop.dataset.vexelFixBound) {
    backdrop.dataset.vexelFixBound = "true";

    backdrop.addEventListener(
      "click",
      () => {
        if (typeof window.toggleSidebar === "function") {
          window.toggleSidebar(false);
        }
      },
      { passive: true }
    );
  }

  /*
    ============================================================
    ESC KEY SAFETY
    ============================================================
  */

  if (!document.documentElement.dataset.vexelEscapeBound) {
    document.documentElement.dataset.vexelEscapeBound =
      "true";

    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key !== "Escape") {
          return;
        }

        /*
          Close mobile sidebar.
        */

        if (isMobile()) {
          const sidebar =
            document.getElementById("sidebar");

          if (
            sidebar &&
            sidebar.classList.contains("open")
          ) {
            if (
              typeof window.toggleSidebar ===
              "function"
            ) {
              window.toggleSidebar(false);
            }
          }
        }

        /*
          Close plus menu.
        */

        const plusMenu =
          document.getElementById("plusMenu");

        if (
          plusMenu &&
          plusMenu.classList.contains("active") &&
          typeof window.togglePlusMenu ===
            "function"
        ) {
          window.togglePlusMenu(false);
        }

        /*
          Close account menu.
        */

        const accountMenu =
          document.getElementById("accountMenu");

        if (
          accountMenu &&
          !accountMenu.hidden &&
          typeof window.closeAccountMenu ===
            "function"
        ) {
          window.closeAccountMenu();
        }
      },
      true
    );
  }

  /*
    ============================================================
    TOUCH OPTIMIZATION
    ============================================================
  */

  const touchStyle =
    document.createElement("style");

  touchStyle.id =
    "vexelUiTouchFixes";

  touchStyle.textContent = `
    button,
    a,
    input,
    textarea,
    .chat-list-item,
    .profile-button,
    .menu-item,
    .tool-icon-btn,
    .plus-menu-item,
    .send-btn {
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }

    .chat-list-item {
      user-select: none;
      -webkit-user-select: none;
    }

    @media (max-width: 768px) {
      button,
      .chat-list-item,
      .menu-item,
      .plus-menu-item {
        min-height: 40px;
      }
    }
  `;

  /*
    Prevent duplicate style injection.
  */

  if (!document.getElementById("vexelUiTouchFixes")) {
    document.head.appendChild(touchStyle);
  }

  /*
    ============================================================
    RESPONSIVE SIDEBAR CLEANUP
    ============================================================
    When resizing from mobile -> desktop, make sure the drawer
    does not remain stuck open.
  */

  window.addEventListener(
    "resize",
    () => {
      const sidebar =
        document.getElementById("sidebar");

      const backdrop =
        document.getElementById("mobileBackdrop");

      if (!sidebar) {
        return;
      }

      if (!isMobile()) {
        sidebar.classList.remove("open");
        sidebar.classList.remove("hidden");

        if (backdrop) {
          backdrop.classList.remove("active");
        }
      }
    },
    { passive: true }
  );

  /*
    ============================================================
    DEBUGGING
    ============================================================
  */

  window.addEventListener(
    "error",
    (event) => {
      console.error(
        "[Vexel UI Error]",
        event.error || event.message
      );
    }
  );

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      console.error(
        "[Vexel UI Promise Error]",
        event.reason
      );
    }
  );

  console.log(
    "%cVexel UI fixes loaded successfully.",
    "color:#8b7cf6;font-weight:700;"
  );
})();
