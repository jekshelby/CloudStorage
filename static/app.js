/* =========================================================
   SimpanDrive — Frontend Logic
   ========================================================= */

/* ===================== STATE ===================== */
const CHUNK_SIZE = 2 * 1024 * 1024;
const TEXT_MAX = 1024 * 1024;
const MOBILE_BREAKPOINT = 768;

let currentPath = "";
let currentItems = [];
let viewMode = "grid";
let mobileViewMode = "list";
let previewPath = "";
let renamePath = "";
let ctxPath = "", ctxName = "", ctxIsDir = false;
let searchQuery = "";

const fileInput = document.getElementById("fileInput");
const previewModal = document.getElementById("previewModal");
const previewTitle = document.getElementById("previewTitle");
const previewSubtitle = document.getElementById("previewSubtitle");
const previewBody = document.getElementById("previewBody");
const renameModal = document.getElementById("renameModal");
const renameInput = document.getElementById("renameInput");

function isMobileWidth() { return window.innerWidth < MOBILE_BREAKPOINT; }

/* ===================== HELPERS ===================== */
function toggleDropdown() {
    document.getElementById("newMenuDropdown").classList.toggle("hidden");
}
document.addEventListener("click", (e) => {
    const btn = document.getElementById("newActionButton");
    const dd = document.getElementById("newMenuDropdown");
    if (btn && dd && !btn.contains(e.target) && !dd.contains(e.target)) dd.classList.add("hidden");
});

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/`/g, "&#96;"); }

function formatDate(ts) {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    const bulan = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
    return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
}

function fileExt(name) {
    const i = name.lastIndexOf(".");
    return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

function getFileType(name) {
    const ext = fileExt(name);
    if (["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
    if (["mp4", "mkv", "avi", "mov", "webm"].includes(ext)) return "video";
    if (["mp3", "wav", "flac", "ogg", "m4a"].includes(ext)) return "audio";
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return "archive";
    if (ext === "pdf") return "pdf";
    if (["txt", "md", "log", "json", "csv", "xml", "py", "js", "css", "html"].includes(ext)) return "text";
    if (["doc", "docx"].includes(ext)) return "doc";
    if (["xls", "xlsx"].includes(ext)) return "sheet";
    if (["ppt", "pptx"].includes(ext)) return "slide";
    return "generic";
}

function isPreviewable(name) {
    return ["image", "video", "audio", "pdf", "text"].includes(getFileType(name));
}

function syncSearch(val) {
    searchQuery = val;
    const d = document.getElementById("searchInputDesktop");
    const m = document.getElementById("searchInputMobile");
    if (d && d.value !== val) d.value = val;
    if (m && m.value !== val) m.value = val;
    renderItems();
}

function setActiveNav(el) {
    document.querySelectorAll(".m-nav-item").forEach(b => b.classList.remove("active"));
    if (el) el.classList.add("active");
}

function toggleMobileView() {
    mobileViewMode = mobileViewMode === "grid" ? "list" : "grid";
    document.getElementById("mobileViewIcon").textContent =
        mobileViewMode === "grid" ? "format_list_bulleted" : "grid_view";
    if (isMobileWidth()) renderMobileContent();
}

/* ===================== ICON MAP ===================== */
const iconMap = {
    video: { bg: "bg-indigo-50", fg: "text-indigo-500", icon: "movie" },
    pdf: { bg: "bg-rose-50", fg: "text-rose-500", icon: "picture_as_pdf" },
    image: { bg: "bg-emerald-50", fg: "text-emerald-500", icon: "image" },
    audio: { bg: "bg-purple-50", fg: "text-purple-500", icon: "music_note" },
    archive: { bg: "bg-amber-50", fg: "text-amber-500", icon: "folder_zip" },
    doc: { bg: "bg-blue-50", fg: "text-blue-500", icon: "description" },
    text: { bg: "bg-slate-100", fg: "text-slate-500", icon: "article" },
    sheet: { bg: "bg-green-50", fg: "text-green-500", icon: "table_chart" },
    slide: { bg: "bg-orange-50", fg: "text-orange-500", icon: "slideshow" },
    generic: { bg: "bg-slate-100", fg: "text-slate-500", icon: "draft" },
};

/* ===================== LAZY VIDEO ===================== */
let videoIO = null;
function setupLazyVideos() {
    if (!videoIO) {
        videoIO = new IntersectionObserver((entries) => {
            for (const en of entries) {
                if (en.isIntersecting) {
                    const v = en.target;
                    const src = v.dataset.src;
                    if (src && !v.getAttribute("src")) {
                        v.setAttribute("src", src);
                        v.load();
                    }
                    videoIO.unobserve(v);
                }
            }
        }, { rootMargin: "200px" });
    }
    document.querySelectorAll("video[data-src]").forEach(v => {
        if (!v.getAttribute("src")) videoIO.observe(v);
    });
}

/* ===================== ROUTING (HASH) ===================== */
function getPathFromHash() {
    const h = location.hash.replace(/^#\/?/, "");
    try { return decodeURIComponent(h); } catch { return h; }
}

function navigate(path) {
    path = path || "";
    const target = "#/" + path;
    if (location.hash === target) {
        load(path);
    } else {
        location.hash = target;
    }
}

window.addEventListener("hashchange", () => {
    load(getPathFromHash());
});

/* ===================== LOAD & RENDER ===================== */
async function load(path = "") {
    currentPath = path;
    try {
        const res = await fetch(`/api/list?path=${encodeURIComponent(path)}`);
        if (!res.ok) throw new Error("Gagal muat");
        const data = await res.json();
        currentItems = data.items;
        renderAll(data);
    } catch (e) {
        document.getElementById("desktopMain").innerHTML = `<div class="text-center py-20 text-rose-500">❌ ${e.message}</div>`;
        document.getElementById("mobileMain").innerHTML = `<div class="m-empty"><span class="material-symbols-outlined">error</span><p>${e.message}</p></div>`;
    }
}

function renderAll(data) {
    renderBreadcrumbDesktop(data);
    renderBreadcrumbMobile(data);

    const count = currentItems.length;
    document.getElementById("itemCountDesktop").textContent = count;
    document.getElementById("itemCountLabelDesktop").textContent = count + " item";
    document.getElementById("itemBarDesktop").style.width = Math.min(100, count) + "%";
    document.getElementById("itemInfoDesktop").textContent =
        count === 0 ? "Folder kosong" : `${count} item di folder ini`;

    document.getElementById("itemCountMobile").textContent = count + " item";
    const pct = Math.min(100, count);
    document.getElementById("mStoragePct").textContent = pct + "%";
    document.getElementById("mStorageBar").style.width = pct + "%";
    document.getElementById("mStorageInfo").textContent =
        count === 0 ? "Folder kosong" : `${count} item`;

    if (isMobileWidth()) {
        renderMobileContent();
    } else {
        renderDesktopContent();
    }
}

function renderBreadcrumbDesktop(data) {
    const parts = data.path ? data.path.split("/") : [];
    let crumb = `<a onclick="navigate('')" class="flex items-center gap-1.5 text-slate-600 hover:text-indigo-600 cursor-pointer">
    <span class="text-base">🏠</span><span>shared</span>
  </a>`;
    let acc = "";
    parts.forEach(p => {
        acc = acc ? `${acc}/${p}` : p;
        crumb += `<svg class="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>`;
        crumb += `<span onclick="navigate('${escapeAttr(acc)}')" class="text-indigo-600 font-semibold px-2 py-0.5 bg-indigo-50 rounded-md cursor-pointer">${escapeHtml(p)}</span>`;
    });
    document.getElementById("breadcrumbDesktop").innerHTML = crumb;
}

