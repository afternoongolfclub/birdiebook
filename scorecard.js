// ===== Scorecard & Strokes Gained Module =====
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const db = getFirestore(getApp());
const coursesRef = doc(db, 'birdiebook', 'courses');
const roundsRef = doc(db, 'birdiebook', 'rounds');

// ===== Strokes Gained Config =====
const SG_CONFIG = {
    EXPECTED_PUTTS_GIR: 2.0,
    EXPECTED_PUTTS_NO_GIR: 2.5,
    FIR_ADVANTAGE: 0.20
};

// ===== State =====
let courses = {};
let rounds = [];

// ===== Firestore CRUD =====
async function saveCourses() {
    await setDoc(coursesRef, { data: courses });
}

async function saveRounds() {
    await setDoc(roundsRef, { data: rounds });
}

function seedDefaultCourse() {
    if (!courses['huntsville-cc']) {
        courses['huntsville-cc'] = {
            id: 'huntsville-cc',
            name: 'Huntsville Country Club',
            holes: 19,
            pars: [4, 5, 4, 3, 4, 5, 4, 3, 4, 3, 5, 4, 4, 5, 3, 4, 3, 4, 3]
        };
        saveCourses();
    }
}

// ===== Strokes Gained Engine =====
function sgForHole(h) {
    const sgTotal = h.par - h.score;
    const expectedPutts = h.gir ? SG_CONFIG.EXPECTED_PUTTS_GIR : SG_CONFIG.EXPECTED_PUTTS_NO_GIR;
    const sgPutting = expectedPutts - h.putts;
    let sgTee = 0;
    if (h.par >= 4 && h.fir !== null) {
        sgTee = h.fir ? SG_CONFIG.FIR_ADVANTAGE : -SG_CONFIG.FIR_ADVANTAGE;
    }
    const sgApproach = sgTotal - sgPutting - sgTee;
    return { sgTotal, sgPutting, sgTee, sgApproach };
}

function sgForRound(round) {
    return round.holes.reduce((acc, h) => {
        const sg = sgForHole(h);
        acc.sgTotal += sg.sgTotal;
        acc.sgPutting += sg.sgPutting;
        acc.sgTee += sg.sgTee;
        acc.sgApproach += sg.sgApproach;
        return acc;
    }, { sgTotal: 0, sgPutting: 0, sgTee: 0, sgApproach: 0 });
}

function averageSG(allRounds) {
    if (allRounds.length === 0) return null;
    const sums = allRounds.map(r => sgForRound(r));
    const n = sums.length;
    return {
        sgTotal: sums.reduce((s, r) => s + r.sgTotal, 0) / n,
        sgPutting: sums.reduce((s, r) => s + r.sgPutting, 0) / n,
        sgTee: sums.reduce((s, r) => s + r.sgTee, 0) / n,
        sgApproach: sums.reduce((s, r) => s + r.sgApproach, 0) / n
    };
}

function sgVsOwnAvg(round, allRounds) {
    if (allRounds.length < 3) return null;
    const avg = averageSG(allRounds);
    const sg = sgForRound(round);
    return {
        sgTotal: sg.sgTotal - avg.sgTotal,
        sgPutting: sg.sgPutting - avg.sgPutting,
        sgTee: sg.sgTee - avg.sgTee,
        sgApproach: sg.sgApproach - avg.sgApproach
    };
}

function sgFormat(val) {
    return (val >= 0 ? '+' : '') + val.toFixed(1);
}

function sgClass(val) {
    if (val > 0.05) return 'sg-positive';
    if (val < -0.05) return 'sg-negative';
    return 'sg-neutral';
}

// ===== Scorecard Entry State =====
let scorecardState = {
    step: 'course',
    courseId: null,
    date: new Date().toISOString().split('T')[0],
    currentHole: 0,
    holes: []
};

function initScorecardHoles(courseId) {
    const course = courses[courseId];
    scorecardState.holes = course.pars.map((par, i) => ({
        hole: i + 1,
        par,
        score: null,
        putts: null,
        fir: par >= 4 ? null : null,
        gir: null,
        girAutoSet: false
    }));
}

function inferGIR(par, score, putts) {
    if (score === null || putts === null) return null;
    return (score - putts) <= (par - 2);
}

// ===== Scorecard Modal =====
function openScorecardModal() {
    scorecardState = {
        step: 'course',
        courseId: null,
        date: new Date().toISOString().split('T')[0],
        currentHole: 0,
        holes: []
    };
    document.getElementById('scorecardOverlay').classList.add('open');
    renderScorecardStep();
}

function closeScorecardModal() {
    document.getElementById('scorecardOverlay').classList.remove('open');
}

function renderScorecardStep() {
    switch (scorecardState.step) {
        case 'course': renderCourseStep(); break;
        case 'holes': renderHoleStep(); break;
        case 'summary': renderSummaryStep(); break;
    }
}

