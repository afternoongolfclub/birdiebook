// ===== Firebase Config =====
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: "AIzaSyDD393IatV6lvAqQiiNwVDnnUMuqSXjE38",
    authDomain: "birdie-book-8caf0.firebaseapp.com",
    projectId: "birdie-book-8caf0",
    storageBucket: "birdie-book-8caf0.firebasestorage.app",
    messagingSenderId: "272783196581",
    appId: "1:272783196581:web:25db3b05dfe6fe3fafe84c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Firestore document references
const hccRef = doc(db, 'birdiebook', 'hcc_birdies');
const otherRef = doc(db, 'birdiebook', 'other_birdies');
const milestonesRef = doc(db, 'birdiebook', 'milestones');

// ===== Configuration =====
const COURSE = {
    name: 'Huntsville Country Club',
    holes: 19,
    pars: [4, 5, 4, 3, 4, 5, 4, 3, 4, 3, 5, 4, 4, 5, 3, 4, 3, 4, 3]
};

// ===== State =====
// birdies: { "1": ["2026-01-15", "2026-03-02"], "2": [], ... }
let birdies = {};
let achievedMilestones = {};
// otherBirdies: [{ course, hole, par, date }, ...]
let otherBirdies = [];
let currentBirdieFilter = 'all';
let firestoreReady = false;

// Initialize birdies object for all holes
function initBirdies(data) {
    birdies = data || {};
    for (let i = 1; i <= COURSE.holes; i++) {
        if (!birdies[i]) birdies[i] = [];
    }
}

// ===== Firestore Sync =====
async function saveHccBirdies() {
    await setDoc(hccRef, { data: birdies });
}

async function saveOtherBirdies() {
    await setDoc(otherRef, { data: otherBirdies });
}

async function saveMilestones() {
    await setDoc(milestonesRef, { data: achievedMilestones });
}

// Listen for real-time updates from Firestore
function startListeners() {
    onSnapshot(hccRef, snap => {
        const d = snap.exists() ? snap.data().data : {};
        initBirdies(d);
        renderAll();
    });

    onSnapshot(otherRef, snap => {
        otherBirdies = snap.exists() ? snap.data().data : [];
        renderAll();
    });

    onSnapshot(milestonesRef, snap => {
        achievedMilestones = snap.exists() ? snap.data().data : {};
        renderMilestones();
    });
}

// ===== Bootstrap =====
async function bootstrap() {
    // Show loading state
    document.getElementById('holeGrid').innerHTML = '<p style="color:#6b7280;padding:1rem;">Loading…</p>';

    try {
        // Fetch initial data then start live listeners
        const [hccSnap, otherSnap, msSnap] = await Promise.all([
            getDoc(hccRef),
            getDoc(otherRef),
            getDoc(milestonesRef)
        ]);

        initBirdies(hccSnap.exists() ? hccSnap.data().data : {});
        otherBirdies = otherSnap.exists() ? otherSnap.data().data : [];
        achievedMilestones = msSnap.exists() ? msSnap.data().data : {};

        firestoreReady = true;
        renderAll();
        startListeners();
    } catch (err) {
        console.error('Firestore error:', err);
        initBirdies({});
        otherBirdies = [];
        achievedMilestones = {};
        renderAll();
        document.getElementById('hccProgress').innerHTML =
            '<span style="color:#ef4444;font-size:0.85rem;">⚠️ Could not connect to database. Check Firebase setup.</span>';
    }
}

// ===== Tab Navigation =====
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');

        if (tab.dataset.tab === 'stats') renderStats();
    });
});

// ===== Huntsville CC Progress =====
function renderHccProgress() {
    const birdied = Object.values(birdies).filter(dates => dates.length > 0).length;
    const pct = Math.round((birdied / COURSE.holes) * 100);
    document.getElementById('hccProgress').innerHTML = `
        <span class="progress-text">${birdied} / ${COURSE.holes} holes birdied</span>
        <div class="progress-bar-container">
            <div class="progress-bar-fill" style="width: ${pct}%"></div>
        </div>
        <span class="progress-text">${pct}%</span>
    `;
}

// ===== Birdie Grid (Huntsville CC) =====
function renderHoleGrid() {
    const grid = document.getElementById('holeGrid');
    grid.innerHTML = '';
    for (let i = 1; i <= COURSE.holes; i++) {
        const dates = birdies[i] || [];
        const isBirdied = dates.length > 0;
        const card = document.createElement('div');
        card.className = `hole-card${isBirdied ? ' birdied' : ''}`;
        card.innerHTML = `
            <div class="hole-label">Hole</div>
            <div class="hole-number">${i}</div>
            <div class="hole-status">${isBirdied ? '🐦 Birdied' : `Par ${COURSE.pars[i - 1]}`}</div>
            ${dates.length > 1 ? `<div class="birdie-count-badge">${dates.length}</div>` : ''}
        `;
        card.addEventListener('click', () => openModal(i));
        grid.appendChild(card);
    }
}