function renderBreadcrumbMobile(data) {
    const parts = data.path ? data.path.split("/") : [];
    let crumb = `<a onclick="navigate('')">
    <span class="material-symbols-outlined">home</span>
    <span>Home</span>
  </a>`;
    let acc = "";
    parts.forEach((p, idx) => {
        acc = acc ? `${acc}/${p}` : p;
        crumb += `<span class="material-symbols-outlined">chevron_right</span>`;
        const isLast = idx === parts.length - 1;
        crumb += `<a onclick="navigate('${escapeAttr(acc)}')" class="${isLast ? 'current' : ''}">${escapeHtml(p)}</a>`;
    });
    document.getElementById("breadcrumbMobile").innerHTML = crumb;
}

function renderItems() {
    if (isMobileWidth()) renderMobileContent();
    else renderDesktopContent();
}

/* ===================== DESKTOP CONTENT ===================== */
function renderDesktopContent() {
    const q = searchQuery.toLowerCase().trim();
    const items = q ? currentItems.filter(i => i.name.toLowerCase().includes(q)) : currentItems;
    const folders = items.filter(i => i.is_dir);
    const files = items.filter(i => !i.is_dir);

    let html = "";

    if (currentPath) {
        html += `<div class="mb-4"><button onclick="loadParent()" class="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 px-3 py-2 rounded-xl hover:border-indigo-200 transition">⬆️ Naik satu folder</button></div>`;
    }

    if (folders.length) {
        html += `
      <div class="mb-8">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xs font-bold uppercase tracking-wider text-slate-400">Folder</h2>
          <span class="text-xs text-slate-400">${folders.length} folder</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          ${folders.map(f => desktopFolderCard(f)).join("")}
        </div>
      </div>`;
    }

    if (files.length) {
        html += `
      <div>
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xs font-bold uppercase tracking-wider text-slate-400">Berkas</h2>
          <span class="text-xs text-slate-400">${files.length} file</span>
        </div>
        <div class="${viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5' : 'list-view flex flex-col gap-2'}">
          ${files.map(f => desktopFileCard(f)).join("")}
        </div>
      </div>`;
    }

    if (!items.length) {
        html = `<div class="text-center py-20 text-slate-400"><div class="text-5xl mb-3">📂</div><p class="text-sm">${q ? "Tidak ada hasil" : "Folder kosong"}</p></div>`;
    }

    document.getElementById("desktopMain").innerHTML = html;
    setupLazyVideos();
}