function renderCourseStep() {
    const body = document.getElementById('scorecardBody');
    const courseOptions = Object.values(courses).map(c =>
        `<option value="${c.id}" ${scorecardState.courseId === c.id ? 'selected' : ''}>${c.name} (${c.holes} holes)</option>`
    ).join('');

    body.innerHTML = `
        <div class="form-field">
            <label for="scCourse">Course</label>
            <select id="scCourse">
                <option value="">Select a course...</option>
                ${courseOptions}
                <option value="__new__">+ New Course...</option>
            </select>
        </div>
        <div class="form-field">
            <label for="scDate">Date</label>
            <input type="date" id="scDate" value="${scorecardState.date}">
        </div>
    `;

    const footer = document.getElementById('scorecardFooter');
    footer.innerHTML = `
        <div class="modal-actions">
            <button class="btn btn-birdie" id="scNextFromCourse">Next: Hole 1 &rarr;</button>
        </div>
    `;

    document.getElementById('scCourse').addEventListener('change', (e) => {
        if (e.target.value === '__new__') {
            closeScorecardModal();
            openNewCourseModal();
            return;
        }
        scorecardState.courseId = e.target.value || null;
    });

    document.getElementById('scDate').addEventListener('change', (e) => {
        scorecardState.date = e.target.value;
    });

    document.getElementById('scNextFromCourse').addEventListener('click', () => {
        if (!scorecardState.courseId) { alert('Please select a course.'); return; }
        if (!scorecardState.date) { alert('Please select a date.'); return; }
        initScorecardHoles(scorecardState.courseId);
        scorecardState.step = 'holes';
        scorecardState.currentHole = 0;
        renderScorecardStep();
    });
}

function renderHoleStep() {
    const idx = scorecardState.currentHole;
    const course = courses[scorecardState.courseId];
    const totalHoles = course.holes;
    const par = course.pars[idx];
    const holeData = scorecardState.holes[idx];
    const holeNum = idx + 1;

    const body = document.getElementById('scorecardBody');

    // Score options: par-2 through par+4
    const scoreMin = Math.max(1, par - 2);
    const scoreMax = par + 4;
    const scoreButtons = [];
    for (let s = scoreMin; s <= scoreMax; s++) {
        scoreButtons.push(s);
    }

    const puttButtons = [0, 1, 2, 3, 4];

    body.innerHTML = `
        <div class="sc-hole-header">
            <span class="sc-hole-num">Hole ${holeNum}</span>
            <span class="sc-hole-par">Par ${par}</span>
            <span class="sc-hole-of">${holeNum} of ${totalHoles}</span>
        </div>
        <div class="sc-progress-bar">
            ${Array.from({ length: totalHoles }, (_, i) => {
                const h = scorecardState.holes[i];
                const filled = h.score !== null;
                const current = i === idx;
                return `<div class="sc-progress-dot ${filled ? 'done' : ''} ${current ? 'current' : ''}"></div>`;
            }).join('')}
        </div>
        <div class="sc-field">
            <label>Score</label>
            <div class="sc-btn-group" data-field="score">
                ${scoreButtons.map(s => {
                    const label = s === par - 2 ? 'Eagle' : s === par - 1 ? 'Birdie' : s === par ? 'Par' :
                        s === par + 1 ? 'Bogey' : s === par + 2 ? 'Dbl' : '';
                    return `<button class="sc-btn ${holeData.score === s ? 'selected' : ''}" data-value="${s}">
                        <span class="sc-btn-num">${s}</span>
                        ${label ? `<span class="sc-btn-label">${label}</span>` : ''}
                    </button>`;
                }).join('')}
            </div>
        </div>
        <div class="sc-field">
            <label>Putts</label>
            <div class="sc-btn-group" data-field="putts">
                ${puttButtons.map(p =>
                    `<button class="sc-btn ${holeData.putts === p ? 'selected' : ''}" data-value="${p}">${p}</button>`
                ).join('')}
            </div>
        </div>
        ${par >= 4 ? `
        <div class="sc-field">
            <label>Fairway Hit</label>
            <div class="sc-btn-group sc-btn-group-binary" data-field="fir">
                <button class="sc-btn ${holeData.fir === true ? 'selected' : ''}" data-value="true">Yes</button>
                <button class="sc-btn ${holeData.fir === false ? 'selected' : ''}" data-value="false">No</button>
            </div>
        </div>` : ''}
        <div class="sc-field">
            <label>Green in Regulation</label>
            <div class="sc-btn-group sc-btn-group-binary" data-field="gir">
                <button class="sc-btn ${holeData.gir === true ? 'selected' : ''}" data-value="true">Yes</button>
                <button class="sc-btn ${holeData.gir === false ? 'selected' : ''}" data-value="false">No</button>
            </div>
        </div>
    `;

    // Attach button listeners
    body.querySelectorAll('.sc-btn-group').forEach(group => {
        group.querySelectorAll('.sc-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const field = group.dataset.field;
                let value = btn.dataset.value;
                if (field === 'fir' || field === 'gir') {
                    value = value === 'true';
                    if (field === 'gir') holeData.girAutoSet = false;
                } else {
                    value = parseInt(value);
                }
                holeData[field] = value;

                // Auto-infer GIR when score and putts are both set
                if ((field === 'score' || field === 'putts') && holeData.score !== null && holeData.putts !== null) {
                    if (holeData.girAutoSet || holeData.gir === null) {
                        holeData.gir = inferGIR(par, holeData.score, holeData.putts);
                        holeData.girAutoSet = true;
                    }
                }

                renderHoleStep();
            });
        });
    });

    // Footer navigation
    const footer = document.getElementById('scorecardFooter');
    const isFirst = idx === 0;
    const isLast = idx === totalHoles - 1;
    footer.innerHTML = `
        <div class="sc-nav">
            <button class="btn btn-secondary" id="scPrev" ${isFirst ? 'disabled' : ''}>&larr; Hole ${holeNum - 1}</button>
            ${isLast
                ? `<button class="btn btn-birdie" id="scToSummary">Review &rarr;</button>`
                : `<button class="btn btn-birdie" id="scNext">Hole ${holeNum + 1} &rarr;</button>`
            }
        </div>
    `;

    document.getElementById('scPrev')?.addEventListener('click', () => {
        scorecardState.currentHole--;
        renderScorecardStep();
    });
    document.getElementById('scNext')?.addEventListener('click', () => {
        scorecardState.currentHole++;
        renderScorecardStep();
    });
    document.getElementById('scToSummary')?.addEventListener('click', () => {
        scorecardState.step = 'summary';
        renderScorecardStep();
    });
}

