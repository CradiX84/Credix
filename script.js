// ==========================================
// 1. ENTERPRISE FIREBASE & OFFLINE DB CONFIG
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCHFXLos4dhAsFNXWWUGjPq4aoTCvrJoTo",
    authDomain: "credixproapp.firebaseapp.com",
    databaseURL: "https://credixproapp-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "credixproapp",
    storageBucket: "credixproapp.firebasestorage.app",
    messagingSenderId: "352314210837",
    appId: "1:352314210837:web:7c59520c8e983654c92c1c",
    measurementId: "G-7LZNQHW2KX"
};

// Global Firebase References
let auth = null;
let database = null;
let firestore = null;

if (typeof firebase !== 'undefined') {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    database = firebase.database();
    if (firebase.firestore) {
        firestore = firebase.firestore();
        try {
            firestore.enablePersistence({ synchronizeTabs: true }).catch(() => {});
        } catch (e) {}
    }
} else {
    // Smart Fallback Mock Database to prevent crash during offline initialization
    database = {
        ref: () => ({
            on: (ev, cb, err) => { if (err) err(); },
            off: () => {},
            once: () => Promise.reject(new Error("Offline")),
            set: () => Promise.reject(new Error("Offline")),
            update: () => Promise.reject(new Error("Offline"))
        }),
        goOnline: () => {},
        goOffline: () => {}
    };
}

// Enterprise Multi-Tier Local IndexedDB (Dexie Engine)
const localDB = new Dexie("CredixAI_DB");
localDB.version(2).stores({
    cases: 'id, name, type, isArchived, staffRef, startDate, isPersonal',
    syncQueue: '++autoId, id, action, collection, payload, timestamp, retryCount',
    metadata: 'key, value'
});

// ==========================================
// 2. CORE SYSTEM STATE & GLOBALS
// ==========================================
let db = JSON.parse(localStorage.getItem('paymitra_v11')) || [];
let pin = "";
let activeLoginPin = "";
let currentPin = localStorage.getItem('paymitra_pin') || "2525";
let secretPin = localStorage.getItem('paymitra_secret') || "1984";
let isOwnerMode = false;
let deviceStaffName = '';
let activeStaffPhoto = '';
let currentTab = 'dash';
let openViews = {};
let multiDelMode = {};
let lastSelectedHistoryIndex = null;
let confirmActionCallback = null;

let isSaving = false;
let isSyncingQueue = false;
let lastGeneratedReportData = null;

let activeCropper = null;
let currentCropTarget = '';
let lastCroppedBase64 = '';

let currentTrashTab = 'cases';
let isTrashMulti = false;

// ==========================================
// 3. ENTERPRISE SYNC QUEUE HELPER ENGINE
// ==========================================
const EnterpriseSyncEngine = {
    isOnline: navigator.onLine,
    
        async enqueue(taskOrAction, collection, caseId, payload = null, tombstone = null, trashPayload = null) {
            try {
                let taskObj;
                if (typeof taskOrAction === 'object' && taskOrAction !== null) {
                    taskObj = {
                        action: taskOrAction.action,
                        caseId: taskOrAction.caseId || null,
                        collection: taskOrAction.collection || null,
                        payload: taskOrAction.payload || null,
                        tombstone: taskOrAction.tombstone || null,
                        trashPayload: taskOrAction.trashPayload || null,
                        deletedBy: taskOrAction.deletedBy || null,
                        timestamp: taskOrAction.timestamp || Date.now(),
                        retryCount: taskOrAction.retryCount || 0
                    };
                } else {
                    taskObj = {
                        action: taskOrAction,
                        collection: collection || null,
                        caseId: caseId || null,
                        payload: payload,
                        tombstone: tombstone,
                        trashPayload: trashPayload,
                        timestamp: Date.now(),
                        retryCount: 0
                    };
                }

                if (typeof localDB !== 'undefined' && localDB.syncQueue) {
                    await localDB.syncQueue.add(taskObj);
                }
                this.processQueue();
            } catch (e) {
                console.error("[SyncQueue] Enqueue Error:", e);
            }
        },

    async processQueue() {
        if (!navigator.onLine || isSyncingQueue || !database) return;
        isSyncingQueue = true;
        try {
            const pendingTasks = await localDB.syncQueue.orderBy('autoId').toArray();
            for (const task of pendingTasks) {
                try {
                    if (task.action === 'UPSERT_CASE') {
                        // Stale check
                        if (localTombstones[task.caseId] && localTombstones[task.caseId].deletedAt >= (task.timestamp || 0)) {
                            console.warn(`[SyncQueue] Stale upsert discarded for deleted case ${task.caseId}`);
                            await localDB.syncQueue.delete(task.autoId);
                            continue;
                        }
                        const tSnap = await database.ref(`credix_db/tombstones/${task.caseId}`).once('value');
                        const serverTomb = tSnap.val();
                        if (serverTomb && serverTomb.deletedAt >= (task.timestamp || 0)) {
                            console.warn(`[SyncQueue] Server tombstone active for case ${task.caseId}. Discarding update.`);
                            localTombstones[task.caseId] = serverTomb;
                            saveLocalTombstones();
                            await localDB.syncQueue.delete(task.autoId);
                            continue;
                        }
                        let updates = {};
                        updates[`credix_db/cases/${task.caseId}`] = task.payload;
                    // Offline se online aane par portal update
                    if (task.payload && task.payload.customerToken) {
                        updates[`customer_portal/${task.payload.customerToken}`] = {
                            name: task.payload.name,
                            principal: task.payload.principal,
                            totalPayable: task.payload.totalPayable || task.payload.principal,
                            currentBalance: task.payload.currentBalance,
                            installment: task.payload.installment || 0,
                            type: task.payload.type,
                            startDate: task.payload.startDate,
                            history: task.payload.history || []
                        };
                    }

                        await database.ref().update(updates);
                    } else if (task.action === 'DELETE_CASE') {
                        let updates = {};
                        updates[`credix_db/cases/${task.caseId}`] = null;
                        updates[`credix_db/tombstones/${task.caseId}`] = task.tombstone || {
                            id: task.caseId,
                            deletedAt: task.timestamp || Date.now(),
                            deletedBy: task.deletedBy || deviceStaffName
                        };
                        if (task.trashPayload) {
                            updates[`credix_db/trash`] = task.trashPayload;
                        }
                        await database.ref().update(updates);
                    } else if (task.action === 'UPDATE_CONFIG') {
                        await database.ref('credix_db/config').set(task.payload);
                    } else if (task.action === 'UPDATE_TRASH') {
                        await database.ref('credix_db/trash').set(task.payload);
                    }
                    await localDB.syncQueue.delete(task.autoId);
                } catch (taskErr) {
                    console.warn("[SyncQueue] Operation failed, will retry:", taskErr);
                    await localDB.syncQueue.update(task.autoId, { retryCount: (task.retryCount || 0) + 1 });
                    break;
                }
            }
        } catch (queueErr) {
            console.error("[SyncQueue] Queue processing error:", queueErr);
        } finally {
            isSyncingQueue = false;
        }
    }
};

window.addEventListener('online', () => {
    EnterpriseSyncEngine.isOnline = true;
    if (typeof firebase !== 'undefined' && firebase.database) {
        firebase.database().goOnline();
    }
    const syncStatus = document.getElementById('sync-status');
    const cloudInd = document.getElementById('cloud-indicator');
    if (syncStatus) syncStatus.innerText = "Syncing...";
    if (cloudInd) cloudInd.className = "status-dot sync-anim";
    EnterpriseSyncEngine.processQueue();
});

window.addEventListener('offline', () => {
    EnterpriseSyncEngine.isOnline = false;
    const syncStatus = document.getElementById('sync-status');
    const cloudInd = document.getElementById('cloud-indicator');
    if (syncStatus) syncStatus.innerText = "Offline Mode";
    if (cloudInd) cloudInd.className = "status-dot offline";
});

// ==========================================
// 4. UTILITY & LOCALIZATION HELPERS
// ==========================================
function getISTDate() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // Exact IST (+5:30)
    const istDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + istOffset);
    
    const y = istDate.getFullYear();
    const m = String(istDate.getMonth() + 1).padStart(2, '0');
    const d = String(istDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Safe Month Addition for Monthly Cases (Prevents 31 Jan -> 3 Mar jump)
function addMonthsSafe(dateStr, monthsToAdd) {
    if (!dateStr) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    
    let d = new Date(parts[0], parts[1] - 1, parts[2]);
    let expectedMonth = (d.getMonth() + monthsToAdd) % 12;
    if (expectedMonth < 0) expectedMonth += 12;
    
    d.setMonth(d.getMonth() + monthsToAdd);
    
    // Agar date jump hoke agle mahine chali gayi (jaise Feb mein 31 nahi hota)
    // To usko expected mahine ke aakhri din par set kar do
    if (d.getMonth() !== expectedMonth) {
        d.setDate(0); 
    }
    
    const ny = d.getFullYear();
    const nm = String(d.getMonth() + 1).padStart(2, '0');
    const nd = String(d.getDate()).padStart(2, '0');
    return `${ny}-${nm}-${nd}`;
}


function formatDateDisplay(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return dateStr;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
}

function calculateEndDate(startDateStr, days) {
    if (!startDateStr || !days) return "-";
    let parts = startDateStr.split('-');
    let d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() + parseInt(days));
    let ny = d.getFullYear();
    let nm = String(d.getMonth() + 1).padStart(2, '0');
    let nd = String(d.getDate()).padStart(2, '0');
    return `${nd}/${nm}/${String(ny).slice(-2)}`;
}

function openPhotoZoom(src) {
    if (!src) return;
    const modal = document.getElementById('photo-zoom-modal');
    const img = document.getElementById('zoomed-img');
    img.src = src;
    modal.classList.add('active');
}

function closePhotoZoom() {
    document.getElementById('photo-zoom-modal').classList.remove('active');
}

function getConfig() {
    let conf = db.find(x => x.type === 'config');
    if (!conf) {
        conf = { id: 'config_staff', type: 'config', staffList: [] };
        db.push(conf);
    }
    return conf;
}

// ==========================================
// ==========================================
// 5. RECYCLE BIN & TRASH INITIALIZATION
// ==========================================
function getTrash() {
    let tr = db.find(x => x.type === 'trash');
    if (!tr) {
        tr = { id: 'trash_bin', type: 'trash', cases: [], histories: [] };
        db.push(tr);
    }
    return tr;
}

function openTrashModal() {
    closeModal('settings-modal');
    isTrashMulti = false;
    document.getElementById('trash-modal').style.display = 'flex';
    switchTrashTab('cases');
}

function switchTrashTab(tab) {
    currentTrashTab = tab;
    const tabCases = document.getElementById('tab-trash-cases');
    const tabEntries = document.getElementById('tab-trash-entries');
    if (tabCases) {
        tabCases.style.background = tab === 'cases' ? 'var(--accent-orange)' : 'rgba(255,255,255,0.05)';
        tabCases.style.color = tab === 'cases' ? 'white' : 'var(--text-muted)';
    }
    if (tabEntries) {
        tabEntries.style.background = tab === 'entries' ? 'var(--accent-orange)' : 'rgba(255,255,255,0.05)';
        tabEntries.style.color = tab === 'entries' ? 'white' : 'var(--text-muted)';
    }
    isTrashMulti = false;
    const multiBtn = document.getElementById('btn-trash-multi');
    const trashActions = document.getElementById('trash-actions');
    if (multiBtn) multiBtn.innerText = 'MULTI-SELECT';
    if (trashActions) trashActions.style.display = 'none';
    renderTrash();
}

// ==========================================
// 6. I18N DICTIONARY & UI CONTROLS
// ==========================================
const i18n = {
    'en': { 
        appSub: "Welcome Back 👋", sumPrin: "Total Principal", sumCases: "Total Cases", sumOut: "Outstanding", 
        addTitle: "Create Record", namePh: "Customer Name", amtPh: "Principal Amount", addBtn: "Add Record", 
        navDash: "Home", navCust: "Accounts", navBulk: "Fast Add", navStats: "Review", 
        setMainTitle: "App Settings", setBackup: "Backup Data (JSON)", setRestore: "Restore Data", setPinStaff: "Change Staff PIN", setPinOwner: "Change Owner PIN 👑", setLogout: "Logout", setClose: "Close", 
        searchPh: "Search Name...", cleanDashTitle: "Clean Dashboard", cleanDashSub: "Search a customer's name above to quick-view their account.<br>Go to <b>Accounts</b> tab to see the full list.", 
        bizPort: "Business Portfolio", recStatus: "Recovery Status", monthly: "Monthly", daily: "Daily", meter: "Meter", recovered: "Recovered", remaining: "Remaining", 
        ownerGrowth: "👑 Owner Growth Analytics", totInvested: "Total Invested", netProfit: "Net Earned Profit", ownerNote: "This data is strictly private and hidden in staff mode.",
        refresh: "Refresh", totRetPh: "Total Return Amount", totDaysPh: "Total Days", 
        allTypes: "All Types", fDaily: "Daily", fMonthly: "Monthly", fMeter: "Meter", fArchived: "Closed",
        optDaily: "Daily Kishat", optMonthly: "Monthly Vyaj", optMeter: "Meter (Rozana)", markPersonal: "👑 Mark as Personal Case",
        sortNew: "Latest First ▼", sortOld: "Oldest First ▲",
        delCaseMsg: "Delete this entire case?", delCaseSuccess: "Case Deleted!", editBtn: "Edit", recBtn: "Receive", bulkBtn: "⚡ Bulk",
        bulkTitle: "Bulk Entry", bulkStart: "Start Date", bulkEnd: "End Date", bulkSubmit: "Process Bulk", bulkCancel: "Cancel", perMonthAmt: "Per Month Amount (₹)", perDayAmt: "Per Day Amount (₹)",
        autoBackupLabel: "Auto Backup Data", abNever: "Never", abDaily: "Daily (On First Open)", abMonthly: "Monthly",
        repTitle: "📅 Custom Date Report", repBtn: "Generate Report", repGiven: "Total Given", repRet: "Total Recovered", repProfit: "Profit Earned", repNoData: "No activity in this date range.", repNewCases: "🆕 NEW CASES GIVEN", repPayments: "✅ PAYMENTS RECEIVED", advProfit: "Advance Profit (Cut)",
        archiveToast: "Case Archived!", unarchiveToast: "Case Restored!", staffRefPh: "Reference / Staff Name", lockSub: "Enter 4-Digit Login ID",
        refStatTitle: "👑 Reference Summary", refStatCases: "Total Accounts", refStatValue: "Total Value", refStatRec: "Recovered", refStatOut: "Outstanding",
        refStatCollection: "Daily Collection", refStatInterest: "Monthly Interest", refStatProfit: "Estimated Profit",
        repPendings: "⚠️ PENDING COLLECTIONS", caseDate: "Case Date",
        returnAmt: "Return Amt", principal: "Principal", totalPaid: "Total Paid", remainingAcc: "Remaining", payHistory: "Payment History",
        repNewDaily: "🆕 New Daily Cases", repNewMonthly: "🆕 New Monthly Cases", repNewMeter: "🆕 New Meter Cases",
        repRecDaily: "✅ Daily Recoveries", repRecMonthly: "✅ Monthly Recoveries", repRecMeter: "✅ Meter Recoveries",
        repPendDaily: "⚠️ Pending Collections (Daily)", repPendMonthly: "⚠️ Pending Collections (Monthly)", repPendMeter: "⚠️ Pending Collections (Meter)",
        givenOn: "Given on", profitCut: "Profit Cut:", intRec: "Interest Received", monthsText: "Months", kishatsText: "Kishats", profitText: "Profit:", missedText: "Missed:", basisText: "BASIS", repTotal: "TOTAL:", caseClosedText: "Case Closed ✅"
    },
    'hi': { 
        appSub: "नमस्ते 👋", sumPrin: "कुल मूलधन", sumCases: "कुल खाते", sumOut: "बकाया", 
        addTitle: "नया खाता बनाएं", namePh: "ग्राहक का नाम", amtPh: "मूलधन (Principal)", addBtn: "खाता जोड़ें", 
        navDash: "होम", navCust: "खाते", navBulk: "फास्ट ऐड", navStats: "रिव्यू", 
        setMainTitle: "ऐप सेटिंग्स", setBackup: "डेटा बैकअप", setRestore: "डेटा वापस लाएं", setPinStaff: "स्टाफ पिन बदलें", setPinOwner: "मालिक पिन बदलें 👑", setLogout: "लॉगआउट", setClose: "बंद करें", 
        searchPh: "नाम खोजें...", cleanDashTitle: "क्लीन डैशबोर्ड", cleanDashSub: "खाता देखने के लिए ऊपर नाम खोजें।<br>पूरी लिस्ट देखने के लिए <b>खाते</b> टैब पर जाएं।", 
        bizPort: "बिजनेस पोर्टफोलियो", recStatus: "रिकवरी स्टेटस", monthly: "महीना", daily: "रोज़ाना", meter: "मीटर", recovered: "रिकवर हुआ", remaining: "बाकी", 
        ownerGrowth: "👑 प्रॉफिट एनालिटिक्स", totInvested: "कुल निवेश", netProfit: "प्राप्त प्रॉफिट", ownerNote: "यह डेटा केवल मालिक के लिए है, स्टाफ को नहीं दिखेगा।",
        refresh: "रिफ्रेश", totRetPh: "कुल वापसी रकम", totDaysPh: "कुल दिन", 
        allTypes: "सभी प्रकार", fDaily: "रोज़ाना", fMonthly: "महीना", fMeter: "मीटर", fArchived: "बंद खाते",
        optDaily: "रोज़ की किश्त", optMonthly: "महीने का ब्याज", optMeter: "मीटर (रोज़ाना)", markPersonal: "👑 पर्सनल खाता",
        sortNew: "नया पहले ▼", sortOld: "पुराना पहले ▲",
        delCaseMsg: "क्या आप यह पूरा खाता हटाना चाहते हैं?", delCaseSuccess: "खाता हटा दिया गया!", editBtn: "एडिट", recBtn: "प्राप्त करें", bulkBtn: "⚡ बल्क",
        bulkTitle: "बल्क एंट्री", bulkStart: "शुरुआती तारीख", bulkEnd: "आखिरी तारीख", bulkSubmit: "बल्क प्रोसेस करें", bulkCancel: "रद्द करें", perMonthAmt: "हर महीने की रकम (₹)", perDayAmt: "हर दिन की रकम (₹)",
        autoBackupLabel: "ऑटो बैकअप फाइल", abNever: "कभी नहीं", abDaily: "रोज़ (ऐप खुलने पर)", abMonthly: "महीने में एक बार",
        repTitle: "📅 तारीख के अनुसार रिपोर्ट", repBtn: "रिपोर्ट देखें", repGiven: "कुल दिया", repRet: "कुल रिकवरी", repProfit: "कमाया प्रॉफिट", repNoData: "इस तारीख में कोई डेटा नहीं।", repNewCases: "🆕 नए खाते (GIVEN)", repPayments: "✅ प्राप्त रिकवरी (RECEIVED)", advProfit: "Advance Profit (Cut)",
        archiveToast: "खाता आर्काइव हो गया!", unarchiveToast: "खाता वापस आ गया!", staffRefPh: "रेफरेंस / स्टाफ का नाम", lockSub: "4-अक्षरों की लॉगिन आईडी डालें",
        refStatTitle: "👑 रेफरेंस सारांश", refStatCases: "कुल खाते", refStatValue: "कुल वैल्यू", refStatRec: "प्राप्त", refStatOut: "बकाया",
        refStatCollection: "कुल रोज़ाना किश्त", refStatInterest: "कुल महीने का ब्याज", refStatProfit: "अनुमानित प्रॉफिट",
        repPendings: "⚠️ पेंडिंग कलेक्शन (PENDING)", caseDate: "केस तारीख",
        returnAmt: "वापसी रकम", principal: "मूलधन", totalPaid: "कुल जमा", remainingAcc: "बाकी", payHistory: "पेमेंट हिस्ट्री",
        repNewDaily: "🆕 नए रोज़ाना खाते", repNewMonthly: "🆕 नए महीने के खाते", repNewMeter: "🆕 नए मीटर खाते",
        repRecDaily: "✅ रोज़ाना रिकवरी", repRecMonthly: "✅ महीने की रिकवरी", repRecMeter: "✅ मीटर रिकवरी",
        repPendDaily: "⚠️ पेंडिंग कलेक्शन (रोज़ाना)", repPendMonthly: "⚠️ पेंडिंग कलेक्शन (महीना)", repPendMeter: "⚠️ पेंडिंग कलेक्शन (मीटर)",
        givenOn: "तारीख:", profitCut: "प्रॉफिट कट:", intRec: "ब्याज मिला", monthsText: "महीने", kishatsText: "किश्तें", profitText: "प्रॉफिट:", missedText: "छूटा:", basisText: "आधार", repTotal: "कुल जोड़:", caseClosedText: "खाता बंद ✅"
    },
    'pa': { 
        appSub: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ 👋", sumPrin: "ਕੁੱਲ ਰਕਮ", sumCases: "ਕੁੱਲ ਖਾਤੇ", sumOut: "ਬਕਾਇਆ", 
        addTitle: "ਨਵਾਂ ਖਾਤਾ ਬਣਾਓ", namePh: "ਗਾਹਕ ਦਾ ਨਾਮ", amtPh: "ਮੂਲ ਰਕਮ", addBtn: "ਖਾਤਾ ਜੋੜੋ", 
        navDash: "ਹੋਮ", navCust: "ਖਾਤੇ", navBulk: "ਫਾਸਟ ਐਡ", navStats: "ਰਿਵਿਊ", 
        setMainTitle: "ਐਪ ਸੈਟਿੰਗਜ਼", setBackup: "ਡਾਟਾ ਬੈਕਅੱਪ", setRestore: "ਡਾਟਾ ਵਾਪਸ ਲਿਆਓ", setPinStaff: "ਸਟਾਫ ਪਿੰਨ ਬਦਲੋ", setPinOwner: "ਮਾਲਕ ਪਿੰਨ ਬਦਲੋ 👑", setLogout: "ਲਾਗਆਉਟ", setClose: "ਬੰਦ ਕਰੋ", 
        searchPh: "ਨਾਮ ਖੋਜੋ...", cleanDashTitle: "ਕਲੀਨ ਡੈਸ਼ਬੋਰਡ", cleanDashSub: "ਖਾਤਾ ਦੇਖਣ ਲਈ ਉੱਪਰ ਨਾਮ ਖੋਜੋ।<br>ਪੂਰੀ ਸੂਚੀ ਲਈ <b>ਖਾਤੇ</b> ਟੈਬ 'ਤੇ ਜਾਓ।", 
        bizPort: "ਕਾਰੋਬਾਰ ਪੋਰਟਫੋਲੀਓ", recStatus: "ਰਿਕਵਰੀ ਸਥਿਤੀ", monthly: "ਮਹੀਨਾਵਾਰ", daily: "ਰੋਜ਼ਾਨਾ", meter: "ਮੀਟਰ", recovered: "ਵਸੂਲੀ ਹੋਈ", remaining: "ਬਕਾਇਆ", 
        ownerGrowth: "👑 ਮੁਨਾਫਾ ਅਤੇ ਵਿਕਾਸ", totInvested: "ਕੁੱਲ ਨਿਵੇਸ਼", netProfit: "ਪ੍ਰਾਪਤ ਮੁਨਾਫਾ", ownerNote: "ਇਹ ਡਾਟਾ ਸਿਰਫ਼ ਮਾਲਕ ਲਈ ਹੈ, ਸਟਾਫ਼ ਤੋਂ ਲੁਕਿਆ ਹੋਇਆ ਹੈ।",
        refresh: "ਰਿਫ੍ਰੈਸ਼", totRetPh: "ਕੁੱਲ ਵਾਪਸੀ ਰਕਮ", totDaysPh: "ਕੁੱਲ ਦਿਨ", 
        allTypes: "ਸਾਰੀਆਂ ਕਿਸਮਾਂ", fDaily: "ਰੋਜ਼ਾਨਾ", fMonthly: "ਮਹੀਨਾਵਾਰ", fMeter: "ਮੀਟਰ", fArchived: "ਬੰਦ ਖਾਤੇ",
        optDaily: "ਰੋਜ਼ਾਨਾ ਕਿਸ਼ਤ", optMonthly: "ਮਹੀਨੇ ਦਾ ਵਿਆਜ", optMeter: "ਮੀਟਰ (ਰੋਜ਼ਾਨਾ)", markPersonal: "👑 ਪਰਸਨਲ ਖਾਤਾ",
        sortNew: "ਨਵਾਂ ਪਹਿਲਾਂ ▼", sortOld: "ਪੁਰਾਣਾ ਪਹਿਲਾਂ ▲",
        delCaseMsg: "ਕੀ ਤੁਸੀਂ ਇਹ ਪੂਰਾ ਖਾਤਾ ਮਿਟਾਉਣਾ ਚਾਹੁੰਦੇ ਹੋ?", delCaseSuccess: "ਖਾਤਾ ਮਿਟਾ ਦਿੱਤਾ ਗਿਆ!", editBtn: "ਸੋਧੋ", recBtn: "ਪ੍ਰਾਪਤ ਕਰੋ", bulkBtn: "⚡ ਬਲਕ",
        bulkTitle: "ਬਲਕ ਐਂਟਰੀ", bulkStart: "ਸ਼ੁਰੂਆਤੀ ਮਿਤੀ", bulkEnd: "ਆਖਰੀ ਮਿਤੀ", bulkSubmit: "ਬਲਕ ਪ੍ਰੋਸੈਸ ਕਰੋ", bulkCancel: "ਰੱਦ ਕਰੋ", perMonthAmt: "ਹਰ ਮਹੀਨੇ ਦੀ ਰਕਮ (₹)", perDayAmt: "ਹਰ ਦਿਨ ਦੀ ਰਕਮ (₹)",
        autoBackupLabel: "ਆਟੋ ਬੈਕਅੱਪ ਫਾਈਲ", abNever: "ਕਦੇ ਨਹੀਂ", abDaily: "ਰੋਜ਼ਾਨਾ (ਐਪ ਖੁੱਲਣ 'ਤੇ)", abMonthly: "ਮਹੀਨੇ ਵਿੱਚ ਇੱਕ ਵਾਰ",
        repTitle: "📅 ਤਾਰੀਖ ਦੇ ਅਨੁਸਾਰ ਰਿਪੋਰਟ", repBtn: "ਰਿਪੋਰਟ ਦੇਖੋ", repGiven: "ਕੁੱਲ ਦਿੱਤਾ", repRet: "ਕੁੱਲ ਰਿਕਵਰੀ", repProfit: "ਕਮਾਇਆ ਮੁਨਾਫਾ", repNoData: "ਇਸ ਤਾਰੀਖ ਵਿੱਚ ਕੋਈ ਡਾਟਾ ਨਹੀਂ ਹੈ।", repNewCases: "🆕 ਨਵੇਂ ਖਾਤੇ (GIVEN)", repPayments: "✅ ਪ੍ਰਾਪਤ ਰਿਕਵਰੀ (RECEIVED)", advProfit: "ਐਡਵਾਂਸ ਮੁਨਾਫਾ (ਕਟੌਤੀ)",
        archiveToast: "ਖਾਤਾ ਆਰਕਾਈਵ ਹੋ ਗਿਆ!", unarchiveToast: "ਖਾਤਾ ਵਾਪਸ ਆ ਗਿਆ!", staffRefPh: "ਹਵਾਲਾ / ਸਟਾਫ ਦਾ ਨਾਮ", lockSub: "4-ਅੱਖਰਾਂ ਦੀ ਲੌਗਇਨ ਆਈਡੀ ਦਰਜ ਕਰੋ",
        refStatTitle: "👑 ਰੈਫਰੈਂਸ ਸਾਰਾਂਸ਼", refStatCases: "ਕੁੱਲ ਖਾਤੇ", refStatValue: "ਕੁੱਲ ਮੁੱਲ", refStatRec: "ਪ੍ਰਾਪਤ", refStatOut: "ਬਕਾਇਆ",
        refStatCollection: "ਕੁੱਲ ਰੋਜ਼ਾਨਾ ਕਿਸ਼ਤ", refStatInterest: "ਕੁੱਲ ਮਹੀਨਾਵਾਰ ਵਿਆਜ", refStatProfit: "ਅਨੁਮਾਨਿਤ ਮੁਨਾਫਾ",
        repPendings: "⚠️ ਬਕਾਇਆ ਕਿਸ਼ਤਾਂ (PENDING)", caseDate: "ਕੇਸ ਮਿਤੀ",
        returnAmt: "ਵਾਪਸੀ ਰਕਮ", principal: "ਮੂਲ ਰਕਮ", totalPaid: "ਕੁੱਲ ਜਮ੍ਹਾਂ", remainingAcc: "ਬਕਾਇਆ", payHistory: "ਭੁਗਤਾਨ ਦਾ ਇਤਿਹਾਸ",
        repNewDaily: "🆕 ਨਵੇਂ ਰੋਜ਼ਾਨਾ ਖਾਤੇ", repNewMonthly: "🆕 ਨਵੇਂ ਮਹੀਨੇ ਦੇ ਖਾਤੇ", repNewMeter: "🆕 ਨਵੇਂ ਮੀਟਰ ਖਾਤੇ",
        repRecDaily: "✅ ਰੋਜ਼ਾਨਾ ਰਿਕਵਰੀ", repRecMonthly: "✅ ਮਹੀਨੇ ਦੀ ਰਿਕਵਰੀ", repRecMeter: "✅ ਮੀਟਰ ਰਿਕਵਰੀ",
        repPendDaily: "⚠️ ਬਕਾਇਆ ਕਿਸ਼ਤਾਂ (ਰੋਜ਼ਾਨਾ)", repPendMonthly: "⚠️ ਬਕਾਇਆ ਕਿਸ਼ਤਾਂ (ਮਹੀਨਾਵਾਰ)", repPendMeter: "⚠️ ਬਕਾਇਆ ਕਿਸ਼ਤਾਂ (ਮੀਟਰ)",
        givenOn: "ਤਾਰੀਖ:", profitCut: "ਮੁਨਾਫਾ ਕੱਟਿਆ:", intRec: "ਵਿਆਜ ਮਿਲਿਆ", monthsText: "ਮਹੀਨੇ", kishatsText: "ਕਿਸ਼ਤਾਂ", profitText: "ਮੁਨਾਫਾ:", missedText: "ਛੱਡਿਆ:", basisText: "ਆਧਾਰ", repTotal: "ਕੁੱਲ ਜੋੜ:", caseClosedText: "ਖਾਤਾ ਬੰਦ ✅"
    }
};