function desktopFolderCard(f) {
    const p = currentPath ? `${currentPath}/${f.name}` : f.name;
    const safePath = escapeAttr(p);
    return `
    <div onclick="navigate('${safePath}')" class="group flex items-center justify-between p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all cursor-pointer">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center group-hover:scale-105 transition flex-shrink-0">
          <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M19.5 21a3 3 0 003-3v-4.5a3 3 0 00-3-3h-1.5V9a3 3 0 00-3-3h-3.879a3 3 0 01-2.121-.879L7.879 3.879A3 3 0 005.757 3H4.5A3 3 0 001.5 6v12a3 3 0 003 3h15z"/></svg>
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition truncate">${escapeHtml(f.name)}</p>
          <p class="text-[11px] text-slate-400">${formatDate(f.mtime)}</p>
        </div>
      </div>
      <button onclick="event.stopPropagation(); openContextMenu(event, '${safePath}', '${escapeAttr(f.name)}', true)"
        class="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition flex-shrink-0">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/></svg>
      </button>
    </div>`;
}

function desktopFileCard(f) {
    const p = currentPath ? `${currentPath}/${f.name}` : f.name;
    const safePath = escapeAttr(p);
    const urlPath = encodeURIComponent(p);
    const type = getFileType(f.name);
    const ext = fileExt(f.name).toUpperCase() || "FILE";

    const styleMap = {
        video: { bg: "bg-indigo-50/70", fg: "text-indigo-500", hover: "hover:border-indigo-300/80", icon: "video" },
        pdf: { bg: "bg-rose-50/60", fg: "text-rose-500", hover: "hover:border-rose-300/80", icon: "pdf" },
        image: { bg: "bg-emerald-50/70", fg: "text-emerald-500", hover: "hover:border-emerald-300/80", icon: "image" },
        audio: { bg: "bg-purple-50/70", fg: "text-purple-500", hover: "hover:border-purple-300/80", icon: "audio" },
        archive: { bg: "bg-amber-50/70", fg: "text-amber-500", hover: "hover:border-amber-300/80", icon: "archive" },
        doc: { bg: "bg-blue-50/70", fg: "text-blue-500", hover: "hover:border-blue-300/80", icon: "doc" },
        text: { bg: "bg-slate-100", fg: "text-slate-500", hover: "hover:border-slate-300", icon: "text" },
        sheet: { bg: "bg-green-50/70", fg: "text-green-500", hover: "hover:border-green-300/80", icon: "sheet" },
        slide: { bg: "bg-orange-50/70", fg: "text-orange-500", hover: "hover:border-orange-300/80", icon: "slide" },
        generic: { bg: "bg-slate-100", fg: "text-slate-500", hover: "hover:border-slate-300", icon: "generic" },
    };
    const st = styleMap[type] || styleMap.generic;

    const icons = {
        video: `<path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>`,
        pdf: `<path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>`,
        image: `<path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>`,
        audio: `<path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>`,
        archive: `<path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/>`,
        doc: `<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>`,
        text: `<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h10"/>`,
        sheet: `<path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>`,
        slide: `<path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10M12 17v4M5 3h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/>`,
        generic: `<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>`,
    };
    const iconSvg = icons[st.icon] || icons.generic;

    let thumbContent;
    if (type === "image") {
        thumbContent = `<img src="/api/thumb?path=${urlPath}" class="thumb-img" loading="lazy" alt="">`;
    } else if (type === "video") {
        thumbContent = `
      <video data-src="/api/file?path=${urlPath}#t=0.1" preload="none" muted playsinline class="thumb-img"></video>
      <div class="video-overlay"><span><svg class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span></div>`;
    } else {
        thumbContent = `<div class="thumb-inner w-12 h-12 rounded-2xl ${st.bg} ${st.fg} flex items-center justify-center shadow-sm">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${iconSvg}</svg>
    </div>`;
    }

    return `
    <article class="file-card group bg-white rounded-2xl border border-slate-200/80 p-3 shadow-sm hover:shadow-lg ${st.hover} transition-all cursor-pointer"
      onclick="handleFileClick(event, '${safePath}', '${escapeAttr(f.name)}', ${f.size})">

      <div class="thumb w-full aspect-video rounded-xl ${st.bg} relative overflow-hidden flex items-center justify-center border border-slate-100/60">
        ${thumbContent}
        <span class="thumb-badge">${escapeHtml(ext)}</span>
      </div>

      <div class="info">
        <div class="name" title="${escapeAttr(f.name)}">${escapeHtml(f.name)}</div>
        <div class="meta">${f.size_human} • ${formatDate(f.mtime)}</div>
      </div>

      <button class="menu-btn" onclick="event.stopPropagation(); openContextMenu(event, '${safePath}', '${escapeAttr(f.name)}', false)" aria-label="Menu">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>
        </svg>
      </button>
    </article>`;
}

