document.addEventListener("DOMContentLoaded", () => {
    initPageLoader();
    initThemeToggle();
    initMobileNavToggle();
    initToasts();
    initGeneratorBehavior();
    initShareCopy();
    initTimetableActions();
    initSettingsTabs();
});

function initSettingsTabs() {
    const tabButtons = document.querySelectorAll('[data-bs-target^="#settings-"]');
    if (!tabButtons.length) {
        return;
    }

    const savedTarget = localStorage.getItem("st-settings-tab");
    if (savedTarget) {
        const savedButton = document.querySelector(`[data-bs-target="${savedTarget}"]`);
        if (savedButton && window.bootstrap && window.bootstrap.Tab) {
            const tab = new bootstrap.Tab(savedButton);
            tab.show();
        }
    }

    tabButtons.forEach((button) => {
        button.addEventListener("shown.bs.tab", (event) => {
            const target = event.target.getAttribute("data-bs-target");
            if (target) {
                localStorage.setItem("st-settings-tab", target);
            }
        });
    });
}

function initTimetableActions() {
    const printButton = document.getElementById("printTimetableBtn");
    if (!printButton) {
        return;
    }

    printButton.addEventListener("click", () => {
        window.print();
    });
}

function initShareCopy() {
    const copyButton = document.getElementById("copyShareBtn");
    if (!copyButton) {
        return;
    }

    const targetId = copyButton.getAttribute("data-copy-target") || "";
    const input = document.getElementById(targetId);
    if (!input) {
        return;
    }

    copyButton.addEventListener("click", async () => {
        const text = input.value || "";
        try {
            await navigator.clipboard.writeText(text);
        } catch (error) {
            input.select();
            document.execCommand("copy");
        }
        copyButton.innerHTML = '<i class="fa-solid fa-check me-1"></i>Copied';
    });
}

function initMobileNavToggle() {
    const layout = document.querySelector(".layout-wrapper");
    const toggle = document.getElementById("mobileNavToggle");
    const backdrop = document.getElementById("mobileNavBackdrop");
    const sidebarLinks = document.querySelectorAll(".sidebar .nav-link");

    if (!layout || !toggle || !backdrop) {
        return;
    }

    function closeNav() {
        layout.classList.remove("sidebar-open");
        toggle.setAttribute("aria-expanded", "false");
    }

    function openNav() {
        layout.classList.add("sidebar-open");
        toggle.setAttribute("aria-expanded", "true");
    }

    toggle.addEventListener("click", () => {
        if (layout.classList.contains("sidebar-open")) {
            closeNav();
            return;
        }
        openNav();
    });

    backdrop.addEventListener("click", closeNav);
    sidebarLinks.forEach((link) => {
        link.addEventListener("click", closeNav);
    });
}

function initPageLoader() {
    const loader = document.getElementById("page-loader");
    if (!loader) {
        return;
    }

    const hideLoader = () => {
        loader.classList.add("hidden");
        setTimeout(() => {
            loader.style.display = "none";
        }, 500);
    };

    if (document.readyState === "complete") {
        hideLoader();
    } else {
        window.addEventListener("load", hideLoader);
    }

    const showLoader = () => {
        loader.style.display = "flex";
        void loader.offsetWidth;
        loader.classList.remove("hidden");
    };

    document.addEventListener("click", (event) => {
        const link = event.target.closest("a[href]");
        if (!link) {
            return;
        }

        const href = link.getAttribute("href") || "";
        const isInternal = href && !href.startsWith("#") && !href.startsWith("javascript:");
        const opensNewTab = link.target && link.target.toLowerCase() === "_blank";
        const usesModifier = event.ctrlKey || event.metaKey || event.shiftKey || event.altKey;

        if (isInternal && !opensNewTab && !usesModifier) {
            showLoader();
        }
    });

    document.addEventListener("submit", (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) {
            return;
        }

        if (!form.target || form.target === "_self") {
            showLoader();
        }
    });
}

