function init() {
    preloadTheme();
    onScroll();
    animate();

    const backToTop = document.getElementById("back-to-top");
    backToTop?.addEventListener("click", (event) => scrollToTop(event));

    const backToPrev = document.getElementById("back-to-prev");
    backToPrev?.addEventListener("click", () => window.history.back());

    const themeButton = document.getElementById("theme-button");
    themeButton?.addEventListener("click", () => {
      const theme = localStorage.theme;
      if (theme === "light") {
        localStorage.setItem("theme", "dark");
        toggleTheme(true);
      } else {
        localStorage.setItem("theme", "light");
        toggleTheme(false);
      }
      updateSVGColors();
    });

    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", (event) => {
        if (localStorage.theme === "system") {
          toggleTheme(event.matches);
        }
      });

    document.addEventListener("scroll", onScroll);
  }

  function updateSVGColors() {
    const searchIcon = document.querySelector(".search-icon path");
    const theme = localStorage.theme;

    if (theme === "light") {
      searchIcon?.setAttribute("fill", "#000");
    } else {
      searchIcon?.setAttribute("fill", "#fff");
    }
  }

  function animate() {
    const animateElements = document.querySelectorAll(".animate");

    animateElements.forEach((element, index) => {
      setTimeout(() => {
        element.classList.add("show");
      }, index * 150);
    });
  }

  function onScroll() {
    if (window.scrollY > 0) {
      document.documentElement.classList.add("scrolled");
    } else {
      document.documentElement.classList.remove("scrolled");
    }
  }

  function scrollToTop(event) {
    event.preventDefault();
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function toggleTheme(dark) {
    const css = document.createElement("style");

    css.appendChild(
      document.createTextNode(
        `* {
             -webkit-transition: none !important;
             -moz-transition: none !important;
             -o-transition: none !important;
             -ms-transition: none !important;
             transition: none !important;
          }
        `
      )
    );

    document.head.appendChild(css);

    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }

    window.getComputedStyle(css).opacity;
    document.head.removeChild(css);
  }

  function preloadTheme() {
    const userTheme = localStorage.theme;

    if (userTheme === "light" || userTheme === "dark") {
      toggleTheme(userTheme === "dark");
    } else {
      toggleTheme(window.matchMedia("(prefers-color-scheme: dark)").matches);
    }
    updateSVGColors();
  }

  document.addEventListener("DOMContentLoaded", () => init());
  document.addEventListener("astro:after-swap", () => init());
  preloadTheme();