/* ===================== MOBILE CONTENT ===================== */
function renderMobileContent() {
    const q = searchQuery.toLowerCase().trim();
    const items = q ? currentItems.filter(i => i.name.toLowerCase().includes(q)) : currentItems;
    const folders = items.filter(i => i.is_dir);
    const files = items.filter(i => !i.is_dir);

    let html = "";

    if (folders.length) {
        html += `
      <section class="m-section">
        <div class="m-section-head">
          <h2 class="m-section-title">Folder di Shared</h2>
          <span class="m-section-count">${folders.length} folder</span>
        </div>
        <div class="m-folders-grid">
          ${folders.map(f => mobileFolderCard(f)).join("")}
        </div>
      </section>`;
    }

    if (files.length) {
        html += `
      <section class="m-section">
        <div class="m-section-head">
          <h2 class="m-section-title">Berkas</h2>
          <span class="m-section-count">${files.length} file</span>
        </div>
        <div class="m-files-list">
          ${files.map(f => mobileFileCard(f)).join("")}
        </div>
      </section>`;
    }

    if (!items.length) {
        html = `<div class="m-empty">
      <span class="material-symbols-outlined">folder_off</span>
      <p>${q ? "Tidak ada hasil" : "Folder kosong"}</p>
    </div>`;
    }

    document.getElementById("mobileMain").innerHTML = html;
    document.getElementById("mobileSubtitle").textContent = currentPath || "Local Storage";
    setupLazyVideos();
}