function renderSummaryStep() {
    const course = courses[scorecardState.courseId];
    const holes = scorecardState.holes;

    const totalScore = holes.reduce((s, h) => s + (h.score || 0), 0);
    const totalPar = holes.reduce((s, h) => s + h.par, 0);
    const totalPutts = holes.reduce((s, h) => s + (h.putts || 0), 0);
    const diff = totalScore - totalPar;
    const diffStr = diff === 0 ? 'E' : (diff > 0 ? '+' + diff : '' + diff);

    let firHit = 0, firTotal = 0;
    holes.forEach(h => {
        if (h.par >= 4 && h.fir !== null) { firTotal++; if (h.fir) firHit++; }
    });
    let girHit = 0, girTotal = 0;
    holes.forEach(h => {
        if (h.gir !== null) { girTotal++; if (h.gir) girHit++; }
    });

    const incomplete = holes.filter(h => h.score === null).length;

    const body = document.getElementById('scorecardBody');
    body.innerHTML = `
        <div class="sc-summary-header">
            <h4>${course.name}</h4>
            <p class="sc-summary-date">${formatDate(scorecardState.date)}</p>
        </div>
        ${incomplete > 0 ? `<div class="sc-warning">${incomplete} hole${incomplete > 1 ? 's' : ''} incomplete. Fill in all holes for accurate stats.</div>` : ''}
        <div class="sc-summary-stats">
            <div class="sc-summary-stat">
                <div class="sc-summary-val">${totalScore} <span class="sc-summary-diff ${diff > 0 ? 'over' : diff < 0 ? 'under' : ''}">(${diffStr})</span></div>
                <div class="sc-summary-label">Score</div>
            </div>
            <div class="sc-summary-stat">
                <div class="sc-summary-val">${totalPutts}</div>
                <div class="sc-summary-label">Putts</div>
            </div>
            <div class="sc-summary-stat">
                <div class="sc-summary-val">${firTotal > 0 ? Math.round(firHit / firTotal * 100) + '%' : 'N/A'}</div>
                <div class="sc-summary-label">FIR</div>
            </div>
            <div class="sc-summary-stat">
                <div class="sc-summary-val">${girTotal > 0 ? Math.round(girHit / girTotal * 100) + '%' : 'N/A'}</div>
                <div class="sc-summary-label">GIR</div>
            </div>
        </div>
        <div class="scorecard-table-wrap">
            ${renderScorecardTable(holes)}
        </div>
    `;

    const footer = document.getElementById('scorecardFooter');
    footer.innerHTML = `
        <div class="sc-nav">
            <button class="btn btn-secondary" id="scBackToHoles">&larr; Edit Holes</button>
            <button class="btn btn-birdie" id="scSaveRound">Save Round</button>
        </div>
    `;

    document.getElementById('scBackToHoles').addEventListener('click', () => {
        scorecardState.step = 'holes';
        scorecardState.currentHole = scorecardState.holes.length - 1;
        renderScorecardStep();
    });

    document.getElementById('scSaveRound').addEventListener('click', async () => {
        const round = {
            id: 'r_' + Date.now(),
            courseId: scorecardState.courseId,
            date: scorecardState.date,
            holes: scorecardState.holes.map(h => ({
                hole: h.hole,
                par: h.par,
                score: h.score,
                putts: h.putts,
                fir: h.par >= 4 ? h.fir : null,
                gir: h.gir
            }))
        };
        rounds.push(round);
        rounds.sort((a, b) => b.date.localeCompare(a.date));
        await saveRounds();
        closeScorecardModal();
    });
}