// ===== Modal (with Date Picker) =====
let currentModalHole = null;

function openModal(hole) {
    currentModalHole = hole;
    const dates = birdies[hole] || [];
    document.getElementById('modalTitle').textContent = `Hole ${hole} — Par ${COURSE.pars[hole - 1]}`;

    const body = document.getElementById('modalBody');
    if (dates.length === 0) {
        body.innerHTML = '<p style="color:#6b7280;">No birdies yet. You got this!</p>';
    } else {
        body.innerHTML = dates.map((d, idx) => `
            <div class="birdie-date-item">
                <span>🐦 Birdie #${idx + 1}</span>
                <span>${formatDate(d)}</span>
            </div>
        `).join('');
    }

    document.getElementById('modalBirdieDate').valueAsDate = new Date();
    document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
    currentModalHole = null;
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
});

document.getElementById('modalLogBirdie').addEventListener('click', async () => {
    if (currentModalHole === null) return;
    const date = document.getElementById('modalBirdieDate').value;
    if (!date) { alert('Please select a date.'); return; }
    birdies[currentModalHole].push(date);
    birdies[currentModalHole].sort();
    await saveHccBirdies();
    checkMilestones();
    openModal(currentModalHole);
});

document.getElementById('modalRemoveLast').addEventListener('click', async () => {
    if (currentModalHole === null) return;
    const dates = birdies[currentModalHole];
    if (dates.length > 0) {
        dates.pop();
        await saveHccBirdies();
        checkMilestones();
        openModal(currentModalHole);
    }
});

// ===== All Birdies Section =====
function getAllBirdiesFlat() {
    const all = [];
    Object.entries(birdies).forEach(([hole, dates]) => {
        dates.forEach(d => {
            all.push({ hole: parseInt(hole), date: d, par: COURSE.pars[parseInt(hole) - 1], course: COURSE.name });
        });
    });
    otherBirdies.forEach(b => {
        all.push({ hole: b.hole, date: b.date, par: b.par, course: b.course });
    });
    all.sort((a, b) => b.date.localeCompare(a.date));
    return all;
}

function filterBirdies(list, filter) {
    if (filter === 'all') return list;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    if (filter === 'year') {
        return list.filter(b => new Date(b.date + 'T00:00:00').getFullYear() === year);
    }
    if (filter === 'month') {
        return list.filter(b => {
            const d = new Date(b.date + 'T00:00:00');
            return d.getFullYear() === year && d.getMonth() === month;
        });
    }
    return list;
}

function renderAllBirdiesSummary() {
    const all = getAllBirdiesFlat();
    const uniqueHoles = Object.values(birdies).filter(d => d.length > 0).length;

    let mostBirdiedHole = '—';
    let mostBirdiedCount = 0;
    Object.entries(birdies).forEach(([hole, dates]) => {
        if (dates.length > mostBirdiedCount) {
            mostBirdiedCount = dates.length;
            mostBirdiedHole = `#${hole}`;
        }
    });
    if (mostBirdiedCount === 0) mostBirdiedHole = '—';

    const uniqueDates = [...new Set(all.map(b => b.date))].sort().reverse();
    let streak = 0;
    if (uniqueDates.length > 0) {
        streak = 1;
        for (let i = 1; i < uniqueDates.length; i++) {
            const d1 = new Date(uniqueDates[i - 1] + 'T00:00:00');
            const d2 = new Date(uniqueDates[i] + 'T00:00:00');
            if ((d1 - d2) / 86400000 === 1) streak++;
            else break;
        }
    }

    document.getElementById('allBirdiesSummary').innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${all.length}</div>
            <div class="stat-label">Total Birdies</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${uniqueHoles}</div>
            <div class="stat-label">Unique Holes</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${mostBirdiedHole}</div>
            <div class="stat-label">Most Birdied</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${streak}</div>
            <div class="stat-label">Day Streak</div>
        </div>
    `;
}

function renderAllBirdiesList() {
    const all = getAllBirdiesFlat();
    const filtered = filterBirdies(all, currentBirdieFilter);
    const list = document.getElementById('allBirdiesList');

    if (filtered.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🐦</div>
                <div class="empty-state-text">${all.length === 0 ? 'No birdies logged yet. Get out there!' : 'No birdies in this time period.'}</div>
            </div>
        `;
        return;
    }

    const grouped = {};
    filtered.forEach(b => {
        if (!grouped[b.date]) grouped[b.date] = [];
        grouped[b.date].push(b);
    });

    let html = '';
    Object.keys(grouped).sort().reverse().forEach(date => {
        grouped[date].forEach(b => {
            html += `
                <div class="birdie-log-item">
                    <div class="birdie-log-icon">🐦</div>
                    <div class="birdie-log-details">
                        <div class="birdie-log-hole">Hole ${b.hole}</div>
                        <div class="birdie-log-meta">Par ${b.par} — ${b.course}</div>
                    </div>
                    <div class="birdie-log-date">${formatDate(b.date)}</div>
                </div>
            `;
        });
    });

    list.innerHTML = html;
}

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentBirdieFilter = btn.dataset.filter;
        renderAllBirdiesList();
    });
});