let currentLang = localStorage.getItem('paymitra_lang') || 'en';
let autoBackupFreq = localStorage.getItem('paymitra_autobackup') || 'never';

function changeLang() { 
    currentLang = document.getElementById('lang-select').value; 
    localStorage.setItem('paymitra_lang', currentLang); 
    applyLang(); 
    if (typeof render === 'function') render(); 
    showToast("Language Updated!"); 
}

function changeAutoBackup() { 
    autoBackupFreq = document.getElementById('auto-backup-select').value; 
    localStorage.setItem('paymitra_autobackup', autoBackupFreq); 
    showToast("Auto Backup Saved!"); 
}

function applyLang() {
    const t = i18n[currentLang] || i18n['en'];
    const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el && text !== undefined) el.innerText = text;
    };
    const setPlaceholder = (id, text) => {
        const el = document.getElementById(id);
        if (el && text !== undefined) el.placeholder = text;
    };

    setText('t-appSub', t.appSub);
    setText('t-sumPrin', t.sumPrin);
    setText('t-sumCases', t.sumCases);
    setText('t-sumOut', t.sumOut);
    setText('t-refresh', t.refresh);
    setText('t-addTitle', t.addTitle);
    setText('t-addBtn', t.addBtn);
    setText('t-opt-daily', t.optDaily);
    setText('t-opt-monthly', t.optMonthly);
    setText('t-opt-meter', t.optMeter);
    setText('t-markPersonal', t.markPersonal);
    setText('t-editMarkPersonal', t.markPersonal);
    setText('t-navDash', t.navDash);
    setText('t-navCust', t.navCust);
    setText('t-navBulk', t.navBulk);
    setText('t-navStats', t.navStats);
    setText('t-setMainTitle', t.setMainTitle);
    setText('t-setBackup', t.setBackup);
    setText('t-setRestore', t.setRestore);
    setText('btn-owner-pin', t.setPinOwner);
    setText('t-setLogout', t.setLogout);
    setText('t-setClose', t.setClose);
    setText('t-autoBackupLabel', t.autoBackupLabel);
    setText('t-abNever', t.abNever);
    setText('t-abDaily', t.abDaily);
    setText('t-abMonthly', t.abMonthly);
    setText('t-bizPort', t.bizPort);
    setText('t-recStatus', t.recStatus);
    setText('t-ownerGrowth', t.ownerGrowth);
    setText('t-totInvested', t.totInvested);
    setText('t-netProfit', t.netProfit);
    setText('t-ownerNote', t.ownerNote);
    setText('f-opt-all', t.allTypes);
    setText('f-opt-daily', t.fDaily);
    setText('f-opt-monthly', t.fMonthly);
    setText('f-opt-meter', t.fMeter);
    setText('f-opt-archived', t.fArchived);
    setText('s-opt-new', t.sortNew);
    setText('s-opt-old', t.sortOld);
    setText('t-bulkTitle', t.bulkTitle);
    setText('t-bulkStart', t.bulkStart);
    setText('t-bulkEnd', t.bulkEnd);
    setText('t-bulkSubmit', t.bulkSubmit);
    setText('t-bulkCancel', t.bulkCancel);
    setText('t-repTitle', t.repTitle);
    setText('t-repBtn', t.repBtn);
    setText('t-repGiven', t.repGiven);
    setText('t-repRet', t.repRet);
    setText('t-repProfit', t.repProfit);
    setText('t-repAll', t.allTypes);
    setText('t-repDaily', t.fDaily);
    setText('t-repMonthly', t.fMonthly);
    setText('t-repMeter', t.fMeter);
    setText('t-editStaffRefLabel', t.staffRefPh);
    setText('t-lockSub', t.lockSub);

    setPlaceholder('name', t.namePh);
    setPlaceholder('amt', t.amtPh);
    setPlaceholder('search-box', t.searchPh);
    setPlaceholder('total_ret', t.totRetPh);
    setPlaceholder('days', t.totDaysPh);
    setPlaceholder('staff-ref', t.staffRefPh);
}


function showToast(msg) {
    let t = document.getElementById('toast-box');
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function askConfirm(msg, callback) {
    document.getElementById('confirm-text').innerText = msg;
    confirmActionCallback = callback;
    document.getElementById('confirm-modal').style.display = 'flex';
}

function executeConfirm() {
    if (confirmActionCallback) {
        try {
            confirmActionCallback();
        } catch (e) {
            console.error("Confirm action error:", e);
        }
    }
    closeModal('confirm-modal');
    confirmActionCallback = null;
}

function switchTab(tab) { 
    let addForm = document.getElementById('addFormContent');
    let addIcon = document.getElementById('addFormIcon');
    if (addForm && addIcon) { 
        addForm.style.display = 'none'; 
        addIcon.innerHTML = '▼ Open'; 
    }

    currentTab = tab;
    openViews = {};
    multiDelMode = {};
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('nav-' + tab).classList.add('active');
    document.getElementById('section-summary').style.display = (tab === 'dash') ? 'grid' : 'none';
    document.getElementById('section-add').style.display = (tab === 'dash') ? 'block' : 'none';
    document.getElementById('section-stats').style.display = (tab === 'stats') ? 'block' : 'none';
    document.getElementById('section-search').style.display = (tab === 'stats') ? 'none' : 'flex';
    document.getElementById('section-sort').style.display = (tab === 'stats') ? 'none' : 'flex';
    document.getElementById('dashboard').style.display = (tab === 'stats') ? 'none' : 'block';
    
    if (document.getElementById('filter-box')) document.getElementById('filter-box').value = 'all';
    if (document.getElementById('search-box')) document.getElementById('search-box').value = '';
    if (document.getElementById('sort-box')) document.getElementById('sort-box').value = 'new';
    
    if (tab === 'stats') {
        let todayDate = getISTDate();
        document.getElementById('rep-start').value = todayDate;
        document.getElementById('rep-end').value = todayDate;
        if (document.getElementById('rep-type')) document.getElementById('rep-type').value = 'all';
        if (document.getElementById('rep-search')) document.getElementById('rep-search').value = '';
        document.getElementById('rep-results').style.display = 'none';
        document.getElementById('rep-list').scrollTop = 0;
        window.scrollTo(0, 0);
    }
    if (typeof render === 'function') render();
}

function openSettings() {
    document.getElementById('settings-modal').style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// ==========================================
// 7. IMAGE PROCESSING & CROPPER ENGINE
// ==========================================
function toSquareBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const img = new Image();
            img.src = reader.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const size = 200; // CHANGE 1: 400 se 200 kar diya
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                let sWidth = img.width;
                let sHeight = img.height;
                let sx = 0, sy = 0;
                if (sWidth > sHeight) {
                    sx = (sWidth - sHeight) / 2;
                    sWidth = sHeight;
                } else {
                    sy = (sHeight - sWidth) / 2;
                    sHeight = sWidth;
                }
                ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, size, size);
                resolve(canvas.toDataURL('image/jpeg', 0.6)); // CHANGE 1: 0.8 se 0.6 kar diya
            };
        };
        reader.onerror = error => reject(error);
    });
}

function toBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const img = new Image();
            img.src = reader.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const max_size = 400; // CHANGE 2: 800 se 400 kar diya
                if (width > height) {
                    if (width > max_size) {
                        height *= max_size / width;
                        width = max_size;
                    }
                } else {
                    if (height > max_size) {
                        width *= max_size / height;
                        height = max_size;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.6)); // CHANGE 2: 0.8 se 0.6 kar diya
            };
        };
        reader.onerror = error => reject(error);
    });
}

async function handleImageSelect(input, target) {
    if (!input.files || !input.files[0]) return;
    currentCropTarget = target;
    lastCroppedBase64 = ''; 
    try {
        showToast("Loading Crop Tool ⏳...");
        const safeBase64 = await toBase64(input.files[0]);
        const cropModal = document.getElementById('crop-modal');
        cropModal.style.display = 'flex';
        cropModal.style.zIndex = '9999999'; 
        const cropImg = document.getElementById('crop-image-el');
        cropImg.src = safeBase64;
        if (activeCropper) activeCropper.destroy();
        activeCropper = new Cropper(cropImg, {
            aspectRatio: 1, 
            viewMode: 1,
            dragMode: 'move',
            autoCropArea: 1,
            restore: false,
            guides: false,
            center: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
        });
    } catch (e) {
        showToast("Failed to load photo.");
        console.error(e);
    }
}

function confirmCrop() {
    if (!activeCropper) return;
    try {
        // CHANGE 3: width 400, height 400 ko 200, 200 kar diya
        const canvas = activeCropper.getCroppedCanvas({ width: 200, height: 200, fillColor: '#fff' });
        if (!canvas) return showToast("Cropping failed. Try again.");
        // CHANGE 3: 0.8 ko 0.6 kar diya
        lastCroppedBase64 = canvas.toDataURL('image/jpeg', 0.6);
        
        if (currentCropTarget === 'edit') {
            document.getElementById('edit-photo-preview').src = lastCroppedBase64;
            document.getElementById('edit-photo-preview-wrap').style.display = 'flex';
        } else if (currentCropTarget === 'staff-add') {
            document.getElementById('new-staff-photo-preview').src = lastCroppedBase64;
            document.getElementById('new-staff-photo-preview-wrap').style.display = 'flex';
        } else if (currentCropTarget === 'staff-edit') {
            document.getElementById('edit-staff-photo-preview').src = lastCroppedBase64;
            document.getElementById('edit-staff-photo-preview-wrap').style.display = 'flex';
        }
        closeCropModal();
        showToast("Photo Cropped & Ready! ✅");
    } catch (e) {
        showToast("Crop Error!");
        console.error(e);
    }
}

function closeCropModal() {
    if (activeCropper) activeCropper.destroy();
    activeCropper = null;
    document.getElementById('crop-modal').style.display = 'none';
    if (currentCropTarget === 'add') {
        const fi = document.getElementById('cust-photo');
        if (fi) fi.value = '';
    } else if (currentCropTarget === 'edit') {
        const fi = document.getElementById('edit-photo-input');
        if (fi) fi.value = '';
    }
}

function removeStaffAddPhoto() {
    document.getElementById('new-staff-photo-preview-wrap').style.display = 'none';
    document.getElementById('new-staff-photo-preview').src = '';
    lastCroppedBase64 = '';
}

function removeStaffEditPhoto() {
    document.getElementById('edit-staff-photo-preview-wrap').style.display = 'none';
    document.getElementById('edit-staff-photo-preview').src = '';
    window._pendingStaffPhotoRemoval = true;
}

function removeEditPhoto() {
    document.getElementById('edit-photo-preview-wrap').style.display = 'none';
    document.getElementById('edit-photo-preview').src = '';
    window._pendingPhotoRemoval = true;
}


// ==========================================
// 8. LIFECYCLE & INITIALIZATION
// ==========================================
let activeDbRef = null;
let isListenerAttached = false;

window.onload = function() { 
    document.getElementById('lock-screen').style.display = 'flex'; 
    document.getElementById('main-app').style.display = 'none'; 
    if (document.getElementById('lang-select')) document.getElementById('lang-select').value = currentLang;
    if (document.getElementById('auto-backup-select')) document.getElementById('auto-backup-select').value = autoBackupFreq;
    
    let todayDate = getISTDate(); 
    if (document.getElementById('date')) document.getElementById('date').value = todayDate;
    if (document.getElementById('rep-start')) document.getElementById('rep-start').value = todayDate;
    if (document.getElementById('rep-end')) document.getElementById('rep-end').value = todayDate;
    applyLang();
    
    // Secure Firebase Anonymous Authentication & Sync Initializer
    if (typeof firebase !== 'undefined' && firebase.auth && firebase.database) {
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                console.log("Secure Anonymous Login Successful ✅ UID:", user.uid);
                firebase.database().goOnline();
                setupFirebaseListener(); 
            } else {
                firebase.auth().signInAnonymously().catch((error) => {
                    console.error("Firebase Auth Error:", error.message);
                    showToast("Secure Connection Failed! Check internet.");
                });
            }
        });
    }
};

// ==========================================
// 9. AUTHENTICATION, STAFF & PIN MANAGEMENT
// ==========================================
function logout() { 
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); 
    document.getElementById('main-app').style.display = 'none'; 
    document.getElementById('lock-screen').style.display = 'flex'; 
    
    // Disconnect listener cleanly to stop duplicate reads
    try {
        if (activeDbRef) {
            activeDbRef.off();
            activeDbRef = null;
            isListenerAttached = false;
        }
    } catch(e) { console.log(e); }

    resetPin(); 
    isOwnerMode = false; 
    deviceStaffName = ''; 
    activeStaffPhoto = '';
    activeLoginPin = ""; 
    currentLang = 'en'; 
    localStorage.setItem('paymitra_lang', 'en'); 
    if (document.getElementById('lang-select')) document.getElementById('lang-select').value = 'en'; 
    applyLang(); 
    if (document.getElementById('filter-box')) document.getElementById('filter-box').value = 'all'; 
    if (document.getElementById('search-box')) document.getElementById('search-box').value = ''; 
    if (document.getElementById('sort-box')) document.getElementById('sort-box').value = 'new'; 
    document.getElementById('profile-icon-area').innerHTML = '⚙️';
    
    // Chat Clear on Logout
    const chatMessages = document.getElementById('ai-chat-messages');
    if (chatMessages) chatMessages.innerHTML = '<div class="ai-msg">Namaste 👋! Main aapka NAYA Smart Assistant hoon.\nBoliye, aaj main aapki kya madad karoon?</div>';

    const chatInput = document.getElementById('ai-chat-input');
    if (chatInput) chatInput.value = '';
    
    switchTab('dash'); 
}

function validateSession(newDb) { 
    if (isOwnerMode || deviceStaffName === '' || deviceStaffName === 'Default Staff') return true; 
    let conf = newDb.find(x => x.type === 'config'); 
    if (!conf || !conf.staffList) return true; 
    let isValid = conf.staffList.some(s => s.name === deviceStaffName && s.pin === activeLoginPin); 
    if (!isValid) { 
        logout(); 
        setTimeout(() => showToast("Access Revoked / PIN Changed!"), 500); 
        return false; 
    } 
    return true; 
}

function openStaffModal() { 
    closeModal('settings-modal'); 
    renderStaffList(); 
    document.getElementById('staff-modal').style.display = 'flex'; 
}

function renderStaffList() { 
    let conf = getConfig(); 
    let html = ''; 
    if (conf.staffList.length === 0) { 
        html = '<div class="empty-list-msg">No staff added yet.</div>'; 
    } else { 
        conf.staffList.forEach((s, i) => { 
            const photoHtml = s.photo ? `<img src="${s.photo}" class="staff-photo">` : `<div class="staff-photo-placeholder">👤</div>`;
            html += `
            <div class="staff-list-item">
                <div class="staff-info-left">
                    ${photoHtml}
                    <div>
                        <b class="staff-name-text">${s.name}</b> 
                        <span class="staff-pin-text">[ID: ${s.pin}]</span>
                    </div>
                </div>
                <div class="staff-actions-right">
                    <span onclick="openEditStaffProfile(${i})" class="action-icon edit-icon">✏️</span>
                    <span onclick="deleteStaff(${i})" class="action-icon delete-icon">🗑️</span>
                </div>
            </div>`; 
        }); 
    } 
    document.getElementById('staff-list-container').innerHTML = html; 
}

async function addStaff() { 
    let name = document.getElementById('new-staff-name').value.trim(); 
    let pinVal = document.getElementById('new-staff-pin').value.trim(); 
    if (!name || pinVal.length !== 4) return showToast("Enter Name and 4-Digit ID!"); 
    let conf = getConfig(); 
    if (conf.staffList.some(s => s.pin === pinVal) || pinVal === secretPin) { return showToast("This ID is already taken!"); } 
    
    let photoBase64 = (currentCropTarget === 'staff-add' && lastCroppedBase64) ? lastCroppedBase64 : "";
    let finalPhotoUrl = "";
    if (photoBase64) {
        finalPhotoUrl = await uploadToCloudinary(photoBase64);
    }

    conf.staffList.push({ name: name, pin: pinVal, photo: finalPhotoUrl }); 
    syncConfigDelta(conf); 
    document.getElementById('new-staff-name').value = ''; 
    document.getElementById('new-staff-pin').value = ''; 
    removeStaffAddPhoto();
    renderStaffList(); 
    showToast("Staff Added!"); 
}