function renderScorecardTable(holes) {
    const half = Math.ceil(holes.length / 2);
    const front = holes.slice(0, half);
    const back = holes.slice(half);

    function rowHtml(label, arr, fn) {
        return `<tr><th>${label}</th>${arr.map(fn).join('')}<th class="sc-total">${fn({ _total: true, arr })}</th></tr>`;
    }

    function makeHalf(holeArr, label) {
        const totalPar = holeArr.reduce((s, h) => s + h.par, 0);
        const totalScore = holeArr.reduce((s, h) => s + (h.score || 0), 0);
        const totalPutts = holeArr.reduce((s, h) => s + (h.putts || 0), 0);

        return `
            <tr class="sc-table-header">
                <th>${label}</th>
                ${holeArr.map(h => `<th>${h.hole}</th>`).join('')}
                <th>Tot</th>
            </tr>
            <tr>
                <th>Par</th>
                ${holeArr.map(h => `<td>${h.par}</td>`).join('')}
                <td class="sc-total">${totalPar}</td>
            </tr>
            <tr>
                <th>Score</th>
                ${holeArr.map(h => {
                    if (h.score === null) return '<td>-</td>';
                    const diff = h.score - h.par;
                    const cls = diff <= -2 ? 'score-eagle' : diff === -1 ? 'score-birdie' : diff === 0 ? '' : diff === 1 ? 'score-bogey' : 'score-dbl';
                    return `<td class="${cls}">${h.score}</td>`;
                }).join('')}
                <td class="sc-total">${totalScore}</td>
            </tr>
            <tr>
                <th>Putts</th>
                ${holeArr.map(h => `<td>${h.putts !== null ? h.putts : '-'}</td>`).join('')}
                <td class="sc-total">${totalPutts}</td>
            </tr>
        `;
    }

    return `
        <table class="scorecard-table">
            ${makeHalf(front, 'Out')}
            ${back.length > 0 ? makeHalf(back, 'In') : ''}
        </table>
    `;
}

// ===== New Course Modal =====
let newCourseState = { holes: 18, pars: [] };

function openNewCourseModal() {
    newCourseState = { holes: 18, pars: Array(18).fill(4) };
    document.getElementById('newCourseOverlay').classList.add('open');
    renderNewCourseForm();
}

function closeNewCourseModal() {
    document.getElementById('newCourseOverlay').classList.remove('open');
}

function renderNewCourseForm() {
    const body = document.getElementById('newCourseBody');
    body.innerHTML = `
        <div class="form-field">
            <label for="ncName">Course Name</label>
            <input type="text" id="ncName" placeholder="e.g. Augusta National" autocomplete="off">
        </div>
        <div class="form-field">
            <label>Number of Holes</label>
            <div class="sc-btn-group" id="ncHoleCount">
                <button class="sc-btn ${newCourseState.holes === 9 ? 'selected' : ''}" data-value="9">9</button>
                <button class="sc-btn ${newCourseState.holes === 18 ? 'selected' : ''}" data-value="18">18</button>
                <button class="sc-btn ${newCourseState.holes === 19 ? 'selected' : ''}" data-value="19">19</button>
            </div>
        </div>
        <div class="form-field">
            <label>Par per Hole</label>
            <div class="nc-quick-fill">
                <button class="btn btn-small" id="ncFillAll4">All Par 4</button>
                <button class="btn btn-small" id="ncFill72">Standard 72</button>
            </div>
            <div class="nc-par-grid" id="ncParGrid">
                ${newCourseState.pars.map((p, i) => `
                    <div class="nc-par-item">
                        <span class="nc-par-hole">${i + 1}</span>
                        <select class="nc-par-select" data-idx="${i}">
                            <option value="3" ${p === 3 ? 'selected' : ''}>3</option>
                            <option value="4" ${p === 4 ? 'selected' : ''}>4</option>
                            <option value="5" ${p === 5 ? 'selected' : ''}>5</option>
                        </select>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    document.getElementById('ncHoleCount').querySelectorAll('.sc-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const count = parseInt(btn.dataset.value);
            newCourseState.holes = count;
            newCourseState.pars = Array(count).fill(4);
            renderNewCourseForm();
        });
    });

    document.getElementById('ncFillAll4').addEventListener('click', () => {
        newCourseState.pars = Array(newCourseState.holes).fill(4);
        renderNewCourseForm();
    });

    document.getElementById('ncFill72').addEventListener('click', () => {
        const std18 = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
        newCourseState.pars = std18.slice(0, newCourseState.holes);
        while (newCourseState.pars.length < newCourseState.holes) newCourseState.pars.push(4);
        renderNewCourseForm();
    });

    document.querySelectorAll('.nc-par-select').forEach(sel => {
        sel.addEventListener('change', () => {
            newCourseState.pars[parseInt(sel.dataset.idx)] = parseInt(sel.value);
        });
    });
}

async function saveNewCourse() {
    const name = document.getElementById('ncName').value.trim();
    if (!name) { alert('Please enter a course name.'); return; }
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (courses[id]) { alert('A course with a similar name already exists.'); return; }

    courses[id] = {
        id,
        name,
        holes: newCourseState.holes,
        pars: [...newCourseState.pars]
    };
    await saveCourses();
    closeNewCourseModal();
    // Re-open scorecard modal with this course pre-selected
    scorecardState.courseId = id;
    openScorecardModal();
    scorecardState.courseId = id;
    renderScorecardStep();
}

// ===== Round List Rendering =====
let expandedRoundId = null;