function initThemeToggle() {
    const html = document.documentElement;
    const toggleButton = document.getElementById("themeToggle");
    if (!toggleButton) {
        return;
    }

    const saved = localStorage.getItem("st-theme");
    if (saved) {
        html.setAttribute("data-theme", saved);
    }
    const initialTheme = html.getAttribute("data-theme") || "dark";
    setThemeIcon(toggleButton, initialTheme);
    setThemeA11yLabel(toggleButton, initialTheme);

    toggleButton.addEventListener("click", () => {
        const current = html.getAttribute("data-theme") || "dark";
        const next = current === "dark" ? "light" : "dark";
        html.setAttribute("data-theme", next);
        localStorage.setItem("st-theme", next);
        setThemeIcon(toggleButton, next);
        setThemeA11yLabel(toggleButton, next);
    });
}

function setThemeA11yLabel(button, theme) {
    const nextTheme = theme === "dark" ? "light" : "dark";
    button.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
}

function setThemeIcon(button, theme) {
    const icon = button.querySelector("i");
    if (!icon) {
        return;
    }
    icon.className = theme === "dark" ? "fa-solid fa-moon" : "fa-solid fa-sun";
}

function initToasts() {
    const toastContainer = document.getElementById("toastContainer");
    const flashData = document.getElementById("flashData");
    if (!toastContainer || !flashData) {
        return;
    }

    const items = flashData.querySelectorAll(".flash-item");
    items.forEach((item, index) => {
        const category = item.getAttribute("data-category") || "info";
        const message = item.getAttribute("data-message") || "";
        const toast = document.createElement("div");
        toast.className = "toast align-items-center border-0 show mb-2";
        toast.role = "alert";
        toast.ariaLive = "assertive";
        toast.ariaAtomic = "true";
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    <strong class="me-2 text-${bootstrapColor(category)}">${capitalize(category)}:</strong>
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.remove("show");
            setTimeout(() => toast.remove(), 300);
        }, 4200 + index * 350);
    });
}

function bootstrapColor(category) {
    if (category === "success") return "success";
    if (category === "danger") return "danger";
    if (category === "warning") return "warning";
    return "info";
}

function capitalize(text) {
    if (!text) return "Info";
    return text[0].toUpperCase() + text.slice(1);
}

function initGeneratorBehavior() {
    const form = document.getElementById("generateForm");
    if (!form) {
        return;
    }

    const semesterType = document.getElementById("semesterType");
    const programSelect = document.getElementById("programSelect");
    const pool = document.getElementById("divisionPool");
    const toggleSelectionBtn = document.getElementById("toggleDivisionSelection");
    const submitBtn = document.getElementById("generateBtn");
    const btnLabel = submitBtn ? submitBtn.querySelector(".btn-label") : null;
    const btnLoader = submitBtn ? submitBtn.querySelector(".btn-loader") : null;

    function isSemesterMatch(semester, type) {
        const sem = Number(semester);
        if (type === "odd") return sem % 2 === 1;
        return sem % 2 === 0;
    }

    function filterDivisions() {
        const semType = semesterType ? semesterType.value : "odd";
        const program = programSelect ? programSelect.value : "UG";
        const labels = pool ? pool.querySelectorAll(".division-check") : [];

        labels.forEach((label) => {
            const sem = label.getAttribute("data-semester") || "1";
            const prog = label.getAttribute("data-program") || "UG";
            const visible = isSemesterMatch(sem, semType) && prog === program;
            label.classList.toggle("is-hidden", !visible);
            const input = label.querySelector("input");
            if (!visible && input) {
                input.checked = false;
            }
        });
    }

    semesterType.addEventListener("change", filterDivisions);
    programSelect.addEventListener("change", filterDivisions);
    filterDivisions();

    if (toggleSelectionBtn) {
        toggleSelectionBtn.addEventListener("click", () => {
            const visibleChecks = Array.from(pool.querySelectorAll(".division-check"))
                .filter((label) => !label.classList.contains("is-hidden"))
                .map((label) => label.querySelector("input"));

            const shouldSelect = visibleChecks.some((c) => c && !c.checked);
            visibleChecks.forEach((checkbox) => {
                if (checkbox) checkbox.checked = shouldSelect;
            });
        });
    }

    form.addEventListener("submit", () => {
        if (submitBtn) {
            submitBtn.disabled = true;
        }
        if (btnLabel) {
            btnLabel.classList.add("d-none");
        }
        if (btnLoader) {
            btnLoader.classList.remove("d-none");
        }
    });
}