function mobileFolderCard(f) {
    const p = currentPath ? `${currentPath}/${f.name}` : f.name;
    const safePath = escapeAttr(p);
    return `
    <div class="m-folder" onclick="navigate('${safePath}')">
      <div class="m-folder-top">
        <div class="m-folder-icon">
          <span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1;">folder</span>
        </div>
        <button class="m-folder-menu" onclick="event.stopPropagation(); openContextMenu(event, '${safePath}', '${escapeAttr(f.name)}', true)">
          <span class="material-symbols-outlined">more_vert</span>
        </button>
      </div>
      <div class="m-folder-name" title="${escapeAttr(f.name)}">${escapeHtml(f.name)}</div>
      <div class="m-folder-meta">${formatDate(f.mtime)}</div>
    </div>`;
}

function mobileFileCard(f) {
    const p = currentPath ? `${currentPath}/${f.name}` : f.name;
    const safePath = escapeAttr(p);
    const urlPath = encodeURIComponent(p);
    const type = getFileType(f.name);
    const ext = fileExt(f.name).toUpperCase() || "FILE";
    const ic = iconMap[type] || iconMap.generic;

    let thumbContent;
    if (type === "image") {
        thumbContent = `<img src="/api/thumb?path=${urlPath}" loading="lazy" alt="">`;
    } else if (type === "video") {
        thumbContent = `
      <video data-src="/api/file?path=${urlPath}#t=0.1" preload="none" muted playsinline></video>
      <div class="play-overlay">
        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </div>`;
    } else {
        thumbContent = `<div class="icon-inner ${ic.bg} ${ic.fg}">
      <span class="material-symbols-outlined" style="font-size:20px;">${ic.icon}</span>
    </div>`;
    }

    return `
    <div class="m-file" onclick="handleFileClick(event, '${safePath}', '${escapeAttr(f.name)}', ${f.size})">
      <div class="m-file-thumb">
        ${thumbContent}
        <span class="badge">${escapeHtml(ext)}</span>
      </div>
      <div class="m-file-info">
        <div class="m-file-name">${escapeHtml(f.name)}</div>
        <div class="m-file-meta">${f.size_human} • ${formatDate(f.mtime)}</div>
      </div>
      <button class="m-file-more" onclick="event.stopPropagation(); openContextMenu(event, '${safePath}', '${escapeAttr(f.name)}', false)">
        <span class="material-symbols-outlined">more_vert</span>
      </button>
    </div>`;
}

/* ===================== SHARED ACTIONS ===================== */
function handleFileClick(e, path, name, size) {
    if (e.target.closest("button")) return;
    if (isPreviewable(name)) openPreview(path, name, size);
    else downloadFile(path);
}

function loadParent() {
    const parent = currentPath.split("/").slice(0, -1).join("/");
    navigate(parent);
}

function setView(mode) {
    viewMode = mode;
    const grid = document.getElementById("viewGridBtn");
    const list = document.getElementById("viewListBtn");
    if (mode === "grid") {
        grid.className = "p-1.5 rounded-md bg-white text-indigo-600 shadow-sm";
        list.className = "p-1.5 rounded-md text-slate-400 hover:text-slate-700";
    } else {
        grid.className = "p-1.5 rounded-md text-slate-400 hover:text-slate-700";
        list.className = "p-1.5 rounded-md bg-white text-indigo-600 shadow-sm";
    }
    if (!isMobileWidth()) renderDesktopContent();
}

function filterItems() { renderItems(); }

/* ===================== CONTEXT MENU ===================== */
function openContextMenu(e, path, name, isDir) {
    e.stopPropagation();
    ctxPath = path; ctxName = name; ctxIsDir = isDir;

    const menu = document.getElementById("contextMenu");
    const dlBtn = menu.querySelector('[data-action="download"]');
    dlBtn.style.display = isDir ? "none" : "flex";

    menu.classList.remove("hidden");

    const rect = e.currentTarget.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    let left = rect.right - menuRect.width;
    let top = rect.bottom + 6;
    if (left < 8) left = 8;
    if (left + menuRect.width > window.innerWidth - 8) left = window.innerWidth - menuRect.width - 8;
    if (top + menuRect.height > window.innerHeight - 8) top = rect.top - menuRect.height - 6;
    if (top < 8) top = 8;
    menu.style.left = left + "px";
    menu.style.top = top + "px";
}
function closeContextMenu() {
    document.getElementById("contextMenu").classList.add("hidden");
}
document.addEventListener("click", closeContextMenu);
document.addEventListener("scroll", closeContextMenu, { capture: true, passive: true });
window.addEventListener("resize", closeContextMenu);
document.getElementById("contextMenu").addEventListener("click", e => e.stopPropagation());