function renderRoundsList() {
    const container = document.getElementById('roundsList');
    if (!container) return;

    // Summary cards
    const summaryEl = document.getElementById('roundsSummaryCards');
    if (summaryEl) {
        if (rounds.length === 0) {
            summaryEl.innerHTML = '';
        } else {
            const totalScores = rounds.map(r => r.holes.reduce((s, h) => s + (h.score || 0), 0));
            const avgScore = (totalScores.reduce((a, b) => a + b, 0) / rounds.length).toFixed(1);
            const bestScore = Math.min(...totalScores);
            summaryEl.innerHTML = `
                <div class="stat-card"><div class="stat-value">${rounds.length}</div><div class="stat-label">Rounds</div></div>
                <div class="stat-card"><div class="stat-value">${avgScore}</div><div class="stat-label">Avg Score</div></div>
                <div class="stat-card"><div class="stat-value">${bestScore}</div><div class="stat-label">Best Round</div></div>
            `;
        }
    }

    // Course filter
    const filterEl = document.getElementById('roundsCourseFilter');
    if (filterEl) {
        const currentVal = filterEl.value;
        const courseIds = [...new Set(rounds.map(r => r.courseId))];
        filterEl.innerHTML = '<option value="all">All Courses</option>';
        courseIds.forEach(cid => {
            const c = courses[cid];
            if (c) filterEl.innerHTML += `<option value="${cid}" ${currentVal === cid ? 'selected' : ''}>${c.name}</option>`;
        });
    }

    const filterCourse = filterEl?.value || 'all';
    const filtered = filterCourse === 'all' ? rounds : rounds.filter(r => r.courseId === filterCourse);

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <div class="empty-state-text">${rounds.length === 0 ? 'No rounds logged yet. Tap "+ Log Round" to get started!' : 'No rounds for this course.'}</div>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(r => {
        const course = courses[r.courseId];
        const courseName = course ? course.name : r.courseId;
        const totalScore = r.holes.reduce((s, h) => s + (h.score || 0), 0);
        const totalPar = r.holes.reduce((s, h) => s + h.par, 0);
        const diff = totalScore - totalPar;
        const diffStr = diff === 0 ? 'E' : (diff > 0 ? '+' + diff : '' + diff);
        const totalPutts = r.holes.reduce((s, h) => s + (h.putts || 0), 0);

        let firHit = 0, firTotal = 0;
        r.holes.forEach(h => { if (h.par >= 4 && h.fir !== null) { firTotal++; if (h.fir) firHit++; } });
        let girHit = 0, girTotal = 0;
        r.holes.forEach(h => { if (h.gir !== null) { girTotal++; if (h.gir) girHit++; } });

        const isExpanded = expandedRoundId === r.id;
        const sg = sgForRound(r);
        const sgOwn = sgVsOwnAvg(r, rounds);

        return `
            <div class="round-card ${isExpanded ? 'expanded' : ''}" data-round-id="${r.id}">
                <div class="round-card-main">
                    <div class="round-card-header">
                        <span class="round-card-course">${courseName}</span>
                        <span class="round-card-date">${formatDate(r.date)}</span>
                    </div>
                    <div class="round-card-stats">
                        <span><strong>${totalScore}</strong> (${diffStr})</span>
                        <span>Putts: ${totalPutts}</span>
                        <span>FIR: ${firTotal > 0 ? Math.round(firHit / firTotal * 100) + '%' : '—'}</span>
                        <span>GIR: ${girTotal > 0 ? Math.round(girHit / girTotal * 100) + '%' : '—'}</span>
                    </div>
                </div>
                ${isExpanded ? `
                <div class="round-detail">
                    <div class="scorecard-table-wrap">
                        ${renderScorecardTable(r.holes)}
                    </div>
                    <div class="round-sg-section">
                        <h4>Strokes Gained vs Par</h4>
                        <div class="sg-cards sg-cards-inline">
                            <div class="sg-card"><div class="sg-value ${sgClass(sg.sgTotal)}">${sgFormat(sg.sgTotal)}</div><div class="sg-label">Overall</div></div>
                            <div class="sg-card"><div class="sg-value ${sgClass(sg.sgTee)}">${sgFormat(sg.sgTee)}</div><div class="sg-label">Tee</div></div>
                            <div class="sg-card"><div class="sg-value ${sgClass(sg.sgApproach)}">${sgFormat(sg.sgApproach)}</div><div class="sg-label">Approach</div></div>
                            <div class="sg-card"><div class="sg-value ${sgClass(sg.sgPutting)}">${sgFormat(sg.sgPutting)}</div><div class="sg-label">Putting</div></div>
                        </div>
                        ${sgOwn ? `
                        <h4>vs Your Average</h4>
                        <div class="sg-cards sg-cards-inline">
                            <div class="sg-card"><div class="sg-value ${sgClass(sgOwn.sgTotal)}">${sgFormat(sgOwn.sgTotal)}</div><div class="sg-label">Overall</div></div>
                            <div class="sg-card"><div class="sg-value ${sgClass(sgOwn.sgTee)}">${sgFormat(sgOwn.sgTee)}</div><div class="sg-label">Tee</div></div>
                            <div class="sg-card"><div class="sg-value ${sgClass(sgOwn.sgApproach)}">${sgFormat(sgOwn.sgApproach)}</div><div class="sg-label">Approach</div></div>
                            <div class="sg-card"><div class="sg-value ${sgClass(sgOwn.sgPutting)}">${sgFormat(sgOwn.sgPutting)}</div><div class="sg-label">Putting</div></div>
                        </div>
                        ` : rounds.length < 3 ? '<p class="sg-note">Log 3+ rounds to see comparison vs your average.</p>' : ''}
                    </div>
                    <div class="round-actions">
                        <button class="btn btn-danger btn-small" data-delete-round="${r.id}">Delete Round</button>
                    </div>
                </div>
                ` : ''}
            </div>
        `;
    }).join('');

    // Attach click handlers for expanding/collapsing
    container.querySelectorAll('.round-card-main').forEach(el => {
        el.addEventListener('click', () => {
            const roundId = el.closest('.round-card').dataset.roundId;
            expandedRoundId = expandedRoundId === roundId ? null : roundId;
            renderRoundsList();
        });
    });

    // Delete handlers
    container.querySelectorAll('[data-delete-round]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Delete this round? This cannot be undone.')) return;
            const id = btn.dataset.deleteRound;
            rounds = rounds.filter(r => r.id !== id);
            expandedRoundId = null;
            await saveRounds();
        });
    });
}