// ===== Stats & Charts =====
function renderStats() {
    const birdiedHoles = Object.values(birdies).filter(d => d.length > 0).length;
    const totalBirdies = Object.values(birdies).reduce((sum, d) => sum + d.length, 0);
    const unbirdied = [];
    for (let i = 1; i <= COURSE.holes; i++) {
        if ((birdies[i] || []).length === 0) unbirdied.push(i);
    }

    const now = new Date();
    const thisMonthBirdies = getAllBirdiesFlat().filter(b => {
        const d = new Date(b.date + 'T00:00:00');
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;

    const monthCounts = {};
    getAllBirdiesFlat().forEach(b => {
        const key = b.date.substring(0, 7);
        monthCounts[key] = (monthCounts[key] || 0) + 1;
    });
    let bestMonth = '—';
    let bestMonthCount = 0;
    Object.entries(monthCounts).forEach(([m, count]) => {
        if (count > bestMonthCount) {
            bestMonthCount = count;
            bestMonth = new Date(m + '-01T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        }
    });

    document.getElementById('statsCards').innerHTML = `
        <div class="stat-card">
            <div class="stat-value">${birdiedHoles}/${COURSE.holes}</div>
            <div class="stat-label">Unique Holes Birdied</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${totalBirdies}</div>
            <div class="stat-label">Total Birdies</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${unbirdied.length}</div>
            <div class="stat-label">Holes Remaining</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${thisMonthBirdies}</div>
            <div class="stat-label">Birdies This Month</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${bestMonth}</div>
            <div class="stat-label">Best Month</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${Object.keys(monthCounts).length}</div>
            <div class="stat-label">Active Months</div>
        </div>
    `;

    renderBirdieChart();
    renderBirdiesByHoleChart();
}

function renderBirdieChart() {
    const canvas = document.getElementById('birdieChart');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = rect.width - 32;
    const height = 250;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const allBirdieDates = [];
    Object.entries(birdies).forEach(([hole, dates]) => {
        dates.forEach(d => allBirdieDates.push({ hole: parseInt(hole), date: d }));
    });

    if (allBirdieDates.length === 0) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('No birdies logged yet', width / 2, height / 2);
        return;
    }

    allBirdieDates.sort((a, b) => a.date.localeCompare(b.date));

    const seenHoles = new Set();
    const points = [];
    allBirdieDates.forEach(({ hole, date }) => {
        seenHoles.add(hole);
        points.push({ date, count: seenHoles.size });
    });

    const pad = { top: 20, right: 20, bottom: 40, left: 40 };
    const cw = width - pad.left - pad.right;
    const ch = height - pad.top - pad.bottom;
    const maxY = COURSE.holes;
    const minDate = new Date(points[0].date);
    const maxDate = new Date(points[points.length - 1].date);
    const dateRange = Math.max(maxDate - minDate, 86400000);

    function x(date) { return pad.left + ((new Date(date) - minDate) / dateRange) * cw; }
    function y(val) { return pad.top + ch - (val / maxY) * ch; }

    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= maxY; i += Math.ceil(maxY / 5)) {
        ctx.beginPath();
        ctx.moveTo(pad.left, y(i));
        ctx.lineTo(width - pad.right, y(i));
        ctx.stroke();
        ctx.fillStyle = '#6b7280';
        ctx.font = '11px system-ui';
        ctx.textAlign = 'right';
        ctx.fillText(i, pad.left - 8, y(i) + 4);
    }

    ctx.strokeStyle = '#ffc107';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pad.left, y(COURSE.holes));
    ctx.lineTo(width - pad.right, y(COURSE.holes));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 11px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText('GOAL: 19', width - pad.right, y(COURSE.holes) - 6);

    ctx.strokeStyle = '#2d8a4e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    points.forEach((p, i) => {
        const px = x(p.date), py = y(p.count);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();

    points.forEach(p => {
        ctx.fillStyle = '#2d8a4e';
        ctx.beginPath();
        ctx.arc(x(p.date), y(p.count), 4, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.fillStyle = '#6b7280';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';
    const dateLabels = [points[0].date];
    if (points.length > 1) dateLabels.push(points[points.length - 1].date);
    dateLabels.forEach(d => ctx.fillText(formatDateShort(d), x(d), height - 8));
}

function renderBirdiesByHoleChart() {
    const canvas = document.getElementById('scoreChart');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const width = rect.width - 32;
    const height = 250;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const counts = [];
    for (let i = 1; i <= COURSE.holes; i++) {
        counts.push({ hole: i, count: (birdies[i] || []).length });
    }

    const maxVal = Math.max(...counts.map(c => c.count), 1);

    if (counts.every(c => c.count === 0)) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '14px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('No birdies logged yet', width / 2, height / 2);
        return;
    }

    const pad = { top: 20, right: 10, bottom: 40, left: 35 };
    const cw = width - pad.left - pad.right;
    const ch = height - pad.top - pad.bottom;
    const barWidth = Math.min(30, cw / COURSE.holes - 4);

    counts.forEach((c, i) => {
        const barX = pad.left + (i / COURSE.holes) * cw + (cw / COURSE.holes - barWidth) / 2;
        const barH = maxVal > 0 ? (c.count / maxVal) * ch : 0;
        const barY = pad.top + ch - barH;

        ctx.fillStyle = c.count > 0 ? '#4caf50' : '#e5e7eb';
        ctx.fillRect(barX, c.count > 0 ? barY : pad.top + ch - 3, barWidth, c.count > 0 ? barH : 3);

        ctx.fillStyle = '#374151';
        ctx.font = '9px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(c.hole, barX + barWidth / 2, height - 10);

        if (c.count > 0) {
            ctx.fillStyle = '#6b7280';
            ctx.font = 'bold 10px system-ui';
            ctx.fillText(c.count, barX + barWidth / 2, barY - 6);
        }
    });
}

// ===== Milestones =====
const HCC_MILESTONES = [
    { id: 'hcc_first', title: 'First Birdie', desc: 'Log your first birdie at Huntsville CC', check: () => Object.values(birdies).some(d => d.length > 0) },
    { id: 'hcc_five', title: '5 Unique Holes', desc: 'Birdie 5 different holes', check: () => Object.values(birdies).filter(d => d.length > 0).length >= 5 },
    { id: 'hcc_ten', title: 'Halfway There', desc: 'Birdie 10 different holes', check: () => Object.values(birdies).filter(d => d.length > 0).length >= 10 },
    { id: 'hcc_fifteen', title: 'Home Stretch', desc: 'Birdie 15 different holes', check: () => Object.values(birdies).filter(d => d.length > 0).length >= 15 },
    { id: 'hcc_all', title: 'The Full Course!', desc: 'Birdie every single hole at Huntsville CC', check: () => Object.values(birdies).filter(d => d.length > 0).length >= COURSE.holes },
];

const OVERALL_MILESTONES = [
    { id: 'total_10', title: 'Double Digits', desc: 'Log 10 total birdies', check: () => getAllBirdiesFlat().length >= 10 },
    { id: 'total_25', title: 'Birdie Machine', desc: 'Log 25 total birdies', check: () => getAllBirdiesFlat().length >= 25 },
    { id: 'total_50', title: 'Half Century', desc: 'Log 50 total birdies', check: () => getAllBirdiesFlat().length >= 50 },
    { id: 'total_100', title: 'Century Club', desc: 'Log 100 total birdies', check: () => getAllBirdiesFlat().length >= 100 },
    { id: 'multi_3', title: 'Triple Threat', desc: 'Birdie the same hole 3 times', check: () => Object.values(birdies).some(d => d.length >= 3) },
    { id: 'multi_5', title: 'Favorite Hole', desc: 'Birdie the same hole 5 times', check: () => Object.values(birdies).some(d => d.length >= 5) },
    { id: 'streak_3', title: 'Hot Streak', desc: 'Log birdies on 3 consecutive days', check: () => {
        const dates = [...new Set(getAllBirdiesFlat().map(b => b.date))].sort();
        for (let i = 0; i <= dates.length - 3; i++) {
            const d1 = new Date(dates[i] + 'T00:00:00');
            const d2 = new Date(dates[i + 1] + 'T00:00:00');
            const d3 = new Date(dates[i + 2] + 'T00:00:00');
            if ((d2 - d1) === 86400000 && (d3 - d2) === 86400000) return true;
        }
        return false;
    }},
    { id: 'month_10', title: 'Monster Month', desc: 'Log 10+ birdies in a single month', check: () => {
        const monthCounts = {};
        getAllBirdiesFlat().forEach(b => {
            const key = b.date.substring(0, 7);
            monthCounts[key] = (monthCounts[key] || 0) + 1;
        });
        return Object.values(monthCounts).some(c => c >= 10);
    }},
];

async function checkMilestones() {
    const allMilestones = [...HCC_MILESTONES, ...OVERALL_MILESTONES];
    let newAchievements = [];
    allMilestones.forEach(m => {
        if (!achievedMilestones[m.id] && m.check()) {
            achievedMilestones[m.id] = new Date().toISOString().split('T')[0];
            newAchievements.push(m.title);
        }
    });
    await saveMilestones();
    if (newAchievements.length > 0) {
        setTimeout(() => alert(`🏆 Milestone unlocked: ${newAchievements.join(', ')}!`), 300);
    }
}

function renderMilestoneList(milestones, containerId) {
    document.getElementById(containerId).innerHTML = milestones.map(m => {
        const achieved = achievedMilestones[m.id];
        return `
            <div class="milestone ${achieved ? 'achieved' : 'pending'}">
                <div class="milestone-icon">${achieved ? '🏆' : '🔒'}</div>
                <div class="milestone-info">
                    <div class="milestone-title">${m.title}</div>
                    <div class="milestone-desc">${m.desc}</div>
                    ${achieved ? `<div class="milestone-date">Achieved: ${formatDate(achieved)}</div>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderMilestones() {
    renderMilestoneList(HCC_MILESTONES, 'hccMilestoneList');
    renderMilestoneList(OVERALL_MILESTONES, 'overallMilestoneList');
}

// ===== Other Course Birdie Modal =====
function getOtherCourseNames() {
    return [...new Set(otherBirdies.map(b => b.course))].sort();
}

function populateCourseDropdown() {
    const select = document.getElementById('otherCourseSelect');
    select.innerHTML = '<option value="">Select a course…</option>';
    getOtherCourseNames().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '+ Add new course…';
    select.appendChild(newOpt);
}

function openOtherBirdieModal() {
    populateCourseDropdown();
    document.getElementById('newCourseField').style.display = 'none';
    document.getElementById('newCourseName').value = '';
    document.getElementById('otherHoleNumber').value = '';
    document.getElementById('otherPar').value = '';
    document.getElementById('otherBirdieDate').valueAsDate = new Date();
    document.getElementById('otherBirdieOverlay').classList.add('open');
}

function closeOtherBirdieModal() {
    document.getElementById('otherBirdieOverlay').classList.remove('open');
}

document.getElementById('openOtherBirdieModal').addEventListener('click', openOtherBirdieModal);
document.getElementById('otherBirdieClose').addEventListener('click', closeOtherBirdieModal);
document.getElementById('otherBirdieOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('otherBirdieOverlay')) closeOtherBirdieModal();
});

document.getElementById('otherCourseSelect').addEventListener('change', (e) => {
    document.getElementById('newCourseField').style.display = e.target.value === '__new__' ? 'block' : 'none';
});

document.getElementById('otherBirdieSubmit').addEventListener('click', async () => {
    const select = document.getElementById('otherCourseSelect');
    let course = select.value;
    if (course === '__new__') course = document.getElementById('newCourseName').value.trim();
    const hole = parseInt(document.getElementById('otherHoleNumber').value);
    const par = parseInt(document.getElementById('otherPar').value);
    const date = document.getElementById('otherBirdieDate').value;

    if (!course) { alert('Please select or enter a course name.'); return; }
    if (!hole || hole < 1 || hole > 19) { alert('Please enter a valid hole number (1–19).'); return; }
    if (!par) { alert('Please select the par for this hole.'); return; }
    if (!date) { alert('Please select a date.'); return; }

    otherBirdies.push({ course, hole, par, date });
    otherBirdies.sort((a, b) => a.date.localeCompare(b.date));
    await saveOtherBirdies();
    checkMilestones();
    closeOtherBirdieModal();
});

// ===== Utilities =====
function formatDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ===== Render Everything =====
function renderAll() {
    renderHccProgress();
    renderHoleGrid();
    renderAllBirdiesSummary();
    renderAllBirdiesList();
    renderMilestones();
}

// ===== Start =====
bootstrap();
