let currentView = "all";
let meeshoLooks = [];
let flipkartLooks = [];

/* ---------- PAGE INIT ---------- */
async function initPage() {
    await Promise.all([
        loadMeeshoData(),
        loadFlipkartData()
    ]);

    setupTabs();
    renderView(currentView);
}

// expose for body onload
window.initPage = initPage;

/* ---------- LOAD DATA ---------- */
async function loadMeeshoData() {
    try {
        const response = await fetch("data.json");
        if (!response.ok) throw new Error("Meesho JSON not found");
        meeshoLooks = await response.json();
    } catch (e) {
        console.error("Failed to load Meesho products:", e);
    }
}

async function loadFlipkartData() {
    try {
        const response = await fetch("@flipkart/data.json");
        if (!response.ok) {
            flipkartLooks = [];
            return;
        }
        flipkartLooks = await response.json();
    } catch (e) {
        console.error("Failed to load Flipkart products:", e);
        flipkartLooks = [];
    }
}

/* ---------- TABS ---------- */
function setupTabs() {
    const buttons = document.querySelectorAll(".tab-button");

    buttons.forEach(button => {
        button.addEventListener("click", () => {
            renderView(button.dataset.view);
        });
    });
}

function updateActiveTab() {
    const buttons = document.querySelectorAll(".tab-button");

    buttons.forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.view === currentView
        );
    });
}

/* ---------- RENDER ---------- */
function renderView(view) {
    currentView = view;
    updateActiveTab();

    const pageGrid = document.getElementById("page-grid");
    pageGrid.innerHTML = "";

    if (view === "all" || view === "flipkart") {
        renderSection("FLIPKART Products", flipkartLooks);
    }

    if (view === "all" || view === "meesho") {
        renderSection("MEESHO Products", meeshoLooks);
    }
}

function renderSection(title, looks) {
    if (!looks || !looks.length) return;

    const pageGrid = document.getElementById("page-grid");

    const header = document.createElement("div");
    header.className = "section-header";
    header.innerHTML = `<h2>${title}</h2>`;

    pageGrid.appendChild(header);

    looks.forEach(look => {
        pageGrid.appendChild(createLookBox(look));
    });
}

/* ---------- PRICE ---------- */
function parsePrice(price) {
    if (typeof price !== "string") return 0;

    const numeric = price.replace(/[^\d.]/g, "");
    return parseFloat(numeric) || 0;
}

function getComboPrice(look) {
    const items = [...(look.products || [])];
    const total = items.reduce(
        (sum, item) => sum + parsePrice(item.price),
        0
    );

    const rounded = Math.ceil(total / 50) * 50;

    return `All these under just <span class="combo-amount">${rounded}</span> rs`;
}

/* ---------- LOOK BOX ---------- */
function createLookBox(look) {
    const lookBox = document.createElement("div");
    lookBox.className = "look-box";

    const productCards = (look.products || [])
        .map(product => `
            <a class="product-card" href="${product.link}" target="_blank">
                <img src="${product.image}" alt="${product.name}">
                <div>
                    <h5>${product.name}</h5>
                    <p>${product.price}</p>
                </div>
            </a>
        `)
        .join("");

    const modelImage =
        look.modelImage ||
        (look.products?.length ? look.products[0].image : "");

    const comboPrice = getComboPrice(look);

    lookBox.innerHTML = `
        <div class="combo-line">${comboPrice}</div>

        <div class="top-section">
            <div class="model-box">
                <img src="${modelImage}" alt="Model">
            </div>

            <div class="outfit-section">
                ${productCards}
            </div>
        </div>
    `;

    return lookBox;
}