function ctxRename() { const p = ctxPath, n = ctxName; closeContextMenu(); openRename(p, n); }
function ctxDownload() { const p = ctxPath; closeContextMenu(); downloadFile(p); }
function ctxDelete() { const p = ctxPath, n = ctxName; closeContextMenu(); delItem(p, n); }

/* ===================== FAB MENU ===================== */
function showFabMenu() {
    document.getElementById("fabBackdrop").classList.add("show");
    document.getElementById("fabMenu").classList.add("show");
}
function closeFabMenu() {
    document.getElementById("fabBackdrop").classList.remove("show");
    document.getElementById("fabMenu").classList.remove("show");
}

/* ===================== NEW FOLDER ===================== */
async function newFolder() {
    const name = prompt("Nama folder:");
    if (!name) return;
    const res = await fetch("/api/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: currentPath, name })
    });
    if (res.ok) load(currentPath);
    else alert((await res.json()).error);
}

/* ===================== DELETE ===================== */
async function delItem(path, name) {
    if (!confirm(`Hapus "${name}"?`)) return;
    const res = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path })
    });
    if (res.ok) load(currentPath);
    else alert("Gagal hapus");
}

/* ===================== RENAME ===================== */
function openRename(path, name) {
    renamePath = path;
    renameInput.value = name;
    renameModal.classList.remove("hidden");
    renameModal.classList.add("flex");
    setTimeout(() => {
        renameInput.focus();
        const dot = name.lastIndexOf(".");
        if (dot > 0) renameInput.setSelectionRange(0, dot);
        else renameInput.select();
    }, 50);
}
function closeRename() {
    renameModal.classList.add("hidden");
    renameModal.classList.remove("flex");
    renamePath = "";
}
async function confirmRename() {
    const newName = renameInput.value.trim();
    if (!newName) return;
    const res = await fetch("/api/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: renamePath, new_name: newName })
    });
    if (res.ok) { closeRename(); load(currentPath); }
    else alert((await res.json()).error || "Gagal rename");
}
renameInput.addEventListener("keydown", e => {
    if (e.key === "Enter") confirmRename();
    if (e.key === "Escape") closeRename();
});

/* ===================== PREVIEW ===================== */
async function openPreview(path, name, size) {
    previewPath = path;
    previewTitle.textContent = name;
    previewSubtitle.textContent = size ? (size / 1024 / 1024).toFixed(2) + " MB" : "";
    previewBody.innerHTML = `<div class="text-slate-400 text-sm">⏳ Memuat...</div>`;
    previewModal.classList.remove("hidden");
    previewModal.classList.add("flex");

    const url = `/api/file?path=${encodeURIComponent(path)}`;
    const type = getFileType(name);

    if (type === "image") previewBody.innerHTML = `<img src="${url}" class="max-w-full max-h-[80vh] rounded-lg shadow-md">`;
    else if (type === "video") previewBody.innerHTML = `<video src="${url}" controls autoplay class="max-w-full max-h-[80vh] rounded-lg shadow-md"></video>`;
    else if (type === "audio") previewBody.innerHTML = `<div class="w-full max-w-lg p-6 bg-white rounded-2xl shadow"><div class="text-center text-6xl mb-4">🎵</div><div class="text-center text-sm font-semibold text-slate-700 mb-3">${escapeHtml(name)}</div><audio src="${url}" controls autoplay class="w-full"></audio></div>`;
    else if (type === "pdf") previewBody.innerHTML = `<iframe src="${url}" class="w-full h-[80vh] rounded-lg shadow"></iframe>`;
    else if (type === "text") {
        if (size > TEXT_MAX) {
            previewBody.innerHTML = `<div class="text-center p-8"><div class="text-4xl mb-3">📄</div><p class="text-sm text-slate-500 mb-4">File terlalu besar (${(size / 1024 / 1024).toFixed(1)} MB)</p><button onclick="downloadCurrent()" class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">Download</button></div>`;
            return;
        }
        try {
            const res = await fetch(url);
            const text = await res.text();
            previewBody.innerHTML = `<pre class="w-full text-xs font-mono bg-slate-900 text-slate-100 p-4 rounded-xl overflow-auto max-h-[80vh] whitespace-pre-wrap break-words">${escapeHtml(text)}</pre>`;
        } catch { previewBody.innerHTML = "❌ Gagal memuat"; }
    } else {
        previewBody.innerHTML = `<div class="text-center p-8"><div class="text-4xl mb-3">📎</div><p class="text-sm text-slate-500 mb-4">Preview tidak tersedia</p><button onclick="downloadCurrent()" class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">Download</button></div>`;
    }
}
function closePreview() {
    previewModal.classList.add("hidden");
    previewModal.classList.remove("flex");
    previewBody.innerHTML = "";
    previewPath = "";
}
function downloadCurrent() { if (previewPath) downloadFile(previewPath); }
function downloadFile(path) {
    window.location.href = `/download?path=${encodeURIComponent(path)}`;
}