function openEditStaffProfile(idx) { 
    let conf = getConfig(); 
    window._pendingStaffPhotoRemoval = false;
    lastCroppedBase64 = ''; 
    document.getElementById('edit-staff-idx').value = idx; 
    document.getElementById('edit-staff-new-name').value = conf.staffList[idx].name; 
    document.getElementById('edit-staff-new-pin').value = conf.staffList[idx].pin; 
    const previewWrap = document.getElementById('edit-staff-photo-preview-wrap');
    const previewImg = document.getElementById('edit-staff-photo-preview');
    if (conf.staffList[idx].photo) {
        previewImg.src = conf.staffList[idx].photo;
        previewWrap.style.display = 'flex';
    } else {
        previewWrap.style.display = 'none';
    }
    document.getElementById('edit-staff-pin-modal').style.display = 'flex'; 
}

async function saveStaffProfile() { 
    let idx = document.getElementById('edit-staff-idx').value; 
    let newName = document.getElementById('edit-staff-new-name').value.trim();
    let newPin = document.getElementById('edit-staff-new-pin').value.trim(); 
    if (!newName || newPin.length !== 4) return showToast("Name & 4-Digit ID required!"); 
    let conf = getConfig(); 
    if (conf.staffList.some((s, i) => s.pin === newPin && i != idx) || newPin === secretPin) { return showToast("This ID is already taken!"); } 
    conf.staffList[idx].name = newName;
    conf.staffList[idx].pin = newPin; 
    
    if (currentCropTarget === 'staff-edit' && lastCroppedBase64) {
        conf.staffList[idx].photo = await uploadToCloudinary(lastCroppedBase64);
    } else if (window._pendingStaffPhotoRemoval) {
        conf.staffList[idx].photo = "";
    }
    
    if (typeof renderStaffList === 'function') renderStaffList();
    closeModal('edit-staff-pin-modal'); 
    showToast("Staff Profile Updated!"); 
    syncConfigDelta(conf);
}

function deleteStaff(idx) { 
    askConfirm("Delete this staff account? They will be logged out instantly.", () => { 
        let conf = getConfig(); 
        conf.staffList.splice(idx, 1); 
        if (typeof renderStaffList === 'function') renderStaffList();
        showToast("Staff Account Deleted!");
        syncConfigDelta(conf);
    }); 
}

function openSecretPinModal() { 
    closeModal('settings-modal'); 
    document.getElementById('old-secret-pin').value = ''; 
    document.getElementById('new-secret-pin').value = ''; 
    document.getElementById('secret-pin-modal').style.display = 'flex'; 
}

function saveSecretPin() { 
    let oldP = document.getElementById('old-secret-pin').value; 
    let newP = document.getElementById('new-secret-pin').value; 
    if (oldP === secretPin) { 
        if (newP.trim() !== '') { 
            secretPin = newP; 
            localStorage.setItem('paymitra_secret', secretPin); 
            showToast("Owner PIN Updated 👑!"); 
            closeModal('secret-pin-modal'); 
        } 
    } else { 
        showToast("Incorrect Old Owner PIN!"); 
    } 
}

function exportData() { 
    let d = new Date(); 
    let dateStr = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,'0') + "-" + String(d.getDate()).padStart(2,'0') + "_" + String(d.getHours()).padStart(2,'0') + "-" + String(d.getMinutes()).padStart(2,'0'); 
    let fileName = "CredixBackup_" + dateStr + ".json"; 
    let a = document.createElement("a"); 
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db)], {type: "application/octet-stream"})); 
    a.download = fileName; 
    document.body.appendChild(a);
    a.click(); 
    document.body.removeChild(a);
}

function importData() { 
    let i = document.createElement('input'); 
    i.type = 'file'; 
    i.onchange = e => { 
        let r = new FileReader(); 
        r.onload = () => { 
            try { 
                let imported = JSON.parse(r.result); 
                if (Array.isArray(imported)) {
                    db = imported.filter(x => x != null);
                    saveAndRender();
                    // Perform safe batch delta sync for imported cases
                    db.forEach(item => {
                        if (item && item.type !== 'config' && item.type !== 'trash') {
                            syncCaseDelta(item);
                        }
                    });
                    let conf = getConfig();
                    syncConfigDelta(conf);
                    let tr = getTrash();
                    syncTrashDelta(tr);
                }
                closeModal('settings-modal'); 
                showToast("Data Restored!"); 
            } catch(err) { 
                showToast("Invalid Backup File"); 
            } 
        }; 
        r.readAsText(e.target.files[0]); 
    }; 
    i.click(); 
}

// Lock Screen Keypad & Interaction Logic
function triggerShakeLock() { 
    const dotsContainer = document.getElementById('dots-container'); 
    if (dotsContainer) { 
        dotsContainer.classList.remove('shake'); 
        void dotsContainer.offsetWidth; 
        dotsContainer.classList.add('shake'); 
    } 
}

function press(n) { 
    if (pin.length < 4) { 
        if (navigator.vibrate) navigator.vibrate(20); 
        pin += n; 
        let d = document.getElementById('d' + pin.length); 
        if (d) d.classList.add('active'); 
    } 
}

function resetPin() { 
    pin = ""; 
    for (let i = 1; i <= 4; i++) { 
        let d = document.getElementById('d' + i); 
        if (d) d.classList.remove('active'); 
    } 
}

function deletePinChar() { 
    if (pin.length > 0) { 
        if (navigator.vibrate) navigator.vibrate(20); 
        let d = document.getElementById('d' + pin.length); 
        if (d) d.classList.remove('active'); 
        pin = pin.slice(0, -1); 
    } 
}

function checkPin() { 
    let conf = getConfig(); 
    if (navigator.vibrate) navigator.vibrate(30);
    // Strict Owner Authentication without hardcoded backdoors
    if (pin === secretPin) { 
        isOwnerMode = true; 
        deviceStaffName = "Owner"; 
        activeStaffPhoto = "";
        activeLoginPin = pin; 
        showToast("Owner Mode Unlocked 👑"); 
        unlockApp(); 
    } else { 
        let staffMatch = conf.staffList.find(s => s.pin === pin); 
        if (staffMatch) { 
            isOwnerMode = false; 
            deviceStaffName = staffMatch.name; 
            activeStaffPhoto = staffMatch.photo || "";
            activeLoginPin = pin; 
            showToast(`Welcome ${deviceStaffName} 👋`); 
            unlockApp(); 
        } else if (pin === currentPin && conf.staffList.length === 0) { 
            isOwnerMode = false; 
            deviceStaffName = "Default Staff"; 
            activeStaffPhoto = "";
            activeLoginPin = pin; 
            showToast("Staff Mode Active"); 
            unlockApp(); 
        } else { 
            triggerShakeLock();
            showToast("Invalid ID / PIN"); 
            resetPin(); 
        } 
    } 
}

function checkAutoBackup() { 
    if (autoBackupFreq === 'never' || db.length === 0) return; 
    let todayStr = getISTDate(); 
    let lastBackup = localStorage.getItem('paymitra_lastbackup') || ''; 
    if (autoBackupFreq === 'daily') { 
        if (lastBackup !== todayStr) { 
            exportData(); 
            localStorage.setItem('paymitra_lastbackup', todayStr); 
            setTimeout(() => showToast("Daily Auto Backup Complete!"), 1000); 
        } 
    } else if (autoBackupFreq === 'monthly') { 
        let currentMonth = todayStr.substring(0, 7); 
        let lastMonth = lastBackup.substring(0, 7); 
        if (currentMonth !== lastMonth) { 
            exportData(); 
            localStorage.setItem('paymitra_lastbackup', todayStr); 
            setTimeout(() => showToast("Monthly Auto Backup Complete!"), 1000); 
        } 
    } 
}

function unlockApp() { 
    document.getElementById('lock-screen').style.display = 'none'; 
    document.getElementById('main-app').style.display = 'block'; 
    if (document.getElementById('filter-box')) document.getElementById('filter-box').value = 'all';
    if (document.getElementById('search-box')) document.getElementById('search-box').value = '';
    if (document.getElementById('sort-box')) document.getElementById('sort-box').value = 'new';
    
    const profArea = document.getElementById('profile-icon-area');
    if (activeStaffPhoto) {
        profArea.innerHTML = `<img src="${activeStaffPhoto}" style="width:100%; height:100%; border-radius:50%; object-fit:cover; border:1px solid var(--accent-orange);">`;
    } else {
        profArea.innerHTML = '⚙️';
    }
    
    if (isOwnerMode) {
        document.getElementById('owner-badge').style.display = 'block';
        document.getElementById('owner-title-badge').style.display = 'inline';
        document.getElementById('personal-wrap').style.display = 'flex';
        document.getElementById('btn-owner-pin').style.display = 'block';
        document.getElementById('btn-manage-staff').style.display = 'block';
        document.getElementById('btn-recycle-bin').style.display = 'block';
        document.getElementById('owner-analytics').style.display = 'block';
        document.getElementById('wrap-staff-ref').style.display = 'flex'; 
        document.getElementById('rep-search-wrap').style.display = 'flex'; 
        if (document.getElementById('btn-trash')) document.getElementById('btn-trash').style.display = 'block';
        document.getElementById('t-appSub').innerText = "Owner Dashboard 👑";
    } else {
        document.getElementById('owner-badge').style.display = 'none';
        document.getElementById('owner-title-badge').style.display = 'none';
        document.getElementById('personal-wrap').style.display = 'none';
        document.getElementById('btn-owner-pin').style.display = 'none';
        document.getElementById('btn-manage-staff').style.display = 'none';
        document.getElementById('btn-recycle-bin').style.display = 'none';
        document.getElementById('owner-analytics').style.display = 'none';
        document.getElementById('is-personal').checked = false;
        document.getElementById('wrap-staff-ref').style.display = 'none'; 
        document.getElementById('rep-search-wrap').style.display = 'none'; 
        if (document.getElementById('btn-trash')) document.getElementById('btn-trash').style.display = 'none';
        document.getElementById('t-appSub').innerText = `Welcome ${deviceStaffName} 👋`;
    }
    
    setupFirebaseListener();
    if (typeof render === 'function') render(); 
    checkAutoBackup();
}

// ==========================================
// 10. FIREBASE REALTIME & OFFLINE SYNC ENGINE
// ==========================================
let localTombstones = JSON.parse(localStorage.getItem('paymitra_tombstones') || '{}');

function saveLocalTombstones() {
    localStorage.setItem('paymitra_tombstones', JSON.stringify(localTombstones));
}

// Delta Sync Dispatchers (Updated for Unified Enqueue)
function syncCaseDelta(caseObj) {
    if (!caseObj || !caseObj.id) return;
    caseObj.updatedAt = Date.now();
    caseObj.version = (caseObj.version || 0) + 1;
    
    let currentDbStr = JSON.stringify(db);
    localStorage.setItem('paymitra_v11', currentDbStr);
    
    try {
        if (typeof localDB !== 'undefined' && localDB.cases) {
            localDB.cases.put(caseObj).catch(() => {});
        }
    } catch(e) {}

    let syncStatus = document.getElementById('sync-status');
    let cloudInd = document.getElementById('cloud-indicator');

    const queueTask = {
        action: 'UPSERT_CASE',
        caseId: caseObj.id,
        collection: 'credix_db/cases',
        payload: caseObj
    };

    if (!navigator.onLine) {
        if (syncStatus) syncStatus.innerText = "Saved Offline";
        if (cloudInd) cloudInd.className = "status-dot offline";
        EnterpriseSyncEngine.enqueue(queueTask);
        return;
    }

    if (syncStatus) syncStatus.innerText = "Syncing...";
    if (cloudInd) cloudInd.className = "status-dot sync-anim";

    let updates = {};
    updates[`credix_db/cases/${caseObj.id}`] = caseObj;

    // 🔥 SMART SYNC: Update Customer Portal without full DB upload
    if (caseObj.customerToken) {
        updates[`customer_portal/${caseObj.customerToken}`] = {
            name: caseObj.name,
            principal: caseObj.principal,
            totalPayable: caseObj.totalPayable || caseObj.principal,
            currentBalance: caseObj.currentBalance,
            installment: caseObj.installment || 0,
            type: caseObj.type,
            startDate: caseObj.startDate,
            history: caseObj.history || []
        };
    }

    database.ref().update(updates).then(() => {
        if (syncStatus) syncStatus.innerText = "Cloud Synced";
        if (cloudInd) cloudInd.className = "status-dot";
    }).catch((err) => {
        if (syncStatus) syncStatus.innerText = "Saved Offline";
        if (cloudInd) cloudInd.className = "status-dot offline";
        EnterpriseSyncEngine.enqueue(queueTask);
    });
}

function deleteCaseDelta(caseId, tombstone, trashPayload) {
    localTombstones[caseId] = tombstone;
    saveLocalTombstones();
    
    try {
        if (typeof localDB !== 'undefined' && localDB.cases) {
            localDB.cases.delete(caseId).catch(() => {});
        }
    } catch(e) {}

    let currentDbStr = JSON.stringify(db);
    localStorage.setItem('paymitra_v11', currentDbStr);

    let syncStatus = document.getElementById('sync-status');
    let cloudInd = document.getElementById('cloud-indicator');

    const queueTask = {
        action: 'DELETE_CASE',
        caseId: caseId,
        collection: 'credix_db',
        tombstone: tombstone,
        trashPayload: trashPayload,
        deletedBy: deviceStaffName
    };

    if (!navigator.onLine) {
        if (syncStatus) syncStatus.innerText = "Saved Offline";
        if (cloudInd) cloudInd.className = "status-dot offline";
        EnterpriseSyncEngine.enqueue(queueTask);
        return;
    }

    if (syncStatus) syncStatus.innerText = "Syncing...";
    if (cloudInd) cloudInd.className = "status-dot sync-anim";

    let updates = {};
    updates[`credix_db/cases/${caseId}`] = null;
    updates[`credix_db/tombstones/${caseId}`] = tombstone;
    if (trashPayload) {
        updates[`credix_db/trash`] = trashPayload;
    }

    database.ref().update(updates).then(() => {
        if (syncStatus) syncStatus.innerText = "Cloud Synced";
        if (cloudInd) cloudInd.className = "status-dot";
    }).catch(() => {
        if (syncStatus) syncStatus.innerText = "Saved Offline";
        if (cloudInd) cloudInd.className = "status-dot offline";
        EnterpriseSyncEngine.enqueue(queueTask);
    });
}

function syncConfigDelta(configObj) {
    let currentDbStr = JSON.stringify(db);
    localStorage.setItem('paymitra_v11', currentDbStr);

    const queueTask = {
        action: 'UPDATE_CONFIG',
        collection: 'credix_db/config',
        payload: configObj
    };

    if (!navigator.onLine) {
        EnterpriseSyncEngine.enqueue(queueTask);
        return;
    }
    database.ref('credix_db/config').set(configObj).catch(() => {
        EnterpriseSyncEngine.enqueue(queueTask);
    });
}

function syncTrashDelta(trashObj) {
    let currentDbStr = JSON.stringify(db);
    localStorage.setItem('paymitra_v11', currentDbStr);

    const queueTask = {
        action: 'UPDATE_TRASH',
        collection: 'credix_db/trash',
        payload: trashObj
    };

    if (!navigator.onLine) {
        EnterpriseSyncEngine.enqueue(queueTask);
        return;
    }
    database.ref('credix_db/trash').set(trashObj).catch(() => {
        EnterpriseSyncEngine.enqueue(queueTask);
    });
}

function setupFirebaseListener() {
    if (isListenerAttached && activeDbRef) return;
    
    let cachedDbStr = localStorage.getItem('paymitra_v11') || "[]";
    try {
        let cachedDb = JSON.parse(cachedDbStr);
        if (cachedDb.length > 0) db = cachedDb;
    } catch(e) {}

    // Attach single scoped listener
    activeDbRef = database.ref('credix_db');
    isListenerAttached = true;

    activeDbRef.on('value', (snapshot) => {
        if (snapshot.exists()) {
            let data = snapshot.val() || {};
            let serverTombstones = data.tombstones || {};
            
            // Merge server tombstones into local storage
            Object.assign(localTombstones, serverTombstones);
            saveLocalTombstones();

            let serverCasesMap = data.cases || {};
            let serverCases = [];
            if (Array.isArray(serverCasesMap)) {
                serverCases = serverCasesMap.filter(c => c != null);
            } else if (typeof serverCasesMap === 'object') {
                serverCases = Object.values(serverCasesMap).filter(c => c != null);
            }

            // Compatibility Migration: If previous DB was an un-nested array directly in credix_db
            if (serverCases.length === 0 && Array.isArray(data)) {
                serverCases = data.filter(x => x && x.type !== 'config' && x.type !== 'trash');
            }

            let serverConfig = data.config || db.find(x => x.type === 'config') || { id: 'config_staff', type: 'config', staffList: [] };
            let serverTrash = data.trash || db.find(x => x.type === 'trash') || { id: 'trash_bin', type: 'trash', cases: [], histories: [] };

            // Absolute Protection: Filter out any deleted/tombstoned cases
            let validCases = serverCases.filter(c => {
                if (!c || !c.id) return false;
                let tomb = localTombstones[c.id];
                if (tomb && tomb.deletedAt >= (c.updatedAt || 0)) {
                    return false; // Case is deleted. Block resurrection.
                }
                return true;
            });

            validCases.forEach(item => {
                if (!item.history) item.history = [];
            });

            // Reconstruct unified local DB state
            let newDb = [
                serverConfig,
                serverTrash,
                ...validCases
            ];

            db = newDb;
            let newDbStr = JSON.stringify(db);
            localStorage.setItem('paymitra_v11', newDbStr);
            localStorage.setItem('paymitra_last_synced_v11', newDbStr);

            // IndexedDB mirror update
            try {
                let aiData = db.filter(c => c && c.type !== 'config' && c.type !== 'trash');
                if (typeof localDB !== 'undefined' && localDB.cases) {
                    localDB.cases.clear().then(() => localDB.cases.bulkPut(aiData)).catch(() => {});
                }
            } catch(e) {}

            if (document.getElementById('main-app') && document.getElementById('main-app').style.display !== 'none') {
                if (typeof validateSession === 'function' && !validateSession(db)) return;
                if (typeof render === 'function') render();
                if (document.getElementById('trash-modal') && document.getElementById('trash-modal').style.display === 'flex') {
                    if (typeof renderTrash === 'function') renderTrash();
                }
            }
        }
        
        if (document.getElementById('sync-status')) document.getElementById('sync-status').innerText = "Cloud Synced";
        if (document.getElementById('cloud-indicator')) document.getElementById('cloud-indicator').className = "status-dot";
        
        // Process any queued offline actions safely
        EnterpriseSyncEngine.processQueue();
    }, (error) => {
        if (document.getElementById('sync-status')) document.getElementById('sync-status').innerText = "Offline Mode";
        if (document.getElementById('cloud-indicator')) document.getElementById('cloud-indicator').className = "status-dot offline";
    });
}

function hardRefresh() { 
    document.getElementById('sync-status').innerText = "Syncing...";
    database.ref('credix_db').once('value').then((snapshot) => {
        if (snapshot.exists()) {
            let data = snapshot.val() || {};
            let serverTombstones = data.tombstones || {};
            Object.assign(localTombstones, serverTombstones);
            saveLocalTombstones();

            let serverCasesMap = data.cases || {};
            let serverCases = Array.isArray(serverCasesMap) ? serverCasesMap.filter(c => c != null) : Object.values(serverCasesMap).filter(c => c != null);
            if (serverCases.length === 0 && Array.isArray(data)) {
                serverCases = data.filter(x => x && x.type !== 'config' && x.type !== 'trash');
            }

            let serverConfig = data.config || getConfig();
            let serverTrash = data.trash || getTrash();

            let validCases = serverCases.filter(c => {
                if (!c || !c.id) return false;
                let tomb = localTombstones[c.id];
                return !(tomb && tomb.deletedAt >= (c.updatedAt || 0));
            });

            validCases.forEach(item => { if (!item.history) item.history = []; });

            db = [serverConfig, serverTrash, ...validCases];
            let dbStr = JSON.stringify(db);
            localStorage.setItem('paymitra_v11', dbStr);
            localStorage.setItem('paymitra_last_synced_v11', dbStr);
            
            try {
                if (typeof localDB !== 'undefined' && localDB.cases) {
                    localDB.cases.clear().then(() => localDB.cases.bulkPut(validCases)).catch(() => {});
                }
            } catch(e) {}
        }
        document.getElementById('sync-status').innerText = "Cloud Synced";
        showToast("Sync Successful!");
        if (typeof render === 'function') render();
    }).catch(() => {
        document.getElementById('sync-status').innerText = "Offline Mode";
    });
}

function saveAndRender() {
    try {
        if (Array.isArray(db)) {
            db = db.filter(item => item != null);
        }
        
        let currentDbStr = JSON.stringify(db);
        localStorage.setItem('paymitra_v11', currentDbStr);
        
        if (typeof render === 'function') render(); 

        let syncStatus = document.getElementById('sync-status');
        let cloudInd = document.getElementById('cloud-indicator');
        
        if (syncStatus) syncStatus.innerText = "Cloud Synced";
        if (cloudInd) cloudInd.className = "status-dot";

        // Enterprise IndexedDB Mirror
        try {
            let aiData = db.filter(c => c && c.type !== 'config' && c.type !== 'trash');
            if (typeof localDB !== 'undefined' && localDB.cases) {
                localDB.cases.clear().then(() => localDB.cases.bulkPut(aiData)).catch(e => {});
            }
        } catch(e) {}
    } catch (fatalError) {
        console.log("Save & Render Error: ", fatalError);
    }
}

// ==========================================
// 11. FINANCIAL CALCULATIONS & BUSINESS LOGIC
// ==========================================
function autoCalc() { 
    let type = document.getElementById('type').value; 
    let amt = parseFloat(document.getElementById('amt').value) || 0; 
    if (type === 'meter' && amt > 0) { 
        document.getElementById('meter-amt').value = (amt * 0.01).toFixed(0); 
    } else if (type === 'meter') { 
        document.getElementById('meter-amt').value = ''; 
    } 
}

function toggleFields() { 
    const t = document.getElementById('type').value; 
    document.getElementById('m-fields').style.display = t === 'monthly' ? 'block' : 'none'; 
    document.getElementById('d-fields').style.display = t === 'daily' ? 'block' : 'none'; 
    document.getElementById('meter-fields').style.display = t === 'meter' ? 'block' : 'none'; 
    autoCalc(); 
}

function triggerShake(id) { 
    let el = document.getElementById(id); 
    if (el) { 
        let group = el.closest('.input-group'); 
        if (group) { 
            group.classList.add('shake-error'); 
            setTimeout(() => group.classList.remove('shake-error'), 400); 
        } 
    } 
}