// ===== Scoring Stats (in Stats & Charts tab) =====
function renderScoringStats() {
    const cardsEl = document.getElementById('scoringStatsCards');
    const sgEl = document.getElementById('sgSection');
    if (!cardsEl || !sgEl) return;

    if (rounds.length === 0) {
        cardsEl.innerHTML = '<p class="empty-state-text">Log your first round to see scoring stats.</p>';
        sgEl.innerHTML = '';
        clearScoringCharts();
        return;
    }

    // Aggregate stats
    const totalScores = rounds.map(r => r.holes.reduce((s, h) => s + (h.score || 0), 0));
    const totalPutts = rounds.map(r => r.holes.reduce((s, h) => s + (h.putts || 0), 0));
    const avgScore = (totalScores.reduce((a, b) => a + b, 0) / rounds.length).toFixed(1);
    const bestScore = Math.min(...totalScores);
    const worstScore = Math.max(...totalScores);
    const avgPutts = (totalPutts.reduce((a, b) => a + b, 0) / rounds.length).toFixed(1);

    let firHit = 0, firTotal = 0, girHit = 0, girTotal = 0;
    rounds.forEach(r => r.holes.forEach(h => {
        if (h.par >= 4 && h.fir !== null) { firTotal++; if (h.fir) firHit++; }
        if (h.gir !== null) { girTotal++; if (h.gir) girHit++; }
    }));
    const firPct = firTotal > 0 ? Math.round(firHit / firTotal * 100) : 0;
    const girPct = girTotal > 0 ? Math.round(girHit / girTotal * 100) : 0;

    cardsEl.innerHTML = `
        <div class="stat-card"><div class="stat-value">${avgScore}</div><div class="stat-label">Avg Score</div></div>
        <div class="stat-card"><div class="stat-value">${bestScore}</div><div class="stat-label">Best Round</div></div>
        <div class="stat-card"><div class="stat-value">${worstScore}</div><div class="stat-label">Worst Round</div></div>
        <div class="stat-card"><div class="stat-value">${firPct}%</div><div class="stat-label">Fairways Hit</div></div>
        <div class="stat-card"><div class="stat-value">${girPct}%</div><div class="stat-label">Greens in Reg</div></div>
        <div class="stat-card"><div class="stat-value">${avgPutts}</div><div class="stat-label">Avg Putts</div></div>
    `;

    // SG section
    const avg = averageSG(rounds);
    if (avg) {
        const latestSgOwn = rounds.length >= 3 ? sgVsOwnAvg(rounds[0], rounds) : null;
        sgEl.innerHTML = `
            <div class="sg-block">
                <h3 class="sg-title">Strokes Gained vs Par (per round avg)</h3>
                <div class="sg-cards">
                    <div class="sg-card"><div class="sg-value ${sgClass(avg.sgTotal)}">${sgFormat(avg.sgTotal)}</div><div class="sg-label">Overall</div></div>
                    <div class="sg-card"><div class="sg-value ${sgClass(avg.sgTee)}">${sgFormat(avg.sgTee)}</div><div class="sg-label">Off the Tee</div></div>
                    <div class="sg-card"><div class="sg-value ${sgClass(avg.sgApproach)}">${sgFormat(avg.sgApproach)}</div><div class="sg-label">Approach & Short</div></div>
                    <div class="sg-card"><div class="sg-value ${sgClass(avg.sgPutting)}">${sgFormat(avg.sgPutting)}</div><div class="sg-label">Putting</div></div>
                </div>
            </div>
            ${latestSgOwn ? `
            <div class="sg-block">
                <h3 class="sg-title">Latest Round vs Your Average</h3>
                <div class="sg-cards">
                    <div class="sg-card"><div class="sg-value ${sgClass(latestSgOwn.sgTotal)}">${sgFormat(latestSgOwn.sgTotal)}</div><div class="sg-label">Overall</div></div>
                    <div class="sg-card"><div class="sg-value ${sgClass(latestSgOwn.sgTee)}">${sgFormat(latestSgOwn.sgTee)}</div><div class="sg-label">Off the Tee</div></div>
                    <div class="sg-card"><div class="sg-value ${sgClass(latestSgOwn.sgApproach)}">${sgFormat(latestSgOwn.sgApproach)}</div><div class="sg-label">Approach & Short</div></div>
                    <div class="sg-card"><div class="sg-value ${sgClass(latestSgOwn.sgPutting)}">${sgFormat(latestSgOwn.sgPutting)}</div><div class="sg-label">Putting</div></div>
                </div>
            </div>
            ` : rounds.length < 3 ? '<p class="sg-note">Log 3+ rounds to see comparison vs your average.</p>' : ''}
        `;
    }

    renderScoringCharts();
}