previewModal.addEventListener("click", e => { if (e.target === previewModal) closePreview(); });
renameModal.addEventListener("click", e => { if (e.target === renameModal) closeRename(); });
document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
        if (!previewModal.classList.contains("hidden")) closePreview();
        if (!renameModal.classList.contains("hidden")) closeRename();
        closeContextMenu();
        closeFabMenu();
    }
});

/* ===================== UPLOAD ===================== */
fileInput.onchange = async () => {
    await uploadFiles([...fileInput.files], false);
    fileInput.value = "";
};

function pickFolder() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.webkitdirectory = true;
    inp.multiple = true;
    inp.onchange = async () => {
        if (inp.files && inp.files.length) await uploadFiles([...inp.files], true);
    };
    inp.click();
}

let dragCounter = 0;
document.body.addEventListener("dragenter", e => {
    e.preventDefault();
    dragCounter++;
    if (e.dataTransfer.types.includes("Files")) {
        const d = document.getElementById("desktopMain");
        if (d) d.classList.add("drop-active");
    }
});
document.body.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; });
document.body.addEventListener("dragleave", e => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
        dragCounter = 0;
        const d = document.getElementById("desktopMain");
        if (d) d.classList.remove("drop-active");
    }
});
document.body.addEventListener("drop", async e => {
    e.preventDefault();
    dragCounter = 0;
    const d = document.getElementById("desktopMain");
    if (d) d.classList.remove("drop-active");
    const items = [...e.dataTransfer.items];
    const entries = items.map(it => it.webkitGetAsEntry?.()).filter(Boolean);
    const files = [];
    if (entries.length) { for (const entry of entries) files.push(...await traverseEntry(entry, "")); }
    else files.push(...e.dataTransfer.files);
    if (files.length) await uploadFiles(files, true);
});

async function traverseEntry(entry, path = "") {
    if (entry.isFile) {
        const file = await new Promise((res, rej) => entry.file(res, rej));
        file._relativePath = path ? `${path}/${entry.name}` : entry.name;
        return [file];
    }
    if (entry.isDirectory) {
        const reader = entry.createReader();
        const all = [];
        const readBatch = () => new Promise((res, rej) => {
            reader.readEntries(batch => {
                if (!batch.length) return res();
                all.push(...batch);
                readBatch().then(res).catch(rej);
            }, rej);
        });
        await readBatch();
        const newPath = path ? `${path}/${entry.name}` : entry.name;
        const results = [];
        for (const child of all) results.push(...await traverseEntry(child, newPath));
        return results;
    }
    return [];
}