function recalculateCase(c) { 
    if (!c.history) c.history = []; 
    c.history.sort((a, b) => (a.date > b.date ? 1 : -1)); 
    
    let tempBal = (c.type === 'monthly' || c.type === 'meter') ? c.principal : (c.totalPayable || c.principal); 
    let currentPrincipal = tempBal;
    
    let lastInterestPaidDate = new Date(c.startDate);

    c.history.forEach(h => { 
        let hDate = new Date(h.date);
        let paidAmt = parseFloat(h.paid) || 0;
        let expectedInterest = (currentPrincipal * (c.rate || 0)) / 100;

        if (c.type === 'monthly') { 
            let rateFraction = (c.rate || 0) / 100;
            let expectedInterestMonthly = currentPrincipal * rateFraction;

            // Rule 1: Full Settlement
            if (paidAmt >= currentPrincipal && currentPrincipal > 0) {
                currentPrincipal = 0;
                lastInterestPaidDate = hDate;
            }
            // Rule 2: Exact Interest Payment (Advance Interest)
            else if (Math.abs(paidAmt - expectedInterestMonthly) < 5) {
                lastInterestPaidDate = hDate; 
            }
            // Rule 3: Principal Reduction + New Balance Advance Interest (Zero-division safe)
            else if (paidAmt > expectedInterestMonthly) {
                let principalReduction = (rateFraction < 0.99) 
                    ? (paidAmt - expectedInterestMonthly) / (1 - rateFraction)
                    : (paidAmt - expectedInterestMonthly);

                if (principalReduction > 0 && principalReduction <= currentPrincipal) {
                    currentPrincipal -= principalReduction;
                } else {
                    currentPrincipal -= (paidAmt - expectedInterestMonthly);
                }
                lastInterestPaidDate = hDate;
            }
            // Rule 4: Partial Payment Under Expected Interest
            else {
                currentPrincipal -= paidAmt;
            }
        } else if (c.type === 'meter') { 
            if (paidAmt >= currentPrincipal && currentPrincipal > 0) {
                currentPrincipal = 0;
            } else {
                let date1 = new Date(lastInterestPaidDate.getFullYear(), lastInterestPaidDate.getMonth(), lastInterestPaidDate.getDate());
                let date2 = new Date(hDate.getFullYear(), hDate.getMonth(), hDate.getDate());
                let daysSinceLastInterest = Math.round((date2 - date1) / (1000 * 60 * 60 * 24));
                if (date1.getTime() === new Date(c.startDate).getTime()) {
                    daysSinceLastInterest += 1;
                }
                if (daysSinceLastInterest < 1) daysSinceLastInterest = 1; 
                
                let totalExpectedMeter = daysSinceLastInterest * expectedInterest;
                if (paidAmt > totalExpectedMeter) {
                    currentPrincipal -= (paidAmt - totalExpectedMeter);
                }
            }
            lastInterestPaidDate = hDate;
        } else { 
            // Daily Basis Direct Reduction
            currentPrincipal -= paidAmt; 
        } 
        
        if (currentPrincipal < 0.5 && currentPrincipal > -0.5) currentPrincipal = 0;
        h.balance = currentPrincipal; 
        h.bal = currentPrincipal.toFixed(0); 
    }); 
    c.currentBalance = currentPrincipal; 
}

// ==========================================
// 12. CRUD OPERATIONS (CUSTOMERS & PAYMENTS)
// ==========================================
async function addCustomer() {
    const tLang = i18n[currentLang];
    const type = document.getElementById('type').value;
    const name =
document.getElementById('name').value.trim();
    const mobile = document.getElementById('mobile') ? document.getElementById('mobile').value.trim() : '';
    const address = document.getElementById('address') ? document.getElementById('address').value.trim() : '';
    const idProof = document.getElementById('id-proof') ? document.getElementById('id-proof').value.trim() : '';


    const amt = parseFloat(document.getElementById('amt').value);
    const rawDate = document.getElementById('date').value;
    
    const date = (rawDate || getISTDate()).replace(/[^\d-]/g, '').trim();
    const staffRef = isOwnerMode ? document.getElementById('staff-ref').value.trim() : deviceStaffName;
    const isPersonal = document.getElementById('is-personal') ? document.getElementById('is-personal').checked : false;
    
    if (!name) { triggerShake('name'); return showToast(tLang.missingNameAmt || "Missing Name!"); }
    if (isNaN(amt) || amt <= 0) { triggerShake('amt'); return showToast(tLang.missingNameAmt || "Missing Principal!"); }
    
    let photoBase64 = "";
    if (lastCroppedBase64) {
        photoBase64 = lastCroppedBase64;
    } else {
        const fileInput = document.getElementById('cust-photo');
        if (fileInput && fileInput.files && fileInput.files[0]) {
            photoBase64 = await toSquareBase64(fileInput.files[0]);
        }
    }
    
    // --- CLOUDINARY UPLOAD MAGIC ---
    let finalPhotoUrl = "";
    if (photoBase64) {
        finalPhotoUrl = await uploadToCloudinary(photoBase64);
    }
    
    let cust = { 
        id: Date.now(), 
        name, 
    mobile: mobile,
    address: address,
     idProof: idProof,

        principal: amt, 
        type, 
        startDate: date, 
        history: [], 
        staffRef: staffRef, 
        isPersonal: isPersonal, 
        isArchived: false, 
        photo: finalPhotoUrl, // URL save hoga base64 nahi
        version: 1,
        updatedAt: Date.now()
    };
    
    if (type === 'monthly') { 
        let rateVal = parseFloat(document.getElementById('rate').value);
        if (isNaN(rateVal)) { triggerShake('rate'); return showToast(tLang.missingRate || "Missing Interest Rate!"); }
        cust.rate = rateVal; 
        cust.currentBalance = amt; 
    } else if (type === 'meter') { 
        let mAmt = parseFloat(document.getElementById('meter-amt').value);
        if (isNaN(mAmt)) { triggerShake('meter-amt'); return showToast(tLang.missingMeter || "Missing Rozana Vyaj!"); }
        cust.rate = (mAmt / amt) * 100; 
        cust.currentBalance = amt; 
    } else { 
        let tRet = parseFloat(document.getElementById('total_ret').value);
        let dVals = parseInt(document.getElementById('days').value);
        if (isNaN(tRet)) { triggerShake('total_ret'); return showToast(tLang.missingRet || "Missing Return Amount!"); }
        if (isNaN(dVals) || dVals <= 0) { triggerShake('days'); return showToast(tLang.missingDays || "Missing Total Days!"); }
        cust.totalPayable = tRet; 
        cust.currentBalance = cust.totalPayable; 
        cust.installment = cust.totalPayable / dVals; 
    }
    
    db.push(cust); 
    syncCaseDelta(cust);
    if (typeof render === 'function') render();

    document.getElementById('name').value = ''; 
    document.getElementById('amt').value = ''; 
    document.getElementById('staff-ref').value = '';
    const custPhoto = document.getElementById('cust-photo');
    if (custPhoto) custPhoto.value = '';
    lastCroppedBase64 = ''; 
    if (document.getElementById('total_ret')) document.getElementById('total_ret').value = '';
    if (document.getElementById('days')) document.getElementById('days').value = '';
    if (document.getElementById('meter-amt')) document.getElementById('meter-amt').value = '';
    showToast("Record Created!");
}

function toggleView(id) {
    const viewEl = document.getElementById('view-' + id);
    if (!viewEl) return;

    const isAlreadyOpen = (viewEl.style.display === 'block');

    document.querySelectorAll('[id^="view-"]').forEach(el => {
        el.style.display = 'none';
    });
    
    for (let key in openViews) delete openViews[key];

    if (!isAlreadyOpen) {
        viewEl.style.display = 'block';
        openViews[id] = true;
    }
}

function toggleMultiDel(id) { 
    multiDelMode[id] = !multiDelMode[id]; 
    lastSelectedHistoryIndex = null; 
    if (typeof render === 'function') render(); 
}

function handleMultiSelectCheck(event, custId) {
    let clickedCheckbox = event.target;
    let allCheckboxes = Array.from(document.querySelectorAll(`.del-chk-${custId}`));
    let currentIndex = allCheckboxes.findIndex(chk => chk === clickedCheckbox);
    
    if (clickedCheckbox.checked) {
        if (lastSelectedHistoryIndex !== null && lastSelectedHistoryIndex !== currentIndex) {
            let start = Math.min(lastSelectedHistoryIndex, currentIndex);
            let end = Math.max(lastSelectedHistoryIndex, currentIndex);
            for (let i = start; i <= end; i++) {
                allCheckboxes[i].checked = true;
            }
        }
        lastSelectedHistoryIndex = currentIndex;
    } else {
        lastSelectedHistoryIndex = null;
    }
}

function toggleSelectAllHistory(id) { 
    let checks = document.querySelectorAll(`.del-chk-${id}`); 
    let allChecked = Array.from(checks).every(ck => ck.checked); 
    checks.forEach(ck => ck.checked = !allChecked); 
}

function openPayModal(id, prefillAmt = null) { 
    let c = db.find(x => x.id === id); 
    document.getElementById('pay-id').value = id; 
    document.getElementById('pay-date').value = getISTDate(); 
    let amt = 0;
    if (prefillAmt !== null && prefillAmt > 0) {
        amt = prefillAmt; 
    } else {
        amt = c.type === 'monthly' ? (c.currentBalance * (c.rate||0)/100) : (c.type === 'meter' ? (c.currentBalance * (c.rate||0)/100) : (c.installment || 0)); 
    }
    document.getElementById('pay-amt').value = amt.toFixed(0); 
    document.getElementById('pay-modal').style.display = 'flex'; 
}

function savePayment() { 
    let id = parseInt(document.getElementById('pay-id').value); 
    let c = db.find(x => x.id === id); 
    if (!c) return showToast("Customer account not found!");

    let amt = parseFloat(document.getElementById('pay-amt').value); 
    let rawDateStr = document.getElementById('pay-date').value; 
    
    // iPadOS / Safari hidden characters cleanup
    let dateStr = (rawDateStr || '').replace(/[^\d-]/g, '').trim();

    if (!amt || !dateStr) { 
        triggerShake('pay-amt'); 
        return showToast("Valid data required"); 
    } 
    
    if (c.history && c.history.some(h => h.date === dateStr)) { 
        triggerShake('pay-date'); 
        return showToast(i18n[currentLang].dupEntry || "Payment already added for this date!"); 
    } 
    
    c.history.push({ date: dateStr, paid: amt }); 
    recalculateCase(c); 
    
    syncCaseDelta(c);
    if (typeof render === 'function') render(); 
    closeModal('pay-modal'); 
    showToast("Payment Saved"); 
    
    if (currentTab === 'stats' && document.getElementById('rep-results').style.display === 'block') {
        if (typeof generateReport === 'function') generateReport();
    }
}

function openBulkModal(id, startOverride = null, endOverride = null) { 
    let c = db.find(x => x.id === id); 
    document.getElementById('bulk-id').value = id; 
    let todayStr = getISTDate(); 
    
    let calculatedStartDate = todayStr;
    if (startOverride && typeof startOverride === 'string') {
        calculatedStartDate = startOverride; 
    } else {
        if (c.history && c.history.length > 0) {
            let sortedHist = [...c.history].sort((a, b) => a.date > b.date ? 1 : -1);
                    let lastPaidDateStr = sortedHist[sortedHist.length - 1].date;
                    
                    if (c.type === 'monthly') {
                        // Monthly cases ke liye naya safe function use karein
                        calculatedStartDate = addMonthsSafe(lastPaidDateStr, 1);
                    } else {
                        // Daily/Meter cases ke liye purana logic (sirf din add karna)
                        let nextDate = new Date(lastPaidDateStr);
                        nextDate.setDate(nextDate.getDate() + 1);
                        let y = nextDate.getFullYear();
                        let m = String(nextDate.getMonth() + 1).padStart(2, '0');
                        let d = String(nextDate.getDate()).padStart(2, '0');
                        calculatedStartDate = `${y}-${m}-${d}`;
                    }

            
            if (calculatedStartDate > todayStr) {
                calculatedStartDate = todayStr;
            }
        } else {
            calculatedStartDate = c.startDate;
        }
    }

    document.getElementById('bulk-start-date').value = calculatedStartDate; 
    document.getElementById('bulk-end-date').value = (endOverride && typeof endOverride === 'string') ? endOverride : todayStr; 
    
    let amt = c.type === 'monthly' ? (c.principal * (c.rate||0)/100) : (c.type === 'meter' ? (c.principal * (c.rate||0)/100) : (c.installment || 0)); 
    document.getElementById('bulk-amt').value = amt.toFixed(0); 
    const t = i18n[currentLang]; 
    const freqText = c.type === 'monthly' ? t.fMonthly : (c.type === 'meter' ? t.fMeter : t.fDaily); 
    document.getElementById('bulk-freq-label').innerText = `(${freqText})`; 
    document.getElementById('bulk-amt-label').innerText = c.type === 'monthly' ? t.perMonthAmt : t.perDayAmt; 
    document.getElementById('bulk-modal').style.display = 'flex'; 
}