// ===== Scoring Charts =====
function clearScoringCharts() {
    ['scoringTrendChart', 'sgBreakdownChart', 'puttsTrendChart'].forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) {
            const ctx = canvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.parentElement.getBoundingClientRect();
            const width = rect.width - 32;
            canvas.width = width * dpr;
            canvas.height = 250 * dpr;
            canvas.style.width = width + 'px';
            canvas.style.height = '250px';
            ctx.scale(dpr, dpr);
            ctx.clearRect(0, 0, width, 250);
            ctx.fillStyle = '#6b7280';
            ctx.font = '14px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText('No rounds logged yet', width / 2, 125);
        }
    });
}

function renderScoringCharts() {
    if (rounds.length === 0) { clearScoringCharts(); return; }

    renderScoringTrendChart();
    renderSGBreakdownChart();
    renderPuttsTrendChart();
}

function setupCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
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
    return { ctx, width, height };
}

function renderScoringTrendChart() {
    const setup = setupCanvas('scoringTrendChart');
    if (!setup) return;
    const { ctx, width, height } = setup;

    const sorted = [...rounds].sort((a, b) => a.date.localeCompare(b.date));
    const points = sorted.map(r => ({
        date: r.date,
        score: r.holes.reduce((s, h) => s + (h.score || 0), 0),
        par: r.holes.reduce((s, h) => s + h.par, 0)
    }));

    const pad = { top: 20, right: 20, bottom: 40, left: 45 };
    const cw = width - pad.left - pad.right;
    const ch = height - pad.top - pad.bottom;
    const scores = points.map(p => p.score);
    const minScore = Math.min(...scores) - 2;
    const maxScore = Math.max(...scores) + 2;
    const range = maxScore - minScore || 1;

    function x(i) { return pad.left + (points.length === 1 ? cw / 2 : (i / (points.length - 1)) * cw); }
    function y(val) { return pad.top + ch - ((val - minScore) / range) * ch; }

    // Grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    const step = Math.ceil(range / 5);
    for (let v = Math.floor(minScore); v <= Math.ceil(maxScore); v += step) {
        ctx.beginPath(); ctx.moveTo(pad.left, y(v)); ctx.lineTo(width - pad.right, y(v)); ctx.stroke();
        ctx.fillStyle = '#6b7280'; ctx.font = '11px system-ui'; ctx.textAlign = 'right';
        ctx.fillText(v, pad.left - 8, y(v) + 4);
    }

    // Par line (use first round's par as reference)
    if (points.length > 0) {
        const parVal = points[0].par;
        ctx.strokeStyle = '#ffc107'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(pad.left, y(parVal)); ctx.lineTo(width - pad.right, y(parVal)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#f59e0b'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'right';
        ctx.fillText(`PAR ${parVal}`, width - pad.right, y(parVal) - 6);
    }

    // Score line
    ctx.strokeStyle = '#2d8a4e'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    points.forEach((p, i) => { if (i === 0) ctx.moveTo(x(i), y(p.score)); else ctx.lineTo(x(i), y(p.score)); });
    ctx.stroke();

    // Dots
    points.forEach((p, i) => {
        ctx.fillStyle = '#2d8a4e'; ctx.beginPath(); ctx.arc(x(i), y(p.score), 4, 0, Math.PI * 2); ctx.fill();
    });

    // Date labels
    ctx.fillStyle = '#6b7280'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
    if (points.length <= 8) {
        points.forEach((p, i) => ctx.fillText(formatDateShort(p.date), x(i), height - 8));
    } else {
        ctx.fillText(formatDateShort(points[0].date), x(0), height - 8);
        ctx.fillText(formatDateShort(points[points.length - 1].date), x(points.length - 1), height - 8);
    }
}

function renderSGBreakdownChart() {
    const setup = setupCanvas('sgBreakdownChart');
    if (!setup) return;
    const { ctx, width, height } = setup;

    const avg = averageSG(rounds);
    if (!avg) return;

    const categories = [
        { label: 'Overall', value: avg.sgTotal, color: '#374151' },
        { label: 'Tee', value: avg.sgTee, color: '#3b82f6' },
        { label: 'Approach', value: avg.sgApproach, color: '#f59e0b' },
        { label: 'Putting', value: avg.sgPutting, color: '#22c55e' }
    ];

    const pad = { top: 20, right: 20, bottom: 50, left: 50 };
    const cw = width - pad.left - pad.right;
    const ch = height - pad.top - pad.bottom;
    const vals = categories.map(c => Math.abs(c.value));
    const maxVal = Math.max(...vals, 1);

    const barWidth = Math.min(60, cw / categories.length - 20);
    const zeroY = pad.top + ch / 2;

    // Zero line
    ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(width - pad.right, zeroY); ctx.stroke();

    // Y-axis labels
    ctx.fillStyle = '#6b7280'; ctx.font = '11px system-ui'; ctx.textAlign = 'right';
    const yStep = Math.ceil(maxVal);
    for (let v = -yStep; v <= yStep; v++) {
        const yPos = zeroY - (v / maxVal) * (ch / 2);
        if (v !== 0) {
            ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(pad.left, yPos); ctx.lineTo(width - pad.right, yPos); ctx.stroke();
        }
        ctx.fillStyle = '#6b7280';
        ctx.fillText((v >= 0 ? '+' : '') + v, pad.left - 8, yPos + 4);
    }

    categories.forEach((c, i) => {
        const barX = pad.left + (i / categories.length) * cw + (cw / categories.length - barWidth) / 2;
        const barH = Math.abs(c.value / maxVal) * (ch / 2);
        const barY = c.value >= 0 ? zeroY - barH : zeroY;

        ctx.fillStyle = c.color;
        ctx.fillRect(barX, barY, barWidth, barH || 1);

        // Value label
        ctx.fillStyle = '#374151'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center';
        const labelY = c.value >= 0 ? barY - 6 : barY + barH + 14;
        ctx.fillText(sgFormat(c.value), barX + barWidth / 2, labelY);

        // Category label
        ctx.fillStyle = '#6b7280'; ctx.font = '11px system-ui';
        ctx.fillText(c.label, barX + barWidth / 2, height - 10);
    });
}

function renderPuttsTrendChart() {
    const setup = setupCanvas('puttsTrendChart');
    if (!setup) return;
    const { ctx, width, height } = setup;

    const sorted = [...rounds].sort((a, b) => a.date.localeCompare(b.date));
    const points = sorted.map(r => ({
        date: r.date,
        putts: r.holes.reduce((s, h) => s + (h.putts || 0), 0)
    }));

    const pad = { top: 20, right: 20, bottom: 40, left: 45 };
    const cw = width - pad.left - pad.right;
    const ch = height - pad.top - pad.bottom;
    const putts = points.map(p => p.putts);
    const minP = Math.min(...putts) - 2;
    const maxP = Math.max(...putts) + 2;
    const range = maxP - minP || 1;

    function x(i) { return pad.left + (points.length === 1 ? cw / 2 : (i / (points.length - 1)) * cw); }
    function y(val) { return pad.top + ch - ((val - minP) / range) * ch; }

    // Grid
    const step = Math.ceil(range / 5);
    for (let v = Math.floor(minP); v <= Math.ceil(maxP); v += step) {
        ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.left, y(v)); ctx.lineTo(width - pad.right, y(v)); ctx.stroke();
        ctx.fillStyle = '#6b7280'; ctx.font = '11px system-ui'; ctx.textAlign = 'right';
        ctx.fillText(v, pad.left - 8, y(v) + 4);
    }

    // Line
    ctx.strokeStyle = '#8b5cf6'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    points.forEach((p, i) => { if (i === 0) ctx.moveTo(x(i), y(p.putts)); else ctx.lineTo(x(i), y(p.putts)); });
    ctx.stroke();

    points.forEach((p, i) => {
        ctx.fillStyle = '#8b5cf6'; ctx.beginPath(); ctx.arc(x(i), y(p.putts), 4, 0, Math.PI * 2); ctx.fill();
    });

    // Date labels
    ctx.fillStyle = '#6b7280'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
    if (points.length <= 8) {
        points.forEach((p, i) => ctx.fillText(formatDateShort(p.date), x(i), height - 8));
    } else {
        ctx.fillText(formatDateShort(points[0].date), x(0), height - 8);
        ctx.fillText(formatDateShort(points[points.length - 1].date), x(points.length - 1), height - 8);
    }
}