async function uploadFiles(files, keepStructure = false) {
    if (!files.length) return;

    const isMobile = isMobileWidth();
    const widget = document.getElementById("uploadWidget");
    const fill = document.getElementById("uploadFill");
    const pctEl = document.getElementById("uploadPercent");
    const nameEl = document.getElementById("uploadName");
    const metaEl = document.getElementById("uploadMeta");
    const mToast = document.getElementById("mUploadToast");
    const mFill = document.getElementById("mUploadFill");
    const mName = document.getElementById("mUploadName");
    const mMeta = document.getElementById("mUploadMeta");

    if (isMobile) {
        mToast.classList.add("show");
        mFill.style.width = "0%";
    } else {
        widget.classList.remove("hidden");
        fill.style.width = "0%";
        pctEl.textContent = "0%";
    }

    const totalBytes = files.reduce((s, f) => s + f.size, 0) || 1;
    let sentBytes = 0;
    const startTime = Date.now();

    for (const file of files) {
        let relPath = currentPath;
        const rel = file._relativePath || file.webkitRelativePath;
        if (keepStructure && rel) {
            const parts = rel.split("/");
            parts.pop();
            if (parts.length) relPath = currentPath ? `${currentPath}/${parts.join("/")}` : parts.join("/");
        }

        await uploadOne(file, relPath, (loaded) => {
            const totalSent = sentBytes + loaded;
            const pct = (totalSent / totalBytes) * 100;
            const elapsed = (Date.now() - startTime) / 1000;
            const speed = totalSent / elapsed / 1024 / 1024;
            const remaining = (totalBytes - totalSent) / (totalSent / elapsed || 1);

            if (isMobile) {
                mFill.style.width = pct + "%";
                mName.textContent = file.name;
                mMeta.textContent = `${pct.toFixed(0)}% • ${speed.toFixed(1)} MB/dtk` + (remaining > 0 ? ` (sisa ${Math.round(remaining)} dtk)` : "");
            } else {
                fill.style.width = pct + "%";
                pctEl.textContent = pct.toFixed(0) + "%";
                nameEl.textContent = file.name;
                metaEl.textContent = `${speed.toFixed(1)} MB/s • ${remaining > 0 ? Math.round(remaining) + " detik tersisa" : "selesai"}`;
            }
        });

        sentBytes += file.size;
    }

    if (isMobile) {
        mName.textContent = "✅ Selesai!";
        mMeta.textContent = `${files.length} file terunggah`;
        mFill.style.width = "100%";
        setTimeout(() => mToast.classList.remove("show"), 1800);
    } else {
        nameEl.textContent = "✅ Selesai!";
        metaEl.textContent = `${files.length} file terunggah`;
        fill.style.width = "100%";
        pctEl.textContent = "100%";
        setTimeout(() => widget.classList.add("hidden"), 1800);
    }

    load(currentPath);
}

function uploadOne(file, relPath, onProgress) {
    return new Promise((resolve, reject) => {
        const uploadId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

        if (file.size <= CHUNK_SIZE) {
            const fd = new FormData();
            fd.append("chunk", file);
            fd.append("index", 0);
            fd.append("total", 1);
            fd.append("filename", file.name);
            fd.append("path", relPath);
            fd.append("upload_id", uploadId);
            fetch("/api/upload-chunk", { method: "POST", body: fd })
                .then(r => r.json())
                .then(() => { onProgress(file.size); resolve(); })
                .catch(reject);
            return;
        }

        const total = Math.ceil(file.size / CHUNK_SIZE);
        let index = 0;
        const sendNext = () => {
            if (index >= total) return resolve();
            const start = index * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);
            const fd = new FormData();
            fd.append("chunk", chunk);
            fd.append("index", index);
            fd.append("total", total);
            fd.append("filename", file.name);
            fd.append("path", relPath);
            fd.append("upload_id", uploadId);
            fetch("/api/upload-chunk", { method: "POST", body: fd })
                .then(r => r.json())
                .then(() => { index++; onProgress(end); sendNext(); })
                .catch(reject);
        };
        sendNext();
    });
}

/* ===================== RESIZE (shell switch) ===================== */
let lastIsMobile = isMobileWidth();
let resizeTimer = null;
window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const nowMobile = isMobileWidth();
        if (nowMobile !== lastIsMobile) {
            lastIsMobile = nowMobile;
            renderAll({ path: currentPath, items: currentItems });
        }
    }, 200);
});

/* ===================== INIT ===================== */
load(getPathFromHash());