function saveBulkPayment() { 
    let id = parseInt(document.getElementById('bulk-id').value); 
    let c = db.find(x => x.id === id); 
    if (!c) return showToast("Customer account not found!");

    let amt = parseFloat(document.getElementById('bulk-amt').value); 
    let startStr = document.getElementById('bulk-start-date').value; 
    let endStr = document.getElementById('bulk-end-date').value; 
    if (!amt || !startStr || !endStr) { triggerShake('bulk-amt'); return; } 
    
    if (endStr < startStr) return showToast("End date must be later"); 
    
    // Helper function to safely increment dates without 31st overflow bug
    const getNextDateStr = (currentYMD, isMonthly, anchorDay) => {
        let [y, m, d] = currentYMD.split('-').map(Number);
        if (isMonthly) {
            let nextMonth = m + 1;
            let nextYear = y;
            if (nextMonth > 12) {
                nextMonth = 1;
                nextYear += 1;
            }
            // Clamp to last day of target month if anchor day doesn't exist (e.g. Feb 28/29)
            let maxDaysInMonth = new Date(nextYear, nextMonth, 0).getDate();
            let safeDay = Math.min(anchorDay, maxDaysInMonth);
            return `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
        } else {
            let dt = new Date(y, m - 1, d);
            dt.setDate(dt.getDate() + 1);
            let ny = dt.getFullYear();
            let nm = String(dt.getMonth() + 1).padStart(2, '0');
            let nd = String(dt.getDate()).padStart(2, '0');
            return `${ny}-${nm}-${nd}`;
        }
    };

    let anchorDay = parseInt(startStr.split('-')[2]);
    let tempDateStr = startStr;
    let hasDuplicate = false; 

    // Step 1: Duplicate Check Loop
    while (tempDateStr <= endStr) { 
        if (c.history && c.history.some(h => h.date === tempDateStr)) { 
            hasDuplicate = true; 
            break; 
        } 
        tempDateStr = getNextDateStr(tempDateStr, c.type === 'monthly', anchorDay);
    } 

    if (hasDuplicate) { 
        triggerShake('bulk-start-date'); 
        triggerShake('bulk-end-date'); 
        return showToast(i18n[currentLang].dupEntry || "Payment already added for this date!"); 
    } 

    // Step 2: Push Entries Loop
    let pushDateStr = startStr; 
    while (pushDateStr <= endStr) { 
        c.history.push({ date: pushDateStr, paid: amt }); 
        pushDateStr = getNextDateStr(pushDateStr, c.type === 'monthly', anchorDay);
    } 

    recalculateCase(c); 
    syncCaseDelta(c);
    if (typeof render === 'function') render(); 
    closeModal('bulk-modal'); 
    showToast("Bulk Saved!"); 

    if (currentTab === 'stats' && document.getElementById('rep-results').style.display === 'block') {
        if (typeof generateReport === 'function') generateReport();
    }
}

function openEditModal(id) { 
    window._pendingPhotoRemoval = false;
    lastCroppedBase64 = ''; 
    let c = db.find(x => x.id === id); 
    document.getElementById('edit-id').value = id; 
    document.getElementById('edit-name').value = c.name; 
    document.getElementById('edit-mobile').value = c.mobile || '';
    document.getElementById('edit-address').value = c.address || '';
    document.getElementById('edit-id-proof').value = c.idProof || '';

    document.getElementById('edit-staff-ref').value = c.staffRef || ''; 
    document.getElementById('edit-date').value = c.startDate; 
    document.getElementById('edit-amt').value = c.principal; 
    const previewWrap = document.getElementById('edit-photo-preview-wrap');
    const previewImg = document.getElementById('edit-photo-preview');
    if (c.photo) { 
        previewImg.src = c.photo; 
        previewWrap.style.display = 'flex'; 
    } else { 
        previewWrap.style.display = 'none'; 
    }
    document.getElementById('edit-photo-input').value = '';
    if (c.type === 'monthly') { 
        document.getElementById('edit-extra-label').innerText = "Monthly Rate (%)"; 
        document.getElementById('edit-extra').value = c.rate; 
        document.getElementById('edit-ret-wrap').style.display = 'none'; 
    } else if (c.type === 'meter') { 
        document.getElementById('edit-extra-label').innerText = "Rozana Vyaj Amount (₹)"; 
        document.getElementById('edit-extra').value = (c.principal * c.rate / 100).toFixed(0); 
        document.getElementById('edit-ret-wrap').style.display = 'none'; 
    } else { 
        document.getElementById('edit-extra-label').innerText = "Kishat Amount (₹)"; 
        document.getElementById('edit-extra').value = c.installment; 
        document.getElementById('edit-ret-wrap').style.display = 'block'; 
        document.getElementById('edit-ret').value = c.totalPayable || c.principal; 
    } 
    if (isOwnerMode) { 
        document.getElementById('edit-staff-wrap').style.display = 'block'; 
        document.getElementById('edit-personal-wrap').style.display = 'flex'; 
        document.getElementById('edit-is-personal').checked = !!c.isPersonal; 
    } else { 
        document.getElementById('edit-staff-wrap').style.display = 'none'; 
        document.getElementById('edit-personal-wrap').style.display = 'none'; 
    } 
    document.getElementById('edit-modal').style.display = 'flex'; 
}

async function saveEdit() { 
    let id = parseInt(document.getElementById('edit-id').value); 
    let c = db.find(x => x.id === id); 
    let oldRate = c.rate; 
    let oldInstallment = c.installment; 
    let oldTotalPayable = c.totalPayable; 
    let nameVal = document.getElementById('edit-name').value; 
    if (nameVal) c.name = nameVal; 
    c.mobile = document.getElementById('edit-mobile') ? document.getElementById('edit-mobile').value.trim() : '';
    c.address = document.getElementById('edit-address') ? document.getElementById('edit-address').value.trim() : '';
    c.idProof = document.getElementById('edit-id-proof') ? document.getElementById('edit-id-proof').value.trim() : '';

    
    let photoBase64 = c.photo; 
    if (lastCroppedBase64) { 
        photoBase64 = lastCroppedBase64; 
    } else if (window._pendingPhotoRemoval) { 
        photoBase64 = ""; 
    } else { 
        const fileInput = document.getElementById('edit-photo-input'); 
        if (fileInput.files && fileInput.files[0]) { 
            photoBase64 = await toSquareBase64(fileInput.files[0]); 
        } 
    }

    // --- CLOUDINARY UPLOAD MAGIC ---
    if (photoBase64 && photoBase64.startsWith('data:image')) {
        c.photo = await uploadToCloudinary(photoBase64);
    } else {
        c.photo = photoBase64; 
    }

    if (isOwnerMode) { 
        c.staffRef = document.getElementById('edit-staff-ref').value.trim(); 
        c.isPersonal = document.getElementById('edit-is-personal').checked; 
    } 
    let dateVal = document.getElementById('edit-date').value; 
    if (dateVal) c.startDate = dateVal; 
    let amtVal = parseFloat(document.getElementById('edit-amt').value); 
    if (!isNaN(amtVal)) c.principal = amtVal; 
    let extra = parseFloat(document.getElementById('edit-extra').value); 
    if (c.type === 'monthly') c.rate = !isNaN(extra) ? extra : oldRate; 
    else if (c.type === 'meter') c.rate = !isNaN(extra) && c.principal ? (extra / c.principal) * 100 : oldRate; 
    else { 
        c.installment = !isNaN(extra) ? extra : oldInstallment; 
        let retInput = document.getElementById('edit-ret'); 
        if (retInput && retInput.value) { 
            let parsedRet = parseFloat(retInput.value); 
            c.totalPayable = !isNaN(parsedRet) ? parsedRet : (oldTotalPayable || c.principal); 
        } else {
            c.totalPayable = oldTotalPayable || c.principal; 
        }
    } 
    recalculateCase(c); 
    closeModal('edit-modal'); 
    syncCaseDelta(c);
    if (typeof render === 'function') render();
    lastCroppedBase64 = ''; 
    showToast("Account Updated ✅"); 
}


function deleteCustUI(id) { 
    askConfirm("Move this entire account to Recycle Bin?", () => { 
        let cIndex = db.findIndex(x => x.id === id);
        if (cIndex > -1) {
            let c = db[cIndex];
            let tr = getTrash();
            if (!tr.cases) tr.cases = []; 
            let nowStr = getISTDate() + " " + new Date().toLocaleTimeString('en-US', {hour12: true, hour: "numeric", minute: "numeric"});
            let deletedRecord = { ...c, deletedAt: nowStr, deletedBy: deviceStaffName };
            tr.cases.push(deletedRecord);
            db.splice(cIndex, 1);
            
            let tombstone = {
                id: id,
                deletedAt: Date.now(),
                deletedBy: deviceStaffName
            };
            
            deleteCaseDelta(id, tombstone, tr);
            if (typeof render === 'function') render();
            showToast("Account Moved to Recycle Bin! 🗑️"); 
        }
    }); 
}

function deleteHistoryUI(custId, originalIndex) { 
    askConfirm("Move this entry to Recycle Bin?", () => { 
        let c = db.find(x => x.id === custId); 
        let tr = getTrash();
        if (!tr.histories) tr.histories = []; 
        let nowStr = getISTDate() + " " + new Date().toLocaleTimeString('en-US', {hour12: true, hour: "numeric", minute: "numeric"});
        let deletedEntry = c.history[originalIndex];
        tr.histories.push({ ...deletedEntry, caseId: c.id, caseName: c.name, deletedAt: nowStr, deletedBy: deviceStaffName });
        c.history.splice(originalIndex, 1); 
        recalculateCase(c); 
        
        syncCaseDelta(c);
        syncTrashDelta(tr);
        if (typeof render === 'function') render(); 
        showToast("Entry Moved to Recycle Bin! 🗑️"); 
    }); 
}

function deleteSelectedHistoryUI(id) { 
    let checks = document.querySelectorAll(`.del-chk-${id}:checked`); 
    if (checks.length === 0) return toggleMultiDel(id); 
    askConfirm(`Move ${checks.length} entries to Recycle Bin?`, () => { 
        let c = db.find(x => x.id === id); 
        let tr = getTrash();
        if (!tr.histories) tr.histories = []; 
        let nowStr = getISTDate() + " " + new Date().toLocaleTimeString('en-US', {hour12: true, hour: "numeric", minute: "numeric"});
        let indices = Array.from(checks).map(ck => parseInt(ck.value)).sort((a,b) => b-a); 
        indices.forEach(idx => { 
            let deletedEntry = c.history[idx];
            tr.histories.push({ ...deletedEntry, caseId: c.id, caseName: c.name, deletedAt: nowStr, deletedBy: deviceStaffName });
            c.history.splice(idx, 1); 
        }); 
        multiDelMode[id] = false; 
        recalculateCase(c); 
        
        syncCaseDelta(c);
        syncTrashDelta(tr);
        if (typeof render === 'function') render(); 
        showToast("Selected Moved to Recycle Bin! 🗑️"); 
    }); 
}

function toggleArchiveUI(id) { 
    let c = db.find(x => x.id === id); 
    let isArchiving = !c.isArchived; 
    let msg = isArchiving ? "Move to Archive (Closed Cases)?" : "Restore to Active Cases?"; 
    askConfirm(msg, () => { 
        c.isArchived = isArchiving; 
        syncCaseDelta(c);
        if (typeof render === 'function') render();
        showToast(isArchiving ? (i18n[currentLang].archiveToast || "Archived!") : (i18n[currentLang].unarchiveToast || "Unarchived!")); 
    }); 
}

// ==========================================
// ==========================================
// 13. RECYCLE BIN / TRASH MANAGEMENT
// ==========================================

function toggleTrashMulti() {
    isTrashMulti = !isTrashMulti;
    const multiBtn = document.getElementById('btn-trash-multi');
    const trashActions = document.getElementById('trash-actions');
    if (multiBtn) multiBtn.innerText = isTrashMulti ? 'CANCEL' : 'MULTI-SELECT';
    if (trashActions) trashActions.style.display = isTrashMulti ? 'flex' : 'none';
    renderTrash();
}

function renderTrash() {
    let tr = getTrash();
    let html = '';
    let list = currentTrashTab === 'cases' ? (tr.cases || []) : (tr.histories || []);

    if (!list || list.length === 0) {
        html = `<div class="empty-list-msg trash-empty">No deleted ${currentTrashTab} found.<br><br><b>All clear! 🚀</b></div>`;
    } else {
        list.forEach((item, i) => {
            let chkHtml = isTrashMulti ? `<input type="checkbox" class="trash-chk" value="${i}">` : '';
            let title = currentTrashTab === 'cases' ? `Case: ${item.name} (₹${item.principal})` : `Entry: ₹${item.paid} from ${item.caseName || 'Unknown'}`;
            let dateInfo = currentTrashTab === 'cases' ? `Case Given: ${formatDateDisplay(item.startDate)}` : `Paid Date: ${formatDateDisplay(item.date)}`;

            html += `
            <div class="trash-list-item">
                ${chkHtml}
                <div class="trash-info-box">
                    <b class="trash-title">${title}</b>
                    <span class="trash-date">${dateInfo}</span>
                    <div class="trash-meta-badge">
                        <span>🗑️ Deleted by: ${item.deletedBy || 'Staff'} on ${item.deletedAt || '-'}</span>
                    </div>
                </div>
                ${!isTrashMulti ? `
                <div class="trash-actions-col">
                    <button onclick="restoreTrashItem(${i})" class="trash-btn restore-btn" title="Restore">🔄</button>
                    <button onclick="deleteTrashItem(${i})" class="trash-btn delete-btn" title="Permanent Delete">✖</button>
                </div>
                ` : ''}
            </div>`;
        });
    }
    const container = document.getElementById('trash-list-container');
    if (container) container.innerHTML = html;
}

function restoreTrashItem(idx) {
    askConfirm("Restore this item back to your Active Records?", () => {
        processTrashAction('restore', [idx]);
    });
}

function deleteTrashItem(idx) {
    askConfirm("Permanently Clear this item from log? Cannot be undone.", () => {
        processTrashAction('delete', [idx]);
    });
}

function executeTrashAction(action) {
    let checks = document.querySelectorAll('.trash-chk:checked');
    if (checks.length === 0) return showToast("Select items first!");
    let msg = action === 'restore' ? `Restore ${checks.length} items?` : `Permanently Delete ${checks.length} items?`;
    askConfirm(msg, () => {
        let indices = Array.from(checks).map(c => parseInt(c.value));
        processTrashAction(action, indices);
    });
}

function processTrashAction(action, indices) {
    let tr = getTrash();
    indices.sort((a, b) => b - a);

    indices.forEach(idx => {
        if (currentTrashTab === 'cases') {
            if (!tr.cases) return;
            let item = tr.cases[idx];
            if (!item) return;

            if (action === 'restore') {
                delete item.deletedAt;
                delete item.deletedBy;
                db.push(item);

                // Unblock tombstone for cloud sync
                if (item.id && localTombstones[item.id]) {
                    delete localTombstones[item.id];
                    saveLocalTombstones();
                }
                syncCaseDelta(item);
            }
            tr.cases.splice(idx, 1);
        } else {
            if (!tr.histories) return;
            let item = tr.histories[idx];
            if (!item) return;

            if (action === 'restore') {
                let targetCase = db.find(x => x.id === item.caseId && x.type !== 'config' && x.type !== 'trash');
                if (targetCase) {
                    delete item.deletedAt;
                    delete item.deletedBy;
                    delete item.caseId;
                    delete item.caseName;
                    if (!targetCase.history) targetCase.history = [];
                    targetCase.history.push(item);
                    if (typeof recalculateCase === 'function') recalculateCase(targetCase);
                    syncCaseDelta(targetCase);
                } else {
                    showToast(`Skipped! Customer Case "${item.caseName || 'Account'}" not found. Restore case first.`);
                    return;
                }
            }
            tr.histories.splice(idx, 1);
        }
    });

    syncTrashDelta(tr);
    isTrashMulti = false;

    const multiBtn = document.getElementById('btn-trash-multi');
    if (multiBtn) multiBtn.innerText = 'MULTI-SELECT';
    const trashActions = document.getElementById('trash-actions');
    if (trashActions) trashActions.style.display = 'none';

    if (typeof render === 'function') render();
    renderTrash();
    showToast(action === 'restore' ? "Restored Successfully! 🔄" : "Permanently Deleted! 🗑️");
}

// ==========================================
// 14. RENDERING / DASHBOARD / CUSTOMER CARDS
// ==========================================
function render() {
    if (currentTab === 'stats') { renderStats(); return; }
    const dash = document.getElementById('dashboard'); 
    dash.innerHTML = '';
    let sName = document.getElementById('search-box').value.toLowerCase().trim();
    let fType = document.getElementById('filter-box').value;
    let sortType = document.getElementById('sort-box').value;
    let tP = 0, tB = 0, tC = 0;
    let searchCasesCount = 0, searchTotalValue = 0, searchTotalBal = 0, searchTotalRec = 0;
    let searchTotalKishat = 0, searchTotalProfit = 0, searchTotalExpectedInterest = 0; 
    let showSearchStat = false;
    let today = getISTDate();
    let pureDB = db.filter(x => x.type !== 'config' && x.type !== 'trash');
    let mappedDB = pureDB.map((c, idx) => ({...c, originalSNo: idx + 1}));
    let sortedDB = mappedDB.sort((a, b) => { 
        let getDate = (c) => (c.isArchived && c.history && c.history.length > 0) ? c.history.reduce((max, h) => h.date > max ? h.date : max, c.history[0].date) : c.startDate; 
        let dateA = getDate(a); 
        let dateB = getDate(b); 
        if (dateA === dateB) return sortType === 'new' ? b.id - a.id : a.id - b.id; 
        return sortType === 'new' ? (dateB > dateA ? 1 : -1) : (dateA > dateB ? 1 : -1); 
    });
    
    const accountsHtmlArray = [];
    const t = i18n[currentLang]; 
    
    sortedDB.forEach(c => {
        if (!isOwnerMode && c.isPersonal) return;
        if (!isOwnerMode && (c.staffRef || '').trim().toLowerCase() !== deviceStaffName.toLowerCase()) return;
        if (fType === 'archived') { 
            if (!c.isArchived) return; 
        } else { 
            if (c.isArchived) return; 
            if (fType !== 'all' && c.type !== fType) return; 
        }
        tP += c.principal; 
        tB += c.currentBalance; 
        tC++;
        
        let nameMatch = c.name.toLowerCase().includes(sName);
        let refMatch = (currentTab === 'dash' && isOwnerMode && sName !== '') && (c.staffRef || '').toLowerCase().includes(sName);
        if (!nameMatch && !refMatch) return;
        if (currentTab === 'dash' && sName === '') return;
        
        if (refMatch) { 
            showSearchStat = true; 
            searchCasesCount++; 
            let activePrin = (c.type === 'monthly' || c.type === 'meter') ? c.currentBalance : c.principal;
            searchTotalValue += activePrin; 
            searchTotalBal += c.currentBalance; 
            let paid = c.history ? c.history.reduce((sum, h) => sum + parseFloat(h.paid), 0) : 0; 
            searchTotalRec += paid; 
            if (c.type === 'daily') { 
                searchTotalKishat += (c.installment || 0); 
                let totalP = (c.totalPayable || c.principal) - c.principal; 
                let ratio = totalP / (c.totalPayable || c.principal); 
                searchTotalProfit += (c.installment * ratio); 
            } else if (c.type === 'monthly' || c.type === 'meter') { 
                let interest = (activePrin * (c.rate || 0) / 100); 
                searchTotalKishat += interest; 
                searchTotalProfit += interest; 
            } 
        }

        let isDueToday = false, isPending = false, pendingDays = 0;
        let todayDateObj = new Date(today);
        let totalPaid = c.history ? c.history.reduce((sum, h) => sum + parseFloat(h.paid), 0) : 0; 

        if (c.type === 'monthly' || c.type === 'meter') { 
            let isMeter = c.type === 'meter'; 
            let unitInt = c.principal * (c.rate || 0) / 100; 
            let unitsPaid = unitInt > 0 ? Math.floor(totalPaid / unitInt) : (c.history ? c.history.length : 0); 
            let nextDueDate = new Date(c.startDate); 
            if (isMeter) { 
                nextDueDate.setDate(nextDueDate.getDate() + unitsPaid); 
                if (todayDateObj >= nextDueDate && c.currentBalance > 0) { 
                    isPending = true; 
                    isDueToday = true; 
                    pendingDays = Math.floor((todayDateObj.getTime() - nextDueDate.getTime()) / (1000 * 60 * 60 * 24)) + 1; 
                } 
            } else { 
                                    // Monthly pending calculation ke liye safe date logic
                    let monthsToAdd = unitsPaid + 1;
                    let expectedMonth = (nextDueDate.getMonth() + monthsToAdd) % 12;
                    nextDueDate.setMonth(nextDueDate.getMonth() + monthsToAdd);
                    if (nextDueDate.getMonth() !== expectedMonth) {
                        nextDueDate.setDate(0);
                    }

                if (todayDateObj >= nextDueDate && c.currentBalance > 0) { 
                    isPending = true; 
                    isDueToday = true; 
                    pendingDays = Math.floor((todayDateObj.getTime() - nextDueDate.getTime()) / (1000 * 60 * 60 * 24)); 
                } 
            } 
        } else { 
            let elapsedDays = Math.floor((todayDateObj.getTime() - new Date(c.startDate).getTime()) / (1000 * 60 * 60 * 24));
            if (elapsedDays <= 0) {
                isDueToday = false;
                isPending = false;
                pendingDays = 0;
            } else {
                let expectedCollection = elapsedDays * (c.installment || 0);
                let missingAmount = expectedCollection - totalPaid;
                let paidToday = c.history ? c.history.some(h => h.date === today) : false;
                
                if (c.currentBalance > 0) {
                    if (!paidToday) isDueToday = true;
                    if (missingAmount > 0) {
                        isPending = true;
                        pendingDays = Math.ceil(missingAmount / (c.installment || 1));
                    }
                }
            }
        }
        if (c.isArchived) { isDueToday = false; isPending = false; pendingDays = 0; }
        
        let missedDatesHtml = '';
        if (c.type === 'daily' && isPending && c.currentBalance > 0) {
            let mDates = [];
            let tempDate = new Date(c.startDate);
            tempDate.setDate(tempDate.getDate() + 1);
            
            while (tempDate <= todayDateObj) {
                let y = tempDate.getFullYear();
                let m = String(tempDate.getMonth() + 1).padStart(2, '0');
                let d = String(tempDate.getDate()).padStart(2, '0');
                let chkDate = `${y}-${m}-${d}`;
                
                let paidOnDate = c.history ? c.history.some(h => h.date === chkDate) : false;
                if (!paidOnDate) {
                    mDates.push(formatDateDisplay(chkDate));
                }
                tempDate.setDate(tempDate.getDate() + 1);
            }
            
            if (mDates.length > 0) {
                let displayDates = mDates.slice(0, 10).join(', ');
                let extraTxt = mDates.length > 10 ? ` ...aur ${mDates.length - 10} din baaki` : '';
                missedDatesHtml = `<div class="missed-dates-box"><b>⚠️ Missed Dates:</b><br>${displayDates}${extraTxt}</div>`;
            }
        }

        let histData = c.history ? [...c.history] : [], hideSNo = false;
        if (!isOwnerMode && (c.type === 'monthly' || c.type === 'meter')) { 
            hideSNo = true; 
            if (histData.length > 1) { 
                let currentMonthStr = today.substring(0, 7); 
                let activeMonthRecords = histData.filter(h => h.date.substring(0, 7) === currentMonthStr); 
                histData = activeMonthRecords.length > 0 ? activeMonthRecords : histData.slice(-1); 
            } 
        }
        
        let histHtml = histData.reverse().map((h) => { 
            let origIdx = c.history.indexOf(h); 
            let actHtml = multiDelMode[c.id] ? `<input type="checkbox" class="del-chk-${c.id}" value="${origIdx}" onclick="handleMultiSelectCheck(event, ${c.id})" style="width:16px;height:16px;accent-color:var(--accent-orange); cursor:pointer;">` : `<span onclick="deleteHistoryUI(${c.id}, ${origIdx})" style="color:var(--text-muted);font-size:14px; cursor:pointer;">🗑️</span>`; 
            return hideSNo ? `<tr><td style="color:var(--text-muted)">${formatDateDisplay(h.date)}</td><td style="color:var(--success)">₹${h.paid}</td><td>₹${Number(h.balance||0).toFixed(0)}</td><td>${actHtml}</td></tr>` : `<tr><td>${origIdx + 1}</td><td style="color:var(--text-muted)">${formatDateDisplay(h.date)}</td><td style="color:var(--success)">₹${h.paid}</td><td>₹${Number(h.balance||0).toFixed(0)}</td><td>${actHtml}</td></tr>`; 
        }).join('');

        let pendingText = pendingDays > 0 ? ` ${pendingDays} Day${pendingDays > 1 ? 's' : ''}` : '';
        let statusClass = c.isArchived ? "status-closed" : (isPending && c.currentBalance > 0 ? "status-pending" : "status-active");
        let statusLabel = c.isArchived ? "Closed" : (isPending && c.currentBalance > 0 ? `Pending${pendingText}` : "Active");
        const statusHtml = `<span class="status-txt ${statusClass}"><span class="status-dot"></span> ${statusLabel}</span>`;
        const avatarHtml = c.photo ? `<img src="${c.photo}" class="cust-avatar" onclick="event.stopPropagation(); openPhotoZoom('${c.photo}')">` : `<div class="cust-avatar" style="display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.05); color:var(--text-muted); font-size:20px;">👤</div>`;
        let balClass = c.isArchived ? "bal-closed" : (isPending && c.currentBalance > 0 ? "bal-pending" : "bal-active");

        accountsHtmlArray.push(`
        <div class="cust-card glass-card" ${isOwnerMode && c.isPersonal ? 'data-personal="true"' : ''}>
            ${isDueToday && c.currentBalance > 0 ? '<div class="due-indicator">Due Today</div>' : ''}
            <div onclick="toggleView(${c.id})" class="clickable-area">
                <div class="card-top-row">
                    <div class="pill-tag">${c.type.toUpperCase()} | S.No: ${c.originalSNo}${hideSNo ? '' : ' | Kishat: ' + (c.history?c.history.length:0)}</div>
                    ${statusHtml}
                </div>
                <div class="card-header">
                    <div class="card-header-left">
                        ${avatarHtml}
                        <div class="card-name-box">
<div class="c-name">${c.name} ${c.staffRef?`<span class="ref-tag">[Ref: ${c.staffRef}]</span>`:''} ${(isOwnerMode && c.isPersonal)?'<span class="crown-icon">👑</span>':''}</div>
${c.mobile ? `<div class="c-sub" style="margin-top: 3px; font-size: 11px; color: #3A3B3C; font-weight: bold;">📱 ${c.mobile}</div>` : ''}
${c.address ? `<div class="c-sub" style="margin-top: 3px; font-size: 11px; white-space: normal;">🏠 ${c.address}</div>` : ''}
<div class="c-sub" style="margin-top: 6px;">${t.caseDate || 'Case Date'}: ${formatDateDisplay(c.startDate)}</div>
${c.idProof ? `<div class="c-sub" style="margin-top: 3px; font-size: 11px; font-weight: bold; color: var(--owner-gold);">🪪 ${c.idProof}</div>` : ''}


                        </div>
                    </div>
                    <div class="card-header-right">
                        <div class="c-bal ${balClass}">₹${c.currentBalance.toFixed(0)}</div>
                        <div class="c-sub c-sub-right">Balance</div>
                    </div>
                </div>
            </div>
            <div id="view-${c.id}" class="card-expanded-view" style="display:${openViews[c.id]?'block':'none'}">
                <div class="card-stats-box">
                    <div class="stat-col-left">
                        <span class="stat-label">${c.type==='daily' ? t.returnAmt : 'Original (Mool)'}</span><br>
                        <b class="stat-val">₹${c.type==='daily'?(c.totalPayable||c.principal):c.principal}</b>
                    </div>
                    ${(isOwnerMode || c.type === 'daily') ? `
                    <div class="stat-col-center">
                        <span class="stat-label">${t.totalPaid}</span><br>
                        <b class="stat-val stat-success">₹${totalPaid}</b>
                    </div>
                    ` : ''}
                    <div class="stat-col-right">
                        <span class="stat-label">${t.remainingAcc}</span><br>
                        <b class="stat-val ${c.currentBalance <= 0 ? 'stat-success' : 'stat-danger'}">${c.currentBalance <= 0 ? (t.caseClosedText || 'Case Closed ✅') : '₹' + c.currentBalance.toFixed(0)}</b>
                    </div>
                </div>
                ${missedDatesHtml}
                <div class="history-header">
                    <span class="history-title">${t.payHistory}</span>
                    <div class="history-actions">
                        ${multiDelMode[c.id] ? `<button onclick="deleteSelectedHistoryUI(${c.id})" class="btn-danger-small">DELETE ALL</button>` : ''}
                        <button onclick="toggleMultiDel(${c.id})" class="btn-secondary-small">${multiDelMode[c.id]?'CANCEL':'MULTI-SELECT'}</button>
                    </div>
                </div>
                <table class="view-table">
                    <thead>${hideSNo ? '<tr><th>Date</th><th>Paid</th><th>Bal</th><th>X</th></tr>' : '<tr><th>S.No</th><th>Date</th><th>Paid</th><th>Bal</th><th>X</th></tr>'}</thead>
                    <tbody>${histHtml || '<tr><td colspan="5" class="empty-row">No records</td></tr>'}</tbody>
                </table>
            </div>
            <div class="btn-row card-actions-row">
                <button class="s-btn btn-icon" onclick="openEditModal(${c.id})">✏️</button>
                ${isOwnerMode ? `<button class="s-btn btn-icon" onclick="generateCustomerPDF(${c.id})">📄</button>` : ''}
                ${isOwnerMode ? `<button class="s-btn btn-icon" onclick="shareCustomerPortal(${c.id})" style="color:#25D366; font-size:16px;">🔗</button>` : ''}


                <button class="s-btn btn-icon" onclick="toggleArchiveUI(${c.id})">${c.isArchived?'📤':'📦'}</button>
                <button class="s-btn btn-icon btn-danger-txt" onclick="deleteCustUI(${c.id})">🗑️</button>
                <button class="s-btn collect" onclick="${currentTab==='bulk'?'openBulkModal':'openPayModal'}(${c.id})">${currentTab==='bulk'?'⚡ Bulk':i18n[currentLang].recBtn||'Receive'}</button>
            </div>
        </div>`);
    });
        
    let finalHtml = ""; 
    if (currentTab === 'dash' && sName === '') { 
        finalHtml = `<div class="empty-dash-card">
            <div class="empty-icon">✨</div>
            <div class="empty-title">${t.cleanDashTitle}</div>
            <div class="empty-desc">${t.cleanDashSub}</div>
        </div>`; 
    } else {
        if (currentTab === 'dash' && isOwnerMode && showSearchStat && sName !== '') { 
            let collectionLabel = (fType === 'monthly') ? t.refStatInterest : (fType === 'meter' ? t.refStatInterest.replace('Monthly', 'Daily') : t.refStatCollection); 
            searchTotalExpectedInterest = searchTotalBal + searchTotalRec - searchTotalValue;
            
            finalHtml += `<div class="search-stat-card">
                <div class="ss-header">
                    <span class="ss-title">${t.refStatTitle}</span>
                    <span class="ss-query">${sName.toUpperCase()}</span>
                </div>
                <div class="ss-grid">
                    <div class="ss-item"><label>${t.refStatCases}</label><value>${searchCasesCount}</value></div>
                    <div class="ss-item"><label>${t.refStatValue}</label><value>₹${searchTotalValue.toLocaleString()}</value></div>
                    ${searchTotalExpectedInterest > 0 ? `<div class="ss-item ss-full"><label class="text-gold">Total Expected Interest</label><value class="text-gold">+ ₹${searchTotalExpectedInterest.toLocaleString()}</value></div>` : ''}
                    <div class="ss-item"><label>${t.refStatRec}</label><value class="text-success">₹${searchTotalRec.toLocaleString()}</value></div>
                    <div class="ss-item"><label>${t.refStatOut}</label><value class="text-danger">₹${searchTotalBal.toLocaleString()}</value></div>
                    ${fType !== 'all' ? `
                        <div class="ss-item ss-border"><label>${collectionLabel}</label><value class="text-accent">₹${searchTotalKishat.toFixed(0).toLocaleString()}</value></div>
                        <div class="ss-item ss-border"><label>${t.refStatProfit}</label><value class="text-gold">₹${searchTotalProfit.toFixed(0).toLocaleString()}</value></div>
                    ` : ''}
                </div>
            </div>`; 
        }
        finalHtml += accountsHtmlArray.join('');
    }
    document.getElementById('dashboard').innerHTML = finalHtml;
    document.getElementById('sum-cases').innerText = tC; 
    document.getElementById('sum-principal').innerText = '₹' + tP.toLocaleString(); 
    document.getElementById('sum-balance').innerText = '₹' + tB.toLocaleString();
}

// ==========================================
// 15. SEARCH / FILTER / SORT
// ==========================================
window.currentRecognition = null; 

function startVoiceSearch(targetId) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast("Voice search is not supported in your browser.");
        return;
    }

    if (window.currentRecognition) {
        try { window.currentRecognition.abort(); } catch(e) {}
    }

    const recognition = new SpeechRecognition();
    window.currentRecognition = recognition; 

    recognition.lang = 'en-IN'; 
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    try {
        recognition.start();
        showToast("Listening... 🎤 Speak now");
    } catch(e) {
        console.log("Mic already started");
    }

    recognition.onresult = function(event) {
        let speechResult = event.results[0][0].transcript;
        speechResult = speechResult.replace(/[.,]/g, "").trim(); 
        const targetInput = document.getElementById(targetId);
        if (targetInput) {
            targetInput.value = speechResult; 
            if (targetId === 'search-box') {
                render();
                showToast("Searching for: " + speechResult);
            } else if (targetId === 'rep-search') {
                showToast("Added: " + speechResult);
            }
        }
    };

    recognition.onspeechend = function() {
        recognition.stop();
    };

    recognition.onerror = function(event) {
        console.error("Microphone error:", event.error);
        if (event.error === 'not-allowed') {
            showToast("Mic blocked! Please click the lock icon in address bar to allow.");
        } else if (event.error === 'no-speech') {
            showToast("No speech detected.");
        } else {
            showToast("Mic error: " + event.error);
        }
    };

    recognition.onend = function() {
        window.currentRecognition = null; 
    };
}

// ==========================================
// 16. REPORTS / ANALYTICS / STATISTICS
// ==========================================
function renderStats() {
    let mPrin = 0, dPrin = 0, meterPrin = 0, totalPrin = 0, totalBal = 0, totalRecovered = 0, globalInvested = 0, globalProfit = 0; 
    
    db.filter(x => x.type !== 'config' && x.type !== 'trash').forEach(c => {
        if (!isOwnerMode && (c.isPersonal || (c.staffRef || '').trim().toLowerCase() !== deviceStaffName.toLowerCase())) return;
        
        if (!c.isArchived) { 
            let activePrin = c.currentBalance; 
            totalPrin += activePrin; 
            totalBal += c.currentBalance; 
            if (c.type === 'monthly') mPrin += activePrin; 
            else if (c.type === 'meter') meterPrin += activePrin; 
            else dPrin += activePrin; 
        }
        
        if (c.history) c.history.forEach(h => { totalRecovered += parseFloat(h.paid); });
        
        if (isOwnerMode) { 
            globalInvested += c.principal; 
            let tBal = (c.type === 'monthly' || c.type === 'meter') ? c.principal : (c.totalPayable || c.principal); 
            let cRatio = (c.type === 'daily') ? Math.max(0, ((c.totalPayable || c.principal) - c.principal) / (c.totalPayable || c.principal)) : 0; 
            if (c.type === 'monthly') globalProfit += (c.principal * (c.rate || 0) / 100); 
            if (c.history) { 
                [...c.history].sort((a,b) => (a.date > b.date ? 1 : -1)).forEach(h => { 
                    let paid = parseFloat(h.paid); 
                    if (c.type === 'monthly' || c.type === 'meter') { globalProfit += paid; } 
                    else { globalProfit += (paid * cRatio); tBal -= paid; } 
                }); 
            } 
        }
    });

    if (isOwnerMode) { 
        document.getElementById('owner-invested').innerText = '₹' + globalInvested.toLocaleString(undefined, {maximumFractionDigits:0}); 
        document.getElementById('owner-profit').innerText = '₹' + globalProfit.toLocaleString(undefined, {maximumFractionDigits:0}); 
    }
    
    document.getElementById('bar-m-prin').style.width = (totalPrin ? (mPrin/totalPrin)*100 : 33) + '%'; 
    document.getElementById('bar-d-prin').style.width = (totalPrin ? (dPrin/totalPrin)*100 : 33) + '%'; 
    document.getElementById('bar-meter-prin').style.width = (totalPrin ? (meterPrin/totalPrin)*100 : 34) + '%'; 
    
    document.getElementById('txt-m-prin').innerText = `${i18n[currentLang].monthly}: ₹${mPrin.toLocaleString(undefined, {maximumFractionDigits:0})}`; 
    document.getElementById('txt-d-prin').innerText = `${i18n[currentLang].daily}: ₹${dPrin.toLocaleString(undefined, {maximumFractionDigits:0})}`; 
    document.getElementById('txt-meter-prin').innerText = `${i18n[currentLang].meter}: ₹${meterPrin.toLocaleString(undefined, {maximumFractionDigits:0})}`; 
    
    document.getElementById('txt-recovered').innerText = `${i18n[currentLang].recovered}: ₹${totalRecovered.toLocaleString(undefined, {maximumFractionDigits:0})}`; 
    document.getElementById('txt-remaining').innerText = `${i18n[currentLang].remaining}: ₹${totalBal.toLocaleString(undefined, {maximumFractionDigits:0})}`;
}

function generateCustomerPDF(id) {
    const { jsPDF } = window.jspdf;
    const c = db.find(x => x.id === id);
    if (!c) return;
    const doc = new jsPDF();
    doc.setFontSize(22); doc.setTextColor(255, 107, 53); doc.text("Credix.", 14, 20);
    doc.setFontSize(10); doc.setTextColor(100); doc.text("Statement of Account", 14, 28);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 140, 28);
    doc.setDrawColor(200); doc.line(14, 32, 196, 32);
    doc.setFontSize(12); doc.setTextColor(0); doc.text(`Customer Name: ${c.name}`, 14, 42);
    doc.text(`Account Type: ${c.type.toUpperCase()}`, 14, 48); doc.text(`${i18n[currentLang].caseDate || 'Case Date'}: ${formatDateDisplay(c.startDate)}`, 14, 54);
    let principalLabel = c.type === 'daily' ? 'Total Return Value' : 'Principal Amount';
    let principalValue = c.type === 'daily' ? (c.totalPayable || c.principal) : c.principal;
    doc.text(`${principalLabel}: RS. ${principalValue.toLocaleString()}`, 120, 42);
    doc.text(`Current Balance: RS. ${c.currentBalance.toFixed(0).toLocaleString()}`, 120, 48);
    if (c.staffRef) doc.text(`Ref: ${c.staffRef}`, 120, 54);
    const tableData = []; let totalPaid = 0;
    if (c.history) {
        c.history.forEach((h, index) => {
            tableData.push([index + 1, formatDateDisplay(h.date), `RS. ${h.paid.toLocaleString()}`, `RS. ${Number(h.balance||0).toFixed(0).toLocaleString()}`]);
            totalPaid += parseFloat(h.paid);
        });
    }
    doc.autoTable({
        startY: 65, head: [['S.No', 'Date', 'Paid Amount', 'Remaining Balance']], body: tableData, theme: 'striped',
        headStyles: { fillColor: [26, 28, 35], textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [245, 245, 245] }
    });
    const finalY = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(12); doc.setFont(undefined, 'bold');
    doc.text(`Total Amount Paid: RS. ${totalPaid.toLocaleString()}`, 14, finalY);
    doc.setTextColor(255, 59, 107); doc.text(`Net Outstanding: RS. ${c.currentBalance.toFixed(0).toLocaleString()}`, 14, finalY + 7);
    doc.save(`${c.name}_Report.pdf`);
    showToast("PDF Downloaded!");
}

function generateReport() {
    const start = document.getElementById('rep-start').value;
    const end = document.getElementById('rep-end').value;
    const type = document.getElementById('rep-type').value;
    const searchQ = document.getElementById('rep-search').value.toLowerCase().trim();
    const t = i18n[currentLang];
    if (!start || !end) return showToast("Select both dates!");
    let totalGiven = 0, totalReturned = 0, totalProfitInRange = 0; 
    let newCasesDaily = [], newCasesMonthly = [], newCasesMeter = [];
    let paymentsDaily = [], paymentsMonthly = [], paymentsMeter = [];
    let pendingsInRange = [];
    let closedCasesInRange = [];
    const rangeEndStr = end;
    
    db.filter(x => x.type !== 'config' && x.type !== 'trash').forEach(c => {
        if (!isOwnerMode && c.isPersonal) return;
        if (!isOwnerMode && (c.staffRef || '').trim().toLowerCase() !== deviceStaffName.toLowerCase()) return;
        if (searchQ !== '') { let cName = (c.name || '').toLowerCase(); let sRef = (c.staffRef || '').toLowerCase(); if (!cName.includes(searchQ) && !sRef.includes(searchQ)) return; }
        if (type !== 'all' && c.type !== type) return;
        
        if (c.startDate >= start && c.startDate <= end) {
            let cCopy = {...c};
            let actualCashGiven = c.principal;

            if (c.type === 'monthly') {
                let upfrontProfit = c.principal * ((c.rate || 0) / 100);
                actualCashGiven = c.principal - upfrontProfit; 
                if (isOwnerMode) {
                    totalProfitInRange += upfrontProfit;
                    cCopy.tempUpfrontProfit = upfrontProfit;
                }
                newCasesMonthly.push(cCopy);
            } else if (c.type === 'daily') {
                newCasesDaily.push(cCopy);
            } else if (c.type === 'meter') {
                newCasesMeter.push(cCopy);
            }

            cCopy.actualCashGiven = actualCashGiven; 
            totalGiven += actualCashGiven; 
        }
        
        let customerTotalInRange = 0, customerProfitInRange = 0, histHits = [];
        let tempBalForRec = (c.type === 'monthly' || c.type === 'meter') ? c.principal : (c.totalPayable || c.principal);
        let cRatio = (c.type === 'daily') ? Math.max(0, ((c.totalPayable || c.principal) - c.principal) / (c.totalPayable || c.principal)) : 0;
        
        if (c.history) {
            let sortedHist = [...c.history].sort((a, b) => (a.date > b.date ? 1 : -1));
            sortedHist.forEach(h => {
                let paid = parseFloat(h.paid); let profitFromThisPayment = 0;
                if (c.type === 'monthly' || c.type === 'meter') { profitFromThisPayment = paid; }
                else { profitFromThisPayment = paid * cRatio; tempBalForRec -= paid; }
                if (h.date >= start && h.date <= end) { customerTotalInRange += paid; totalReturned += paid; customerProfitInRange += profitFromThisPayment; totalProfitInRange += profitFromThisPayment; histHits.push({ date: h.date, amt: paid, profit: profitFromThisPayment }); }
            });
        }
        
        if (customerTotalInRange > 0) {
            let pData = { name: c.name, total: customerTotalInRange, profit: customerProfitInRange, count: histHits.length, type: c.type, installment: c.installment, rate: c.rate, hits: histHits };
            if (c.type === 'daily') paymentsDaily.push(pData); else if (c.type === 'monthly') paymentsMonthly.push(pData); else if (c.type === 'meter') paymentsMeter.push(pData);
        }
        
        if (!c.isArchived && c.currentBalance > 0) {
            let missedDates = [], accumulatedTotal = 0, amountPerUnit = 0;
            const toLocalYMD = (d) => { let y = d.getFullYear(); let m = String(d.getMonth() + 1).padStart(2, '0'); let day = String(d.getDate()).padStart(2, '0'); return `${y}-${m}-${day}`; };
            let historyUpToEnd = c.history ? c.history.filter(h => h.date <= rangeEndStr) : [];
            let missingDateStrings = []; 

            if (c.type === 'daily') {
                amountPerUnit = c.installment || 0;
                let [sy, sm, sd] = c.startDate.split('-').map(Number);
                let iterDate = new Date(sy, sm - 1, sd); 
                iterDate.setDate(iterDate.getDate() + 1); 
                while (toLocalYMD(iterDate) <= rangeEndStr) {
                    let currentCheckStr = toLocalYMD(iterDate);
                    if (!historyUpToEnd.some(h => h.date === currentCheckStr)) { 
                        accumulatedTotal += amountPerUnit; 
                        missedDates.push(String(iterDate.getDate()).padStart(2,'0') + "/" + String(iterDate.getMonth()+1).padStart(2,'0')); 
                        missingDateStrings.push(currentCheckStr);
                    }
                    iterDate.setDate(iterDate.getDate() + 1);
                }
            } else if (c.type === 'meter') {
                amountPerUnit = c.principal * (c.rate || 0) / 100;
                let [sy, sm, sd] = c.startDate.split('-').map(Number);
                let totalPaidUpToEnd = historyUpToEnd.reduce((sum, h) => sum + parseFloat(h.paid), 0);
                let daysPaid = amountPerUnit > 0 ? Math.floor(totalPaidUpToEnd / amountPerUnit) : historyUpToEnd.length;
                
                let iterDate = new Date(sy, sm - 1, sd);
                iterDate.setDate(iterDate.getDate() + daysPaid); 
                
                while (toLocalYMD(iterDate) <= rangeEndStr) {
                    let currentCheckStr = toLocalYMD(iterDate);
                    accumulatedTotal += amountPerUnit; 
                    missedDates.push(String(iterDate.getDate()).padStart(2,'0') + "/" + String(iterDate.getMonth()+1).padStart(2,'0')); 
                    missingDateStrings.push(currentCheckStr);
                    iterDate.setDate(iterDate.getDate() + 1);
                }
            } else if (c.type === 'monthly') {
                amountPerUnit = c.principal * (c.rate || 0) / 100;
                let [sy, sm, sd] = c.startDate.split('-').map(Number);
                let totalPaidUpToEnd = historyUpToEnd.reduce((sum, h) => sum + parseFloat(h.paid), 0);
                let monthsPaid = amountPerUnit > 0 ? Math.floor(totalPaidUpToEnd / amountPerUnit) : historyUpToEnd.length;
                
                let cycle = 1;
                while (true) {
                    let nextDue = new Date(sy, (sm - 1) + cycle, sd);
                    if (nextDue.getDate() !== sd) nextDue = new Date(sy, (sm - 1) + cycle + 1, 0);
                    let nextDueStr = toLocalYMD(nextDue);
                    if (nextDueStr > rangeEndStr) break; 
                    
                    if (cycle > monthsPaid) {
                        accumulatedTotal += amountPerUnit; 
                        missedDates.push(String(nextDue.getDate()).padStart(2,'0') + "/" + String(nextDue.getMonth()+1).padStart(2,'0')); 
                        missingDateStrings.push(nextDueStr);
                    }
                    cycle++;
                }
            }
            if (missedDates.length > 0) { 
                pendingsInRange.push({ 
                    ...c, 
                    accumulatedTotal: accumulatedTotal, 
                    missedDatesStr: missedDates.join(", "),
                    firstMissed: missingDateStrings.length > 0 ? missingDateStrings[0] : '',
                    lastMissed: missingDateStrings.length > 0 ? missingDateStrings[missingDateStrings.length - 1] : ''
                });
            }
        }

        if (c.isArchived) {
            let closeDate = c.startDate;
            let closingAmt = 0;
            if (c.history && c.history.length > 0) {
                let sortedHist = [...c.history].sort((a, b) => (a.date > b.date ? 1 : -1));
                let lastRec = sortedHist[sortedHist.length - 1];
                closeDate = lastRec.date;
                closingAmt = parseFloat(lastRec.paid);
            }
            if (closeDate >= start && closeDate <= end) {
                closedCasesInRange.push({ 
                    ...c, 
                    closedDate: closeDate, 
                    closingAmount: closingAmt,
                    recoveredInRange: customerTotalInRange, 
                    profitInRange: customerProfitInRange, 
                    hitsCount: histHits.length 
                });
            }
        }
    });
    
    lastGeneratedReportData = { start, end, type, totalGiven, totalReturned, newCasesDaily, newCasesMonthly, newCasesMeter, paymentsDaily, paymentsMonthly, paymentsMeter, pendingsInRange, closedCasesInRange };
    document.getElementById('rep-given').innerText = '₹' + totalGiven.toLocaleString();
    document.getElementById('rep-ret').innerText = '₹' + totalReturned.toLocaleString();
    
    if (isOwnerMode) { 
        document.getElementById('rep-profit-container').style.removeProperty('display'); 
        document.getElementById('rep-profit').innerText = '₹' + totalProfitInRange.toLocaleString(undefined, {maximumFractionDigits:0}); 
        document.getElementById('btn-rep-pdf').style.removeProperty('display'); 
        
        if (!document.getElementById('btn-staff-pdf')) {
            let btn = document.createElement('button');
            btn.id = 'btn-staff-pdf';
            btn.className = 'main-btn';
            btn.style.marginTop = '10px';
            btn.style.marginBottom = '20px';
            btn.style.background = '#2563eb'; 
            btn.style.boxShadow = '0 5px 15px rgba(37, 99, 235, 0.4)';
            btn.style.color = 'white';
            btn.innerText = 'Download Staff Report PDF 📊';
            btn.onclick = downloadStaffPDF;
            document.getElementById('btn-rep-pdf').parentNode.insertBefore(btn, document.getElementById('btn-rep-pdf').nextSibling);
        }
        if (document.getElementById('btn-staff-pdf')) document.getElementById('btn-staff-pdf').style.removeProperty('display');
    } else { 
        document.getElementById('rep-profit-container').style.setProperty('display', 'none', 'important'); 
        document.getElementById('btn-rep-pdf').style.setProperty('display', 'none', 'important'); 
        if (document.getElementById('btn-staff-pdf')) document.getElementById('btn-staff-pdf').style.setProperty('display', 'none', 'important');
    }
    
    let reportHtml = "";
    const renderCases = (list, title, color) => {
        if (list.length === 0) return "";
        let html = `<div style="color:${color}; font-size:11px; margin:15px 0 5px; font-weight:700; text-transform:uppercase;">${title}</div>`;
        let sectionTotal = 0;
        list.forEach(c => { 
            let amtToDisplay = c.principal; 
            sectionTotal += amtToDisplay;
            html += `<div class="pending-card" style="--theme-color: ${color};">
                <div class="pc-row">
                    <div class="pc-left">
                        <div class="pc-name-wrapper">
                            ${c.photo ? `<img src="${c.photo}" onclick="openPhotoZoom('${c.photo}')" class="pc-photo">` : ''}
                            <div class="pc-name-box">
                                <b class="pc-name">${c.name}</b>
                                <span class="pc-sub">${t.givenOn} ${formatDateDisplay(c.startDate)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="pc-right">
                        <b class="pc-amt" style="color:${color};">₹${amtToDisplay.toLocaleString()}</b>
                        ${(isOwnerMode && c.tempUpfrontProfit) ? `<div class="pc-profit">${t.profitCut} ₹${c.tempUpfrontProfit.toFixed(0)}</div>` : ''}
                    </div>
                </div>
            </div>`;
        });
        html += `<div style="text-align:right; color:${color}; font-size:14px; font-weight:bold; padding: 8px 5px; margin-bottom: 10px; border-top: 1px dashed rgba(255,255,255,0.1);">${t.repTotal || 'TOTAL'}: ₹${sectionTotal.toLocaleString()}</div>`;
        return html;
    };
    
    reportHtml += renderCases(newCasesDaily, t.repNewDaily, "var(--accent-orange)");
    reportHtml += renderCases(newCasesMonthly, t.repNewMonthly, "var(--owner-gold)");
    reportHtml += renderCases(newCasesMeter, t.repNewMeter, "#a855f7");
    
    const renderPayments = (list, title, color, isMonthly) => {
        if (list.length === 0) return "";
        let html = `<div style="color:${color}; font-size:11px; margin:18px 0 5px; font-weight:700; text-transform:uppercase;">${title}</div>`;
        let sectionTotal = 0;
        list.sort((a,b) => b.total - a.total).forEach(p => { 
            sectionTotal += p.total;
            let dates = p.hits.map(h => h.date).sort(); 
            let dateSummary = dates.length > 1 ? `${formatDateDisplay(dates[0])} to ${formatDateDisplay(dates[dates.length-1])}` : formatDateDisplay(dates[0]); 
            let detailStr = isMonthly ? `${t.intRec} (${p.hits.length} ${t.monthsText})` : `₹${(p.installment||0).toFixed(0)} × ${Math.round(p.total / (p.installment || 1))} ${t.kishatsText}`; 
            html += `<div class="pending-card" style="--theme-color: ${color};">
                <div class="pc-row" style="align-items: center;">
                    <div class="pc-left">
                        <b class="pc-name">${p.name}</b>
                        <span class="pc-sub">${dateSummary}</span>
                    </div>
                    <div class="pc-right">
                        <div style="font-weight:bold; color:${color}; font-size:14px;">+ ₹${p.total.toLocaleString()}</div>
                    </div>
                </div>
                <div class="pc-payment-details">
                    <span class="pc-detail-text">${detailStr}</span>
                    ${isOwnerMode ? `<span class="pc-profit-text">${t.profitText} ₹${p.profit.toFixed(0)}</span>` : ''}
                </div>
            </div>`;
        });
        html += `<div style="text-align:right; color:${color}; font-size:14px; font-weight:bold; padding: 8px 5px; margin-bottom: 10px; border-top: 1px dashed rgba(255,255,255,0.1);">${t.repTotal || 'TOTAL'}: ₹${sectionTotal.toLocaleString()}</div>`;
        return html;
    };
    
    reportHtml += renderPayments(paymentsDaily, t.repRecDaily, "var(--success)", false);
    reportHtml += renderPayments(paymentsMonthly, t.repRecMonthly, "var(--owner-gold)", true);
    reportHtml += renderPayments(paymentsMeter, t.repRecMeter, document.querySelector('[data-theme="matte"]') ? "#D4A017" : "#a855f7", false);

    const renderPendings = (list, title, color, bgColor) => {
        if (list.length === 0) return "";
        let html = `<div style="color:${color}; font-size:11px; margin:18px 0 5px; font-weight:700; text-transform:uppercase;">${title}</div>`;
        let sectionTotal = 0;
        list.forEach(p => {
            sectionTotal += p.accumulatedTotal;
            let count = p.missedDatesStr.split(',').length;
            let perUnit = p.type === 'daily' ? (p.installment || 0) : (p.principal * (p.rate || 0) / 100);
            let calcNote = `${count} × ₹${perUnit.toFixed(0)}`;
            let typeTranslated = p.type === 'daily' ? t.fDaily : (p.type === 'monthly' ? t.fMonthly : t.fMeter);
            
            let clickAction = "";
            let badgeText = "RECEIVE";
            
            if (count > 1 && (p.type === 'daily' || p.type === 'meter')) {
                clickAction = `openBulkModal(${p.id}, '${p.firstMissed}', '${p.lastMissed}')`;
                badgeText = "BULK RECEIVE ⚡";
            } else {
                clickAction = `openPayModal(${p.id}, ${p.accumulatedTotal})`;
            }

            html += `<div onclick="${clickAction}" class="pending-card" style="--theme-color: ${color}; --theme-bg: ${bgColor};">
                <div class="pc-row">
                    <div class="pc-left">
                        <b class="pc-name">${p.name}</b>
                        <span class="pc-basis">${typeTranslated.toUpperCase()} ${t.basisText}</span><br>
                        <span class="pc-missed">${t.missedText} ${p.missedDatesStr} <b class="pc-note">(${calcNote})</b></span>
                    </div>
                    <div class="pc-right">
                        <b class="pc-amt" style="color: ${color};">₹${p.accumulatedTotal.toFixed(0)}</b><br>
                        <span class="pc-badge">${badgeText}</span>
                    </div>
                </div>
            </div>`;
        });
        html += `<div style="text-align:right; color:${color}; font-size:14px; font-weight:bold; padding: 8px 5px; margin-bottom: 10px; border-top: 1px dashed rgba(255,255,255,0.1);">${t.repTotal || 'TOTAL'}: ₹${sectionTotal.toFixed(0).toLocaleString()}</div>`;
        return html;
    };
    
    if (pendingsInRange.length > 0) {
        let pendingDaily = pendingsInRange.filter(p => p.type === 'daily');
        let pendingMonthly = pendingsInRange.filter(p => p.type === 'monthly');
        let pendingMeter = pendingsInRange.filter(p => p.type === 'meter');

        var alertRed = "#DC3545";
        var alertBg = "rgba(220, 53, 69, 0.05)";

        reportHtml += renderPendings(pendingDaily, t.repPendDaily, alertRed, alertBg);
        reportHtml += renderPendings(pendingMonthly, t.repPendMonthly, alertRed, alertBg);
        reportHtml += renderPendings(pendingMeter, t.repPendMeter, alertRed, alertBg);
    }

    const renderClosed = (list, title, color, bgColor) => {
        if (list.length === 0) return "";
        let html = `<div style="color:${color}; font-size:11px; margin:18px 0 5px; font-weight:700; text-transform:uppercase;">${title}</div>`;
        let sectionTotal = 0;
        let sectionTotalRec = 0;
        list.forEach(c => {
            sectionTotal += c.principal;
            sectionTotalRec += (c.recoveredInRange || 0);
            let typeTranslated = c.type === 'daily' ? t.fDaily : (c.type === 'monthly' ? t.fMonthly : t.fMeter);
            
            let detailStr = '';
            if (c.type === 'monthly') {
                detailStr = `${t.intRec} (${c.hitsCount} ${t.monthsText})`;
            } else {
                let perUnit = c.installment || 0;
                let regularRec = c.recoveredInRange || 0;
                let parts = [];
                
                if (c.closingAmount && c.closingAmount !== perUnit && c.closingAmount > 0) {
                    regularRec -= c.closingAmount;
                    parts.push(`₹${c.closingAmount.toFixed(0)} (Advance/Final)`);
                }
                if (regularRec > 0 && perUnit > 0) {
                    let eqDays = Math.round(regularRec / perUnit);
                    parts.push(`₹${perUnit.toFixed(0)} × ${eqDays} ${t.kishatsText}`);
                } else if (regularRec > 0) {
                    parts.push(`₹${regularRec.toFixed(0)}`);
                }
                
                if (parts.length > 0) {
                    detailStr = parts.join(" & ");
                } else if (c.recoveredInRange > 0) {
                    detailStr = `₹${(c.recoveredInRange).toFixed(0)} Lump Sum`;
                } else {
                    detailStr = `No recovery in selected dates`;
                }
            }

            html += `<div class="pending-card" style="--theme-color: ${color}; --theme-bg: ${bgColor};">
                <div class="pc-row">
                    <div class="pc-left">
                        <b class="pc-name">${c.name}</b>
                        <span class="pc-basis" style="color:${color};">${typeTranslated.toUpperCase()}</span><br>
                        <span class="pc-sub">Closed On: <b class="pc-note">${formatDateDisplay(c.closedDate)}</b></span>
                    </div>
                    <div class="pc-right">
                        <b class="pc-amt" style="color:${color};">₹${c.principal.toLocaleString()}</b><br>
                        <span class="pc-sub">Principal</span>
                    </div>
                </div>
                <div class="pc-closed-footer">
                    <div class="pc-closed-stat">
                        <span class="pc-sub">Recovered (In Range):</span>
                        <span class="pc-white-text">${detailStr}</span>
                    </div>
                    <div class="pc-closed-stat right-align">
                        <span class="pc-success-text">+ ₹${(c.recoveredInRange || 0).toLocaleString()}</span>
                        ${isOwnerMode ? `<span class="pc-profit-text">PROFIT: ₹${(c.profitInRange || 0).toFixed(0)}</span>` : ''}
                    </div>
                </div>
            </div>`;
        });
        html += `<div style="text-align:right; color:${color}; font-size:13px; font-weight:bold; padding: 8px 5px; margin-bottom: 10px; border-top: 1px dashed rgba(255,255,255,0.1);">
            TOTAL RECOVERED: <span style="color:var(--success);">₹${sectionTotalRec.toLocaleString()}</span><br>
            TOTAL PRINCIPAL: ₹${sectionTotal.toLocaleString()}
        </div>`;
        return html;
    };

    if (closedCasesInRange.length > 0) {
        reportHtml += renderClosed(closedCasesInRange, "📦 ARCHIVED (CLOSED) CASES SETTLED", "#8A8D98", "rgba(255, 255, 255, 0.05)");
    }
    
    if (reportHtml === "") { 
        reportHtml = `<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:12px; border:1px dashed rgba(255,255,255,0.1); border-radius:12px; margin-top:15px;">No activity found in selected date range.</div>`; 
    }
    document.getElementById('rep-list').innerHTML = reportHtml; 
    document.getElementById('rep-results').style.display = 'block'; 
    document.getElementById('rep-list').scrollTop = 0;
}

function downloadReportPDF() {
    if (!lastGeneratedReportData) return showToast("Generate report first!");
    try {
        const { jsPDF } = window.jspdf; 
        const doc = new jsPDF(); 
        const data = lastGeneratedReportData; 
        const marginX = 14; 
        let currentY = 20;
        
        doc.setFontSize(24); doc.setTextColor(255, 107, 53); doc.text("Credix.", marginX, currentY);
        doc.setFontSize(10); doc.setTextColor(100); doc.text(`Business Activity Statement`, marginX, currentY + 8);
        doc.text(`Period: ${formatDateDisplay(data.start)} to ${formatDateDisplay(data.end)}`, 140, currentY + 8);
        currentY += 14; doc.setDrawColor(220); doc.line(marginX, currentY, 196, currentY); currentY += 10;
        doc.setFontSize(12); doc.setTextColor(0); doc.setFont(undefined, 'bold'); doc.text("Financial Summary", marginX, currentY); currentY += 6;
        doc.autoTable({ startY: currentY, head: [['Description', 'Total Amount (INR)']], body: [['Total Capital Given (New Cases)', `RS. ${Number(data.totalGiven).toLocaleString()}`], ['Total Cash Recovered (Recoveries)', `RS. ${Number(data.totalReturned).toLocaleString()}`]], theme: 'grid', styles: { fontSize: 10 }, headStyles: { fillColor: [50, 50, 50] } });
        currentY = doc.lastAutoTable.finalY + 15;

        const renderNewCases = (list, title, color, typeLabel) => {
            if (list.length === 0) return;
            if (currentY > 250) { doc.addPage(); currentY = 20; }
            doc.setFontSize(11); doc.setTextColor(color[0], color[1], color[2]); doc.text(title, marginX, currentY);
            let totalValue = 0;
            let body = list.map((c, i) => { 
                let amtToDisplay = Number(c.actualCashGiven || c.principal || 0); 
                totalValue += amtToDisplay; 
                return [i + 1, c.name, formatDateDisplay(c.startDate), typeLabel, `RS. ${amtToDisplay.toLocaleString()}`]; 
            });
            doc.autoTable({ startY: currentY + 4, head: [['S.No', 'Customer Name', 'Date Given', 'Case Type', 'Principal Amount']], body: body, foot: [['', '', '', 'TOTAL NEW CAPITAL', `RS. ${totalValue.toLocaleString()}`]], theme: 'striped', headStyles: { fillColor: color }, footStyles: { fillColor: color, textColor: [255, 255, 255] } });
            currentY = doc.lastAutoTable.finalY + 12;
        };

        renderNewCases(data.newCasesDaily, "NEW PORTFOLIO ADDITIONS (DAILY)", [255, 107, 53], "DAILY");
        renderNewCases(data.newCasesMonthly, "NEW PORTFOLIO ADDITIONS (MONTHLY)", [184, 134, 11], "MONTHLY");
        renderNewCases(data.newCasesMeter, "NEW PORTFOLIO ADDITIONS (METER)", [168, 85, 247], "METER");

        if (data.paymentsDaily.length > 0) { 
            if (currentY > 250) { doc.addPage(); currentY = 20; } 
            doc.setFontSize(11); doc.setTextColor(40, 167, 69); doc.text("DAILY RECOVERY LOG (KISHATS)", marginX, currentY); 
            let totalDaily = 0; 
            let dailyTableBody = data.paymentsDaily.map((p, i) => { 
                let dates = p.hits.map(h => h.date).sort(); 
                let summary = dates.length > 1 ? `${formatDateDisplay(dates[0])} to ${formatDateDisplay(dates[dates.length-1])}` : formatDateDisplay(dates[0]); 
                totalDaily += Number(p.total || 0); 
                return [i + 1, p.name, summary, (p.type || 'DAILY').toUpperCase(), `RS. ${Number(p.total).toLocaleString()}`]; 
            }); 
            doc.autoTable({ startY: currentY + 4, head: [['S.No', 'Customer Name', 'Date Range', 'Basis', 'Total Received']], body: dailyTableBody, foot: [['', '', '', 'TOTAL DAILY RECOVERY', `RS. ${totalDaily.toLocaleString()}`]], theme: 'striped', headStyles: { fillColor: [40, 167, 69] }, footStyles: { fillColor: [40, 167, 69], textColor: [255, 255, 255] } }); 
            currentY = doc.lastAutoTable.finalY + 12; 
        }
        if (data.paymentsMeter.length > 0) { 
            if (currentY > 250) { doc.addPage(); currentY = 20; } 
            doc.setFontSize(11); doc.setTextColor(168, 85, 247); doc.text("METER RECOVERY LOG", marginX, currentY); 
            let totalMeter = 0; 
            let meterTableBody = data.paymentsMeter.map((p, i) => { 
                let dates = p.hits.map(h => h.date).sort(); 
                let summary = dates.length > 1 ? `${formatDateDisplay(dates[0])} to ${formatDateDisplay(dates[dates.length-1])}` : formatDateDisplay(dates[0]); 
                totalMeter += Number(p.total || 0); 
                return [i + 1, p.name, summary, (p.type || 'METER').toUpperCase(), `RS. ${Number(p.total).toLocaleString()}`]; 
            }); 
            doc.autoTable({ startY: currentY + 4, head: [['S.No', 'Customer Name', 'Date Range', 'Basis', 'Total Received']], body: meterTableBody, foot: [['', '', '', 'TOTAL METER RECOVERY', `RS. ${totalMeter.toLocaleString()}`]], theme: 'striped', headStyles: { fillColor: [168, 85, 247] }, footStyles: { fillColor: [168, 85, 247], textColor: [255, 255, 255] } }); 
            currentY = doc.lastAutoTable.finalY + 12; 
        }
        if (data.paymentsMonthly.length > 0) { 
            if (currentY > 250) { doc.addPage(); currentY = 20; } 
            doc.setFontSize(11); doc.setTextColor(212, 175, 55); doc.text("MONTHLY INTEREST LOG (VYAJ)", marginX, currentY); 
            let totalMonthly = 0; 
            let sortedMonthlyPayments = [...data.paymentsMonthly].sort((a, b) => { 
                let dateA = a.hits && a.hits.length > 0 ? a.hits.map(h => h.date).sort()[0] : '9999-99-99'; 
                let dateB = b.hits && b.hits.length > 0 ? b.hits.map(h => h.date).sort()[0] : '9999-99-99'; 
                return (dateA > dateB ? 1 : -1); 
            }); 
            let monthlyTableBody = sortedMonthlyPayments.map((p, i) => { 
                let dates = p.hits.map(h => formatDateDisplay(h.date)).sort().join(", "); 
                totalMonthly += Number(p.total || 0); 
                return [i + 1, p.name, dates, `RS. ${Number(p.total).toLocaleString()}`]; 
            }); 
            doc.autoTable({ startY: currentY + 4, head: [['S.No', 'Customer Name', 'Payment Specific Dates', 'Total Interest']], body: monthlyTableBody, foot: [['', '', 'TOTAL MONTHLY INTEREST', `RS. ${totalMonthly.toLocaleString()}`]], theme: 'striped', headStyles: { fillColor: [184, 134, 11] }, footStyles: { fillColor: [184, 134, 11], textColor: [255, 255, 255] } }); 
            currentY = doc.lastAutoTable.finalY + 12; 
        }

        const renderPendings = (list, title, color) => {
            if (list.length === 0) return;
            if (currentY > 250) { doc.addPage(); currentY = 20; }
            doc.setFontSize(11); doc.setTextColor(color[0], color[1], color[2]); doc.text(title, marginX, currentY);
            let totalPending = 0;
            let body = list.map((p, i) => { totalPending += Number(p.accumulatedTotal || 0); return [i + 1, p.name, p.type.toUpperCase(), p.missedDatesStr, `RS. ${Number(p.accumulatedTotal).toFixed(0).toLocaleString()}`]; });
            doc.autoTable({ startY: currentY + 4, head: [['S.No', 'Customer Name', 'Basis', 'Missed Dates', 'Pending Amount']], body: body, foot: [['', '', '', 'TOTAL PENDING', `RS. ${totalPending.toFixed(0).toLocaleString()}`]], theme: 'striped', headStyles: { fillColor: color }, footStyles: { fillColor: color, textColor: [255, 255, 255] } });
            currentY = doc.lastAutoTable.finalY + 12;
        };

        if (data.pendingsInRange && data.pendingsInRange.length > 0) {
            renderPendings(data.pendingsInRange.filter(p => p.type === 'daily'), "PENDING COLLECTIONS (DAILY)", [255, 59, 107]);
            renderPendings(data.pendingsInRange.filter(p => p.type === 'monthly'), "PENDING COLLECTIONS (MONTHLY)", [61, 169, 252]);
            renderPendings(data.pendingsInRange.filter(p => p.type === 'meter'), "PENDING COLLECTIONS (METER)", [192, 132, 252]);
        }

        const renderClosedPdf = (list, title, color) => {
            if (list.length === 0) return;
            if (currentY > 250) { doc.addPage(); currentY = 20; }
            doc.setFontSize(11); doc.setTextColor(color[0], color[1], color[2]); doc.text(title, marginX, currentY);
            let totalVal = 0;
            let totalRec = 0;
            let body = list.map((c, i) => { 
                totalVal += Number(c.principal || 0); 
                totalRec += Number(c.recoveredInRange || 0);
                
                let detailStr = '';
                if (c.type === 'monthly') {
                    detailStr = `${c.hitsCount} Months`;
                } else {
                    let perUnit = c.installment || 0;
                    let regularRec = c.recoveredInRange || 0;
                    let parts = [];
                    
                    if (c.closingAmount && c.closingAmount !== perUnit && c.closingAmount > 0) {
                        regularRec -= c.closingAmount;
                        parts.push(`RS. ${c.closingAmount.toFixed(0)} (Final)`);
                    }
                    if (regularRec > 0 && perUnit > 0) {
                        let eqDays = Math.round(regularRec / perUnit);
                        parts.push(`${eqDays} Kishats`);
                    }
                    
                    detailStr = parts.length > 0 ? parts.join(" + ") : `Lump Sum`;
                }
                
                return [i + 1, c.name, c.type.toUpperCase(), formatDateDisplay(c.closedDate), `RS. ${Number(c.recoveredInRange || 0).toLocaleString()} (${detailStr})`, `RS. ${Number(c.principal).toLocaleString()}`]; 
            });
            doc.autoTable({ startY: currentY + 4, head: [['S.No', 'Customer Name', 'Case Type', 'Closed On', 'Received (In Range)', 'Principal Settled']], body: body, foot: [['', '', '', 'TOTAL:', `RS. ${totalRec.toLocaleString()}`, `RS. ${totalVal.toLocaleString()}`]], theme: 'striped', headStyles: { fillColor: color }, footStyles: { fillColor: color, textColor: [255, 255, 255] } });
            currentY = doc.lastAutoTable.finalY + 12;
        };

        if (data.closedCasesInRange && data.closedCasesInRange.length > 0) {
            renderClosedPdf(data.closedCasesInRange, "ARCHIVED (CLOSED) CASES SETTLED", [138, 141, 152]);
        }

        if (currentY > 270) { doc.addPage(); currentY = 20; } 
        doc.setFontSize(9); doc.setTextColor(150); doc.setFont(undefined, 'italic'); 
        doc.text("End of Professional Business Report. Generated by Credix Premium.", marginX, currentY + 10); 
        doc.save(`Credix_Business_Report_${data.start}_to_${data.end}.pdf`); 
        showToast("Professional PDF Downloaded!");
    } catch (err) { 
        console.error(err); 
        showToast("Error generating PDF. Try again."); 
    }
}

window.downloadStaffPDF = function() {
    if (!lastGeneratedReportData) return showToast("Generate report first!");
    try {
        const { jsPDF } = window.jspdf;
        const docPdf = new jsPDF();
        const data = lastGeneratedReportData;
        const marginX = 14;
        let currentY = 20;

        let searchEl = document.getElementById('rep-search');
        let searchVal = searchEl ? searchEl.value.trim() : "";
        let staffName = searchVal ? searchVal.toUpperCase() : "ALL STAFF";

        docPdf.setFontSize(22);
        docPdf.setTextColor(21, 101, 192);
        docPdf.setFont(undefined, 'bold');
        docPdf.text(`${staffName} - BUSINESS REPORT`, marginX, currentY);

        docPdf.setFontSize(10);
        docPdf.setTextColor(100);
        docPdf.text(`Period: ${formatDateDisplay(data.start)} to ${formatDateDisplay(data.end)}`, 130, currentY);
        currentY += 10;

        const getStatus = (cust) => {
            if (!cust || !cust.name) return 'New';
            let isOld = db.some(x => (x.name || "").toLowerCase().trim() === cust.name.toLowerCase().trim() && x.id < cust.id);
            return isOld ? 'Old' : 'New';
        };

        if (data.newCasesDaily && data.newCasesDaily.length > 0) {
            docPdf.setFontSize(14);
            docPdf.setTextColor(255, 255, 255);
            docPdf.setFillColor(21, 101, 192);
            docPdf.rect(marginX, currentY, 182, 8, 'F');
            docPdf.text(`DAILY BASIS CASES`, marginX + 5, currentY + 6);
            currentY += 12;

            let tPrin = 0;
            let dailyBody = data.newCasesDaily.map((c, i) => {
                let pAmt = Number(c.principal || 0); 
                tPrin += pAmt;
                let totPay = Number(c.totalPayable || c.principal || 0);
                let days = c.installment ? Math.round(totPay / c.installment) : 0;
                let ed = calculateEndDate(c.startDate, days);

                return [
                    i+1, c.name || "-", formatDateDisplay(c.startDate), ed, days, 'Daily',
                    getStatus(c), `RS.${pAmt.toLocaleString()}`
                ];
            });

            docPdf.autoTable({
                startY: currentY,
                head: [['S.No', 'Customer Name', 'Start Date', 'End Date', 'Days', 'Type', 'Status', 'Amount']],
                body: dailyBody,
                foot: [['', '', '', '', '', '', 'TOTAL:', `RS.${tPrin.toLocaleString()}`]],
                theme: 'grid',
                headStyles: { fillColor: [30, 136, 229] },
                footStyles: { fillColor: [227, 242, 253], textColor: [0,0,0], fontStyle: 'bold' },
                styles: { fontSize: 8, cellPadding: 2 },
                didParseCell: function(hookData) {
                    if (hookData.section === 'body' && hookData.column.index === 6) {
                        if (hookData.cell.raw === 'New') hookData.cell.styles.textColor = [46, 125, 50]; 
                        if (hookData.cell.raw === 'Old') hookData.cell.styles.textColor = [198, 40, 40]; 
                    }
                }
            });
            currentY = docPdf.lastAutoTable.finalY + 15;
        }

        if (data.newCasesMonthly && data.newCasesMonthly.length > 0) {
            if (currentY > 250) { docPdf.addPage(); currentY = 20; }
            docPdf.setFontSize(14);
            docPdf.setTextColor(255, 255, 255);
            docPdf.setFillColor(21, 101, 192);
            docPdf.rect(marginX, currentY, 182, 8, 'F');
            docPdf.text(`MONTHLY CASES HISAAB`, marginX + 5, currentY + 6);
            currentY += 12;

            let tPrinM = 0;
            let monthlyBody = data.newCasesMonthly.map((c, i) => {
                let pAmt = Number(c.principal || 0); 
                tPrinM += pAmt;
                return [
                    i+1, c.name || "-", formatDateDisplay(c.startDate), 'Monthly', getStatus(c), `RS.${pAmt.toLocaleString()}`
                ];
            });

            docPdf.autoTable({
                startY: currentY,
                head: [['S.No', 'Customer Name', 'Start Date', 'Type', 'Status', 'Amount']],
                body: monthlyBody,
                foot: [['', '', '', '', 'TOTAL:', `RS.${tPrinM.toLocaleString()}`]],
                theme: 'grid',
                headStyles: { fillColor: [30, 136, 229] },
                footStyles: { fillColor: [227, 242, 253], textColor: [0,0,0], fontStyle: 'bold' },
                styles: { fontSize: 9, cellPadding: 3 },
                didParseCell: function(hookData) {
                    if (hookData.section === 'body' && hookData.column.index === 4) {
                        if (hookData.cell.raw === 'New') hookData.cell.styles.textColor = [46, 125, 50]; 
                        if (hookData.cell.raw === 'Old') hookData.cell.styles.textColor = [198, 40, 40]; 
                    }
                }
            });
            currentY = docPdf.lastAutoTable.finalY + 15;
        }
        
        if (data.newCasesMeter && data.newCasesMeter.length > 0) {
            if (currentY > 250) { docPdf.addPage(); currentY = 20; }
            docPdf.setFontSize(14);
            docPdf.setTextColor(255, 255, 255);
            docPdf.setFillColor(21, 101, 192);
            docPdf.rect(marginX, currentY, 182, 8, 'F');
            docPdf.text(`METER BASIS CASES`, marginX + 5, currentY + 6);
            currentY += 12;

            let tPrinMeter = 0;
            let meterBody = data.newCasesMeter.map((c, i) => {
                let pAmt = Number(c.principal || 0); 
                tPrinMeter += pAmt;
                return [
                    i+1, c.name || "-", formatDateDisplay(c.startDate), 'Meter', getStatus(c), `RS.${pAmt.toLocaleString()}`
                ];
            });

            docPdf.autoTable({
                startY: currentY,
                head: [['S.No', 'Customer Name', 'Start Date', 'Type', 'Status', 'Amount']],
                body: meterBody,
                foot: [['', '', '', '', 'TOTAL:', `RS.${tPrinMeter.toLocaleString()}`]],
                theme: 'grid',
                headStyles: { fillColor: [30, 136, 229] },
                footStyles: { fillColor: [227, 242, 253], textColor: [0,0,0], fontStyle: 'bold' },
                styles: { fontSize: 9, cellPadding: 3 },
                didParseCell: function(hookData) {
                    if (hookData.section === 'body' && hookData.column.index === 4) {
                        if (hookData.cell.raw === 'New') hookData.cell.styles.textColor = [46, 125, 50]; 
                        if (hookData.cell.raw === 'Old') hookData.cell.styles.textColor = [198, 40, 40]; 
                    }
                }
            });
            currentY = docPdf.lastAutoTable.finalY + 15;
        }

        docPdf.save(`Staff_Report_${staffName.replace(/ /g, '_')}_${data.start}_to_${data.end}.pdf`);
        showToast("Staff Report Downloaded!");
    } catch (err) {
        console.error(err);
        showToast("Error generating Staff PDF");
    }
};

// ==========================================
// 17. TABS / MODALS / UI CONTROLS & BACKGROUND
// ==========================================
document.addEventListener("visibilitychange", function() {
    if (document.hidden) {
        console.log("App is in background. Going offline...");
        if (typeof firebase !== 'undefined' && firebase.database) {
            firebase.database().goOffline();
        }
        if (window.currentRecognition) {
            try {
                window.currentRecognition.stop();
            } catch(e) {}
        }
    } else {
        console.log("App is active. Going online...");
        if (typeof firebase !== 'undefined' && firebase.database) {
            firebase.database().goOnline();
        }
    }
});

// ==========================================
// 18. LANGUAGE / TRANSLATIONS
// ==========================================
// Handled in Part 1 & dynamically referenced via i18n dictionary object.

// ==========================================
// 19. PHOTO / CROPPER / FILE HANDLING
// ==========================================
// Handled in Part 1 image processing modules (toSquareBase64, toBase64, CropperJS wrappers).

// ==========================================
// 20. AI SMART ASSISTANT & CHAT ENGINE
// ==========================================
const COMMAND_INTENTS = {
    pending: ["pending", "due", "baki", "overdue", "unpaid", "late", "/pending", "/due", "पेंडिंग", "बाकी", "डियू", "kis kis", "leni"],
    collection: ["collection", "recovery", "payment", "jama", "received", "/collection", "कलेक्शन", "जमा", "रिकवरी", "पेमेंट", "ayi"],
    customer_name: ["balance", "history", "profile", "account", "status", "detail", "/balance", "/customer", "बैलेंस", "डिटेल", "खाता"],
    report: ["report", "summary", "sabka", "/report", "@today", "रिपोर्ट"],
    daily_list: ["daily", "डेली", "rozana", "/daily"],
    monthly_list: ["monthly", "मंथली", "mahina", "/monthly", "vyaj"],
    meter_list: ["meter", "मीटर", "/meter"],
    whatsapp: ["whatsapp", "send", "व्हाट्सएप", "भेजो"]
};

setInterval(() => {
    const aiBtn = document.getElementById('ai-chat-btn');
    const lockScreen = document.getElementById('lock-screen');
    if (aiBtn && lockScreen) {
        if (lockScreen.style.display !== 'none') {
            aiBtn.style.display = 'none'; 
        } else {
            aiBtn.style.display = 'block'; 
        }
    }
}, 500);

function toggleAIChat() {
    const chatWindow = document.getElementById('ai-chat-window');
    if (!chatWindow) return;
    if (chatWindow.style.display === 'none' || chatWindow.style.display === '') {
        chatWindow.style.display = 'flex';
        const msgBox = document.getElementById('ai-chat-messages');
        if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;
    } else {
        chatWindow.style.display = 'none';
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    }
}

function appendMessage(text, sender) {
    const msgContainer = document.getElementById('ai-chat-messages');
    if (!msgContainer) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = sender === 'user' ? 'user-msg' : 'ai-msg';
    
    const textDiv = document.createElement('div');
    textDiv.innerText = text;
    msgDiv.appendChild(textDiv);
    
    const timeDiv = document.createElement('div');
    const now = new Date();
    timeDiv.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    timeDiv.style.fontSize = "10px";
    timeDiv.style.opacity = "0.6";
    timeDiv.style.marginTop = "4px";
    timeDiv.style.textAlign = sender === 'user' ? "right" : "left";
    msgDiv.appendChild(timeDiv);

    msgContainer.appendChild(msgDiv);
    msgContainer.scrollTop = msgContainer.scrollHeight;
}

function detectIntent(text) {
    const lowerText = text.toLowerCase().trim();
    
    for (const [intent, keywords] of Object.entries(COMMAND_INTENTS)) {
        if (keywords.some(kw => lowerText.includes(kw.toLowerCase()))) {
            return intent; 
        }
    }

    if (typeof db !== 'undefined' && db.length > 0) {
        let hasName = db.some(c => {
            if (!c.name || c.type === 'config' || c.type === 'trash' || c.isArchived || c.currentBalance <= 0) return false;
            let cNameParts = c.name.toLowerCase().split(/\s+/);
            return cNameParts.some(part => part.length > 2 && lowerText.includes(part));
        });
        if (hasName) return 'customer_name';
    }
    return 'unknown';
}

function isLocalQuery(text) {
    return detectIntent(text) !== 'unknown';
}

async function sendAIMessage(isVoice = false) {
    const inputEl = document.getElementById('ai-chat-input');
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;
    
    appendMessage(text, 'user');
    inputEl.value = '';
    
    const typingId = "typing-" + Date.now();
    const msgContainer = document.getElementById('ai-chat-messages');
    
    const typingDiv = document.createElement('div');
    typingDiv.className = 'ai-msg'; 
    typingDiv.id = typingId;
    typingDiv.innerText = "Data check kar raha hoon... 🕵️‍♂️";
    if (msgContainer) {
        msgContainer.appendChild(typingDiv);
        msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    try {
        let aiData = db; 
        
        if (document.getElementById(typingId)) document.getElementById(typingId).remove();
        let localReply = "";
        const query = text.toLowerCase();
        
        const activeLoans = aiData.filter(c => c.type !== 'config' && c.type !== 'trash' && !c.isArchived && c.currentBalance > 0 && (isOwnerMode || (!c.isPersonal && (c.staffRef || '').trim().toLowerCase() === deviceStaffName.toLowerCase())));

        const getPendingData = (c) => {
            const todayStr = getISTDate();
            let accumulatedTotal = 0;
            let missingDateStrings = [];
            let historyUpToEnd = c.history ? c.history.filter(h => h.date <= todayStr) : [];
            let amountPerUnit = 0;

            const toLocalYMD = (d) => { 
                let y = d.getFullYear(); 
                let m = String(d.getMonth() + 1).padStart(2, '0'); 
                let day = String(d.getDate()).padStart(2, '0'); 
                return `${y}-${m}-${day}`; 
            };

            if (c.type === 'daily') {
                amountPerUnit = c.installment || 0;
                let parts = c.startDate.split('-');
                let sy = parseInt(parts[0]), sm = parseInt(parts[1]), sd = parseInt(parts[2]);
                let iterDate = new Date(sy, sm - 1, sd); 
                iterDate.setDate(iterDate.getDate() + 1); 
                while (toLocalYMD(iterDate) <= todayStr) {
                    let currentCheckStr = toLocalYMD(iterDate);
                    if (!historyUpToEnd.some(h => h.date === currentCheckStr)) { 
                        accumulatedTotal += amountPerUnit; 
                        missingDateStrings.push(currentCheckStr);
                    }
                    iterDate.setDate(iterDate.getDate() + 1);
                }
            } else if (c.type === 'meter') {
                amountPerUnit = c.principal * (c.rate || 0) / 100;
                let parts = c.startDate.split('-');
                let sy = parseInt(parts[0]), sm = parseInt(parts[1]), sd = parseInt(parts[2]);
                let totalPaidUpToEnd = historyUpToEnd.reduce((sum, h) => sum + parseFloat(h.paid), 0);
                let daysPaid = amountPerUnit > 0 ? Math.floor(totalPaidUpToEnd / amountPerUnit) : historyUpToEnd.length;
                let iterDate = new Date(sy, sm - 1, sd);
                iterDate.setDate(iterDate.getDate() + daysPaid); 
                while (toLocalYMD(iterDate) <= todayStr) {
                    accumulatedTotal += amountPerUnit; 
                    missingDateStrings.push(toLocalYMD(iterDate));
                    iterDate.setDate(iterDate.getDate() + 1);
                }
            } else if (c.type === 'monthly') {
                amountPerUnit = c.principal * (c.rate || 0) / 100;
                let parts = c.startDate.split('-');
                let sy = parseInt(parts[0]), sm = parseInt(parts[1]), sd = parseInt(parts[2]);
                let totalPaidUpToEnd = historyUpToEnd.reduce((sum, h) => sum + parseFloat(h.paid), 0);
                let monthsPaid = amountPerUnit > 0 ? Math.floor(totalPaidUpToEnd / amountPerUnit) : historyUpToEnd.length;
                let cycle = 1;
                while (true) {
                    let nextDue = new Date(sy, (sm - 1) + cycle, sd);
                    if (nextDue.getDate() !== sd) nextDue = new Date(sy, (sm - 1) + cycle + 1, 0);
                    let nextDueStr = toLocalYMD(nextDue);
                    if (nextDueStr > todayStr) break; 
                    if (cycle > monthsPaid) {
                        accumulatedTotal += amountPerUnit; 
                        missingDateStrings.push(nextDueStr);
                    }
                    cycle++;
                }
            }

            let count = missingDateStrings.length;
            let pText = count > 0 ? `${count} due pending` : "All Clear";
            return { pAmt: accumulatedTotal, pText: pText, cType: c.type ? c.type.toUpperCase() : "N/A" };
        };

        let intent = detectIntent(text);
        
        if (intent === 'pending' || intent === 'collection') {
            let isPendingQuery = (intent === 'pending');
            let daily = { list: [], total: 0 }, monthly = { list: [], total: 0 }, meter = { list: [], total: 0 };
            let todayStr = getISTDate();
            
            let baseList = isPendingQuery ? activeLoans : aiData.filter(c => c.type !== 'config' && c.type !== 'trash' && (isOwnerMode || (!c.isPersonal && (c.staffRef || '').trim().toLowerCase() === deviceStaffName.toLowerCase())));

            baseList.forEach(c => {
                let target = c.type === 'daily' ? daily : c.type === 'monthly' ? monthly : meter;
                let val = 0;
                let extraMsg = "";
                
                if (isPendingQuery) {
                    val = getPendingData(c).pAmt;
                } else {
                    val = c.history ? c.history.filter(h => h.date === todayStr).reduce((s, h) => s + parseFloat(h.paid || 0), 0) : 0;
                    if (val > 0 && c.currentBalance <= 0) {
                        extraMsg = " (Account Closed 🟢)";
                    }
                }
                
                if (val > 0) { 
                    target.list.push(`• ${c.name}: ₹${val.toFixed(0)}${extraMsg}`); 
                    target.total += val; 
                }
            });
            
            let grandTotal = daily.total + monthly.total + meter.total;
            const build = (t, g) => (g.list.length > 0) ? `\n➖➖ **${t} (₹${g.total.toFixed(0)})** ➖➖\n${g.list.join("\n")}` : "";
            let title = isPendingQuery ? 'PENDING REPORT' : 'AAJ DI COLLECTION';
            localReply = grandTotal > 0 ? `🟢 **${title}** (Grand Total: ₹${grandTotal.toFixed(0)})\n` + build("DAILY", daily) + build("MONTHLY", monthly) + build("METER", meter) : `🟢 Koi ${isPendingQuery ? 'pending kishat' : 'collection'} nahi hai.`;
        } else if (intent === 'daily_list' || intent === 'monthly_list' || intent === 'meter_list') {
            let targetType = intent.split('_')[0]; 
            let filtered = activeLoans.filter(c => c.type === targetType);
            if (filtered.length > 0) {
                let totalVal = filtered.reduce((sum, c) => sum + c.currentBalance, 0);
                localReply = `🟢 **${targetType.toUpperCase()} CASES** (Total: ₹${totalVal.toFixed(0)})\n▬▬▬\n` + filtered.map((c, i) => `${i + 1}. **${c.name}**\n Date: ${formatDateDisplay(c.startDate)} | Bal: ₹${c.currentBalance.toFixed(0)}`).join('\n\n');
            } else localReply = `🟢 Abhi koi ${targetType.toUpperCase()} case nahi hai.`;
        } else {
            let matched = activeLoans.filter(c => c.name.toLowerCase().split(/\s+/).some(part => part.length > 2 && query.includes(part)));
            localReply = matched.length > 0 ? matched.map(c => { let d = getPendingData(c); return `🟢 **${c.name}** (${c.type.toUpperCase()})\n• Bal: ₹${c.currentBalance.toFixed(0)}\n• Pending: ₹${d.pAmt.toFixed(0)}\n• ${d.pText}`; }).join("\n\n") : "🟢 Aapke is sawal ke liye local data match nahi hua. Kripya customer ka sahi naam likhein.";
        }
        
        appendMessage(localReply, 'ai');
        if (isVoice) speakText(localReply);

    } catch (e) {
        if (document.getElementById(typingId)) document.getElementById(typingId).remove();
        appendMessage("🚨 Error reading local records.", 'ai');
    }
}

function startAIChatVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast("Voice search not supported.");
        return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; 
    
    const inputEl = document.getElementById('ai-chat-input');
    if (inputEl) inputEl.placeholder = "Sun raha hoon... Boliye 🎙️";
    
    recognition.onresult = (event) => {
        if (inputEl) inputEl.value = event.results[0][0].transcript;
        sendAIMessage(true); 
    };
    recognition.onend = () => {
        if (inputEl) inputEl.placeholder = "Poochiye (Jaise: Rahul ki det...)";
    };
    recognition.start();
}

function speakText(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        let cleanText = text.replace(/[*#_➖\-•]/g, "").replace(/₹/g, "rupees ");
        const msg = new SpeechSynthesisUtterance(cleanText);
        msg.lang = 'hi-IN';
        msg.rate = 1.0;
        window.speechSynthesis.speak(msg);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('ai-chat-input');
    if (chatInput) {
        chatInput.addEventListener("keypress", function(event) {
            if (event.key === "Enter") {
                event.preventDefault();
                sendAIMessage();
            }
        });
    }
});

const aiBtn = document.getElementById('ai-chat-btn');
let moved = false;

if (aiBtn) {
    aiBtn.addEventListener('touchmove', (e) => {
        e.preventDefault(); 
        moved = true; 
        let touch = e.touches[0];
        aiBtn.style.left = (touch.clientX - 25) + 'px';
        aiBtn.style.top = (touch.clientY - 25) + 'px';
        aiBtn.style.right = 'auto';
        aiBtn.style.bottom = 'auto';
    }, { passive: false });

    aiBtn.addEventListener('touchend', () => {
        if (!moved) toggleAIChat();
        moved = false; 
    });

    aiBtn.addEventListener('click', () => {
        if (!moved) toggleAIChat();
    });
}

// ==========================================
// NEW: CLOUDINARY UPLOAD HELPER
// ==========================================
async function uploadToCloudinary(base64Image) {
    // Agar photo nahi hai ya pehle se hi link hai, toh wahi wapas bhej do
    if (!base64Image || !base64Image.startsWith('data:image')) return base64Image; 
    
    showToast("Uploading Photo to Cloud ⏳...");
    
    // Aapka apna Cloud Name aur Preset yahan laga diya hai
    const url = `https://api.cloudinary.com/v1_1/fofcglam/image/upload`;
    const formData = new FormData();
    formData.append("file", base64Image);
    formData.append("upload_preset", "credix_images");

    try {
        const response = await fetch(url, { method: "POST", body: formData });
        const data = await response.json();
        if (data.secure_url) {
            return data.secure_url; // Cloudinary ka chota link return karega
        } else {
            console.error("Cloudinary Error:", data);
            showToast("Photo Upload Failed!");
            return "";
        }
    } catch (error) {
        console.error("Upload Error:", error);
        showToast("Network Error in Photo Upload!");
        return "";
    }
}
// ==========================================
// 🔥 SMART CUSTOMER PORTAL GENERATOR
// ==========================================
function shareCustomerPortal(id) {
    let c = db.find(x => x.id === id);
    if (!c) return;

    // Agar token nahi hai toh naya random token banayein
    if (!c.customerToken) {
        c.customerToken = "CX" + Math.random().toString(36).substr(2, 9).toUpperCase();
        syncCaseDelta(c); // Isse portal automatically Firebase mein save ho jayega
    }

    // Secure Link Banayein
    let portalLink = window.location.origin + window.location.pathname + "?customer=" + c.customerToken;

    // Message Ready karein
    let msg = `*Credix - My Account*\n\nHello ${c.name},\nAapki kishat aur payment history check karne ke liye is secure link par click karein:\n\n🔗 ${portalLink}\n\n_Note: Yeh link strictly private hai._`;

    // 🔥 NAYA MAGIC: Native Share Menu (Copy / WhatsApp / SMS sab ek jagah)
    if (navigator.share) {
        navigator.share({
            title: 'Credix Account',
            text: msg
        }).catch(err => console.log("Share cancelled"));
    } else {
        // Fallback: Agar kisi purane phone mein share menu na khule toh direct Copy ho jayega
        navigator.clipboard.writeText(msg);
        let waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        window.open(waUrl, '_blank');
        showToast("Link Copied! 📋");
    }
}

// ==========================================
// 🔥 PHASE 3: SECURE CUSTOMER PORTAL VIEW
// ==========================================
(function initCustomerPortal() {
    // 1. Check URL for Customer Token
    const urlParams = new URLSearchParams(window.location.search);
    const customerToken = urlParams.get('customer');

    if (customerToken) {
        // 2. MAGIC: Instantly hide everything else (Owner App & PIN Screen)
        const style = document.createElement('style');
        style.innerHTML = `
            body > * { display: none !important; }
            #customer-portal-root { display: block !important; background: #f4f7f6; min-height: 100vh; }
        `;
        document.head.appendChild(style);

        // 3. Create Customer Screen Container
        const root = document.createElement('div');
        root.id = 'customer-portal-root';
        root.innerHTML = `<div style="text-align:center; padding: 50px; font-family:sans-serif; color:#2c3e50;"><h2>Credix Portal</h2><p>Loading your account details... ⏳</p></div>`;
        document.body.appendChild(root);

        // 4. Fetch ONLY this customer's data from Firebase
        setTimeout(() => {
            firebase.database().ref(`customer_portal/${customerToken}`).once('value')
            .then(snapshot => {
                if (snapshot.exists()) {
                    renderVIPDashboard(snapshot.val(), root);
                } else {
                    root.innerHTML = `<div style="text-align:center; padding: 50px; font-family:sans-serif; color:red;"><h2>Link Expired or Invalid ❌</h2><p>Please contact the owner for a valid link.</p></div>`;
                }
            }).catch(err => {
                root.innerHTML = `<div style="text-align:center; padding: 50px; font-family:sans-serif;"><h2>Network Error 🌐</h2><p>Please check your internet connection.</p></div>`;
            });
        }, 1000);
    }
})();

function renderVIPDashboard(data, rootElement) {
    let totalPay = Number(data.totalPayable || data.principal || 0);
    let remaining = Number(data.currentBalance || 0);
    let paidAmount = totalPay - remaining;

    // 1. History Table Logic & Running Balance
    let historyHtml = '';
    let processedHistory = [];
    let missedDates = [];

    if (data.history && data.history.length > 0) {
        let runningBal = totalPay;
        processedHistory = data.history.map((h, index) => {
            let amt = Number(h.amount || h.paid || h.rec || h.received || h.installment || 0);
            runningBal -= amt;
            return {
                sno: index + 1,
                date: h.date,
                paid: amt,
                bal: runningBal
            };
        });
        
        // 2. Missed Dates Logic (Sunday skip karega)
        if ((data.type || '').toUpperCase().includes('DAILY')) {
            let today = new Date();
            today.setHours(0,0,0,0);
            
            let sParts = (data.startDate || '').split('/');
            if(sParts.length === 3) {
                let sDate = new Date(2000 + parseInt(sParts[2]), parseInt(sParts[1])-1, parseInt(sParts[0]));
                let historyDates = data.history.map(h => h.date);
                
                let currDate = new Date(sDate);
                while(currDate <= today) {
                    if (currDate.getDay() !== 0) { // Sunday (0) skip
                        let dStr = String(currDate.getDate()).padStart(2, '0') + '/' + 
                                   String(currDate.getMonth()+1).padStart(2, '0') + '/' + 
                                   String(currDate.getFullYear()).slice(-2);
                        if (!historyDates.includes(dStr)) {
                            missedDates.push(dStr);
                        }
                    }
                    currDate.setDate(currDate.getDate() + 1);
                }
            }
        }
    }

    // 3. Missed Dates Red Box
    let missedDatesHtml = '';
    if (missedDates.length > 0) {
        missedDatesHtml = `
            <div style="background-color: #fcebeb; border: 1.5px solid #e74c3c; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
                <div style="color: #c0392b; font-weight: bold; font-size: 14px;">⚠️ Missed Dates:</div>
                <div style="color: #c0392b; font-size: 14px; margin-top: 4px; line-height: 1.5;">
                    ${missedDates.join(', ')}
                </div>
            </div>
        `;
    }

    // 4. Table Rows
    if (processedHistory.length > 0) {
        let revHistory = [...processedHistory].reverse();
        historyHtml = revHistory.map(h => `
            <tr style="border-bottom: 1px solid #eaeaea; color: #2c3e50; font-weight:600; font-size: 14px;">
                <td style="padding: 12px 5px;">${h.sno}</td>
                <td style="padding: 12px 5px;">${h.date}</td>
                <td style="padding: 12px 5px; color:#009688;">₹${h.paid}</td>
                <td style="padding: 12px 5px; color:#2c3e50;">₹${h.bal}</td>
            </tr>
        `).join('');
    } else {
        historyHtml = `<tr><td colspan="4" style="padding: 20px; color:#7f8c8d; text-align:center;">No records</td></tr>`;
    }

    // 5. Final UI
    rootElement.innerHTML = `
        <div style="max-width: 500px; margin: 0 auto; padding: 15px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding-bottom:40px; background:#f4f7f6; min-height:100vh;">
            
            <div style="background: white; padding: 20px; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 20px; margin-top: 20px;">
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <div style="background:#f0f0f0; color:#555; padding:5px 12px; border-radius:20px; font-size:11px; font-weight:800; letter-spacing:0.5px;">
                        ${(data.type || 'DAILY').toUpperCase()}
                    </div>
                    <div style="color:#009688; font-weight:bold; font-size:13px;">● Active</div>
                </div>

                <div style="display:flex; align-items:center; margin-bottom:25px;">
                    <div style="width:55px; height:55px; background:#e0f2f1; border-radius:50%; display:flex; justify-content:center; align-items:center; font-size:24px; margin-right:15px; border:2px solid #009688;">
                        👤
                    </div>
                    <div style="flex-grow:1;">
                        <div style="font-size:20px; font-weight:bold; color:#2c3e50;">${data.name}</div>
                        <div style="font-size:12px; color:#7f8c8d; margin-top:4px; font-weight:600;">Case Date: ${data.startDate || 'N/A'}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:24px; font-weight:900; color:#009688;">₹${remaining}</div>
                        <div style="font-size:12px; color:#7f8c8d; font-weight:bold;">Balance</div>
                    </div>
                </div>

                <div style="display:flex; justify-content:space-between; background:#fbfbfb; padding: 15px; border-radius: 12px; margin-bottom: 20px; text-align:center; border: 1px solid #f0f0f0;">
                    <div>
                        <div style="font-size:12px; color:#7f8c8d; font-weight:bold; margin-bottom:5px;">Return Amt</div>
                        <div style="font-size:16px; font-weight:900; color:#2c3e50;">₹${totalPay}</div>
                    </div>
                    <div>
                        <div style="font-size:12px; color:#7f8c8d; font-weight:bold; margin-bottom:5px;">Total Paid</div>
                        <div style="font-size:16px; font-weight:900; color:#009688;">₹${paidAmount}</div>
                    </div>
                    <div>
                        <div style="font-size:12px; color:#7f8c8d; font-weight:bold; margin-bottom:5px;">Remaining</div>
                        <div style="font-size:16px; font-weight:900; color:#e74c3c;">₹${remaining}</div>
                    </div>
                </div>

                ${missedDatesHtml}
            </div>

            <div style="background: white; padding: 20px; border-radius: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                <div style="margin-bottom: 15px;">
                    <h3 style="margin: 0; color: #7f8c8d; font-size:14px; font-weight:bold;">Payment History</h3>
                </div>
                
                <div style="background: #fbfbfb; border-radius: 12px; border: 1px solid #f0f0f0; overflow:hidden;">
                    <table style="width: 100%; border-collapse: collapse; text-align: center;">
                        <tr style="border-bottom: 2px solid #eaeaea; color: #7f8c8d; font-size:12px;">
                            <th style="padding: 12px 5px;">S.NO</th>
                            <th style="padding: 12px 5px;">DATE</th>
                            <th style="padding: 12px 5px;">PAID</th>
                            <th style="padding: 12px 5px;">BAL</th>
                        </tr>
                        ${historyHtml}
                    </table>
                </div>
            </div>
            
            <div style="text-align:center; margin-top: 25px;">
                <small style="color:#bdc3c7; font-weight:bold;">Securely managed by Credix</small>
            </div>
        </div>
    `;
}