// ===== Utilities =====
function formatDate(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ===== Bootstrap & Event Wiring =====
async function initScorecard() {
    try {
        const [coursesSnap, roundsSnap] = await Promise.all([getDoc(coursesRef), getDoc(roundsRef)]);
        courses = coursesSnap.exists() ? coursesSnap.data().data : {};
        rounds = roundsSnap.exists() ? roundsSnap.data().data : [];
        rounds.sort((a, b) => b.date.localeCompare(a.date));
        seedDefaultCourse();
    } catch (err) {
        console.error('Scorecard Firestore error:', err);
        courses = {};
        rounds = [];
        seedDefaultCourse();
    }

    renderRoundsList();

    // Start real-time listeners
    onSnapshot(coursesRef, snap => {
        courses = snap.exists() ? snap.data().data : {};
        seedDefaultCourse();
        renderRoundsList();
    });

    onSnapshot(roundsRef, snap => {
        rounds = snap.exists() ? snap.data().data : [];
        rounds.sort((a, b) => b.date.localeCompare(a.date));
        renderRoundsList();
        renderScoringStats();
    });

    // Event listeners
    document.getElementById('openScorecardModal')?.addEventListener('click', openScorecardModal);
    document.getElementById('scorecardClose')?.addEventListener('click', closeScorecardModal);
    document.getElementById('scorecardOverlay')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('scorecardOverlay')) closeScorecardModal();
    });

    document.getElementById('newCourseClose')?.addEventListener('click', closeNewCourseModal);
    document.getElementById('newCourseOverlay')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('newCourseOverlay')) closeNewCourseModal();
    });
    document.getElementById('saveCourseBtn')?.addEventListener('click', saveNewCourse);

    document.getElementById('roundsCourseFilter')?.addEventListener('change', renderRoundsList);

    // Stats sub-toggle
    document.querySelectorAll('[data-stats-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-stats-view]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const view = btn.dataset.statsView;
            document.getElementById('statsViewBirdies').style.display = view === 'birdies' ? 'block' : 'none';
            document.getElementById('statsViewScoring').style.display = view === 'scoring' ? 'block' : 'none';
            if (view === 'scoring') renderScoringStats();
        });
    });
}

initScorecard();
