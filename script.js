const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyw89eS_-VlsXxxdlL5su-WEkfopRxTGp3wsO6C5BZYEGo9gMW_7SYI79WauV2rBoGtXg/exec";

let db = JSON.parse(localStorage.getItem('paymitra_v11')) || [];
let pin = ""; 
let activeLoginPin = ""; // Stores PIN during active session for validation
let currentPin = localStorage.getItem('paymitra_pin') || "2525"; // Fallback
let secretPin = localStorage.getItem('paymitra_secret') || "1984"; 
let isOwnerMode = false; 
let deviceStaffName = ''; 
let currentTab = 'dash'; let openViews = {}; let multiDelMode = {}; 
let confirmActionCallback = null;
let isSaving = false;

// Helper to safely get or initialize config object for staff list
function getConfig() {
    let conf = db.find(x => x.type === 'config');
    if (!conf) {
        conf = { id: 'config_staff', type: 'config', staffList: [] };
        db.push(conf);
    }
    return conf;
}

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
        allTypes: "All Types", fDaily: "Daily", fMonthly: "Monthly", fMeter: "Meter", fArchived: "Archived (Closed)",
        optDaily: "Daily Kishat", optMonthly: "Monthly Vyaj", optMeter: "Meter (Rozana)", markPersonal: "👑 Mark as Personal Case",
        sortNew: "Latest First ▼", sortOld: "Oldest First ▲",
        delCaseMsg: "Delete this entire case?", delCaseSuccess: "Case Deleted!", editBtn: "Edit", recBtn: "Receive", bulkBtn: "⚡ Bulk",
        bulkTitle: "Bulk Entry", bulkStart: "Start Date", bulkEnd: "End Date", bulkSubmit: "Process Bulk", bulkCancel: "Cancel", perMonthAmt: "Per Month Amount (₹)", perDayAmt: "Per Day Amount (₹)",
        autoBackupLabel: "Auto Backup Data", abNever: "Never", abDaily: "Daily (On First Open)", abMonthly: "Monthly",
        repTitle: "📅 Custom Date Report", repBtn: "Generate Report", repGiven: "Total Given", repRet: "Total Recovered", repProfit: "Profit Earned", repNoData: "No activity in this date range.", repNewCases: "🆕 NEW CASES GIVEN", repPayments: "✅ PAYMENTS RECEIVED", advProfit: "Advance Profit (Cut)",
        archiveToast: "Case Archived!", unarchiveToast: "Case Restored!", staffRefPh: "Reference / Staff Name", lockSub: "Enter 4-Digit Login ID or Owner PIN"
    },
    'hi': { 
        appSub: "नमस्ते 👋", sumPrin: "कुल मूलधन", sumCases: "कुल खाते", sumOut: "बकाया", 
        addTitle: "नया खाता बनाएं", namePh: "ग्राहक का नाम", amtPh: "मूलधन (Principal)", addBtn: "खाता जोड़ें", 
        navDash: "होम", navCust: "खाते", navBulk: "फास्ट ऐड", navStats: "रिव्यू", 
        setMainTitle: "ऐप सेटिंग्स", setBackup: "डेटा बैकअप", setRestore: "डेटा रिस्टोर", setPinStaff: "स्टाफ PIN बदलें", setPinOwner: "मालिक PIN बदलें 👑", setLogout: "लॉगआउट", setClose: "बंद करें", 
        searchPh: "नाम खोजें...", cleanDashTitle: "क्लीन डैशबोर्ड", cleanDashSub: "खाता देखने के लिए ऊपर नाम खोजें।<br>पूरी लिस्ट देखने के लिए <b>खाते</b> टैब पर जाएं।", 
        bizPort: "बिजनेस पोर्टफोलियो", recStatus: "रिकवरी स्टेटस", monthly: "महीना", daily: "रोज़ाना", meter: "मीटर", recovered: "रिकवर हुआ", remaining: "बाकी", 
        ownerGrowth: "👑 प्रॉफिट एनालिटिक्स", totInvested: "कुल निवेश", netProfit: "प्राप्त प्रॉफिट", ownerNote: "यह डेटा केवल मालिक के लिए है, स्टाफ को नहीं दिखेगा।",
        refresh: "रिफ्रेश", totRetPh: "कुल वापसी रकम", totDaysPh: "कुल दिन", 
        allTypes: "सभी प्रकार", fDaily: "रोज़ाना", fMonthly: "महीना", fMeter: "मीटर", fArchived: "बंद खाते (Archived)",
        optDaily: "रोज़ की किश्त", optMonthly: "महीने का ब्याज", optMeter: "मीटर (रोज़ाना)", markPersonal: "👑 पर्सनल खाता",
        sortNew: "नया पहले ▼", sortOld: "पुराना पहले ▲",
        delCaseMsg: "क्या आप यह पूरा खाता हटाना चाहते हैं?", delCaseSuccess: "खाता हटा दिया गया!", editBtn: "एडिट", recBtn: "प्राप्त करें", bulkBtn: "⚡ बल्क",
        bulkTitle: "बल्क एंट्री", bulkStart: "शुरुआती तारीख", bulkEnd: "आखिरी तारीख", bulkSubmit: "बल्क प्रोसेस करें", bulkCancel: "रद्द करें", perMonthAmt: "हर महीने की रकम (₹)", perDayAmt: "हर दिन की रकम (₹)",
        autoBackupLabel: "ऑटो बैकअप फाइल", abNever: "कभी नहीं", abDaily: "रोज़ (ऐप खुलने पर)", abMonthly: "महीने में एक बार",
        repTitle: "📅 तारीख के अनुसार रिपोर्ट", repBtn: "रिपोर्ट देखें", repGiven: "कुल दिया", repRet: "कुल रिकवरी", repProfit: "कमाया प्रॉफिट", repNoData: "इस तारीख में कोई डेटा नहीं है।", repNewCases: "🆕 नए खाते (GIVEN)", repPayments: "✅ प्राप्त रिकवरी (RECEIVED)", advProfit: "एडवांस प्रॉफिट (कटौती)",
        archiveToast: "खाता आर्काइव हो गया!", unarchiveToast: "खाता वापस आ गया!", staffRefPh: "रेफरेंस / स्टाफ का नाम", lockSub: "4-अक्षरों की Login ID या Owner PIN डालें"
    },
    'pa': { 
        appSub: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ 👋", sumPrin: "ਕੁੱਲ ਰਕਮ", sumCases: "ਕੁੱਲ ਖਾਤੇ", sumOut: "ਬਕਾਇਆ", 
        addTitle: "ਨਵਾਂ ਖਾਤਾ ਬਣਾਓ", namePh: "ਗਾਹਕ ਦਾ ਨਾਮ", amtPh: "ਮੂਲ ਰਕਮ", addBtn: "ਖਾਤਾ ਜੋੜੋ", 
        navDash: "ਹੋਮ", navCust: "ਖਾਤੇ", navBulk: "ਫਾਸਟ ਐਡ", navStats: "ਰਿਵਿਊ", 
        setMainTitle: "ਐਪ ਸੈਟਿੰਗਜ਼", setBackup: "ਡਾਟਾ ਬੈਕਅੱਪ", setRestore: "ਡਾਟਾ ਰੀਸਟੋਰ", setPinStaff: "ਸਟਾਫ PIN ਬਦਲੋ", setPinOwner: "ਮਾਲਕ PIN ਬਦਲੋ 👑", setLogout: "ਲਾਗਆਉਟ", setClose: "ਬੰਦ ਕਰੋ", 
        searchPh: "ਨਾਮ ਖੋਜੋ...", cleanDashTitle: "ਕਲੀਨ ਡੈਸ਼ਬੋਰਡ", cleanDashSub: "ਖਾਤਾ ਦੇਖਣ ਲਈ ਉੱਪਰ ਨਾਮ ਖੋਜੋ।<br>ਪੂਰੀ ਸੂਚੀ ਲਈ <b>ਖਾਤੇ</b> ਟੈਬ 'ਤੇ ਜਾਓ।", 
        bizPort: "ਕਾਰੋਬਾਰ ਪੋਰਟਫੋਲੀਓ", recStatus: "ਰਿਕਵਰੀ ਸਥਿਤੀ", monthly: "ਮਹੀਨਾਵਾਰ", daily: "ਰੋਜ਼ਾਨਾ", meter: "ਮੀਟਰ", recovered: "ਵਸੂਲੀ ਹੋਈ", remaining: "ਬਕਾਇਆ", 
        ownerGrowth: "👑 ਮੁਨਾਫਾ ਅਤੇ ਵਿਕਾਸ", totInvested: "ਕੁੱਲ ਨਿਵੇਸ਼", netProfit: "ਪ੍ਰਾਪਤ ਮੁਨਾਫਾ", ownerNote: "ਇਹ ਡਾਟਾ ਸਿਰਫ਼ ਮਾਲਕ ਲਈ ਹੈ, ਸਟਾਫ਼ ਤੋਂ ਲੁਕਿਆ ਹੋਇਆ ਹੈ।",
        refresh: "ਰਿਫ੍ਰੈਸ਼", totRetPh: "ਕੁੱਲ ਵਾਪਸੀ ਰਕਮ", totDaysPh: "ਕੁੱਲ ਦਿਨ", 
        allTypes: "ਸਾਰੀਆਂ ਕਿਸਮਾਂ", fDaily: "ਰੋਜ਼ਾਨਾ", fMonthly: "ਮਹੀਨਾਵਾਰ", fMeter: "ਮੀਟਰ", fArchived: "ਬੰਦ ਖਾਤੇ (Archived)",
        optDaily: "ਰੋਜ਼ਾਨਾ ਕਿਸ਼ਤ", optMonthly: "ਮਹੀਨੇ ਦਾ ਵਿਆਜ", optMeter: "ਮੀਟਰ (ਰੋਜ਼ਾਨਾ)", markPersonal: "👑 ਪਰਸਨਲ ਖਾਤਾ",
        sortNew: "ਨਵਾਂ ਪਹਿਲਾਂ ▼", sortOld: "ਪੁਰਾਣਾ ਪਹਿਲਾਂ ▲",
        delCaseMsg: "ਕੀ ਤੁਸੀਂ ਇਹ ਪੂਰਾ ਖਾਤਾ ਮਿਟਾਉਣਾ ਚਾਹੁੰਦੇ ਹੋ?", delCaseSuccess: "ਖਾਤਾ ਮਿਟਾ ਦਿੱਤਾ ਗਿਆ!", editBtn: "ਐਡਿਟ", recBtn: "ਪ੍ਰਾਪਤ ਕਰੋ", bulkBtn: "⚡ ਬਲਕ",
        bulkTitle: "ਬਲਕ ਐਂਟਰੀ", bulkStart: "ਸ਼ੁਰੂਆਤੀ ਮਿਤੀ", bulkEnd: "ਆਖਰੀ ਮਿਤੀ", bulkSubmit: "ਬਲਕ ਪ੍ਰੋਸੈਸ ਕਰੋ", bulkCancel: "ਰੱਦ ਕਰੋ", perMonthAmt: "ਹਰ ਮਹੀਨੇ ਦੀ ਰਕਮ (₹)", perDayAmt: "ਹਰ ਦਿਨ ਦੀ ਰਕਮ (₹)",
        autoBackupLabel: "ਆਟੋ ਬੈਕਅੱਪ ਫਾਈਲ", abNever: "ਕਦੇ ਨਹੀਂ", abDaily: "ਰੋਜ਼ਾਨਾ (ਐਪ ਖੁੱਲਣ 'ਤੇ)", abMonthly: "ਮਹੀਨੇ ਵਿੱਚ ਇੱਕ ਵਾਰ",
        repTitle: "📅 ਤਾਰੀਖ ਦੇ ਅਨੁਸਾਰ ਰਿਪੋਰਟ", repBtn: "ਰਿਪੋਰਟ ਦੇਖੋ", repGiven: "ਕੁੱਲ ਦਿੱਤਾ", repRet: "ਕੁੱਲ ਰਿਕਵਰੀ", repProfit: "ਕਮਾਇਆ ਮੁਨਾਫਾ", repNoData: "ਇਸ ਤਾਰੀਖ ਵਿੱਚ ਕੋਈ ਡਾਟਾ ਨਹੀਂ ਹੈ।", repNewCases: "🆕 ਨਵੇਂ ਖਾਤੇ (GIVEN)", repPayments: "✅ ਪ੍ਰਾਪਤ ਰਿਕਵਰੀ (RECEIVED)", advProfit: "ਐਡਵਾਂਸ ਮੁਨਾਫਾ (ਕਟੌਤੀ)",
        archiveToast: "ਖਾਤਾ ਆਰਕਾਈਵ ਹੋ ਗਿਆ!", unarchiveToast: "ਖਾਤਾ ਵਾਪਸ ਆ ਗਿਆ!", staffRefPh: "ਹਵਾਲਾ / ਸਟਾਫ ਦਾ ਨਾਮ", lockSub: "4- ਅੱਖਰਾਂ ਦੀ Login ID ਜਾਂ Owner PIN ਦਰਜ ਕਰੋ"
    }
};

let currentLang = localStorage.getItem('paymitra_lang') || 'en';
let autoBackupFreq = localStorage.getItem('paymitra_autobackup') || 'never';

window.onload = function() { 
    document.getElementById('lock-screen').style.display = 'flex'; 
    document.getElementById('main-app').style.display = 'none'; 
    if(document.getElementById('lang-select')) document.getElementById('lang-select').value = currentLang;
    if(document.getElementById('auto-backup-select')) document.getElementById('auto-backup-select').value = autoBackupFreq;
    
    let todayDate = new Date().toISOString().split('T')[0];
    if(document.getElementById('date')) document.getElementById('date').value = todayDate;
    if(document.getElementById('rep-start')) document.getElementById('rep-start').value = todayDate;
    if(document.getElementById('rep-end')) document.getElementById('rep-end').value = todayDate;

    applyLang();

    document.getElementById('t-lockSub').innerText = "Connecting to Cloud... ⏳";
    fetch(SCRIPT_URL + "?action=load&t=" + new Date().getTime(), { method: "GET", cache: "no-store" })
    .then(res => res.text())
    .then(text => {
        if(text && text.length > 5) {
            db = JSON.parse(text);
            localStorage.setItem('paymitra_v11', JSON.stringify(db));
        }
        document.getElementById('t-lockSub').innerText = i18n[currentLang].lockSub; 
    })
    .catch(e => {
        document.getElementById('t-lockSub').innerText = i18n[currentLang].lockSub;
    });

    // Background Auto-Sync setup
    setInterval(backgroundSync, 15000); 
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") backgroundSync(); 
    });
};

function changeLang() {
    currentLang = document.getElementById('lang-select').value;
    localStorage.setItem('paymitra_lang', currentLang);
    applyLang();
    render(); 
    showToast("Language Updated!");
}

function changeAutoBackup() {
    autoBackupFreq = document.getElementById('auto-backup-select').value;
    localStorage.setItem('paymitra_autobackup', autoBackupFreq);
    showToast("Auto Backup Saved!");
}

function applyLang() {
    const t = i18n[currentLang];
    document.getElementById('t-appSub').innerText = t.appSub;
    document.getElementById('t-sumPrin').innerText = t.sumPrin;
    document.getElementById('t-sumCases').innerText = t.sumCases;
    document.getElementById('t-sumOut').innerText = t.sumOut;
    document.getElementById('t-refresh').innerText = t.refresh;
    document.getElementById('t-addTitle').innerText = t.addTitle;
    document.getElementById('t-addBtn').innerText = t.addBtn;
    document.getElementById('t-opt-daily').innerText = t.optDaily;
    document.getElementById('t-opt-monthly').innerText = t.optMonthly;
    document.getElementById('t-opt-meter').innerText = t.optMeter;
    document.getElementById('t-markPersonal').innerText = t.markPersonal;
    if(document.getElementById('t-editMarkPersonal')) document.getElementById('t-editMarkPersonal').innerText = t.markPersonal;
    document.getElementById('t-navDash').innerText = t.navDash;
    document.getElementById('t-navCust').innerText = t.navCust;
    document.getElementById('t-navBulk').innerText = t.navBulk;
    document.getElementById('t-navStats').innerText = t.navStats;
    document.getElementById('t-setMainTitle').innerText = t.setMainTitle;
    document.getElementById('t-setBackup').innerText = t.setBackup;
    document.getElementById('t-setRestore').innerText = t.setRestore;
    document.getElementById('btn-owner-pin').innerText = t.setPinOwner;
    document.getElementById('t-setLogout').innerText = t.setLogout;
    document.getElementById('t-setClose').innerText = t.setClose;
    document.getElementById('t-autoBackupLabel').innerText = t.autoBackupLabel;
    document.getElementById('t-abNever').innerText = t.abNever;
    document.getElementById('t-abDaily').innerText = t.abDaily;
    document.getElementById('t-abMonthly').innerText = t.abMonthly;
    document.getElementById('t-bizPort').innerText = t.bizPort;
    document.getElementById('t-recStatus').innerText = t.recStatus;
    document.getElementById('t-ownerGrowth').innerText = t.ownerGrowth;
    document.getElementById('t-totInvested').innerText = t.totInvested;
    document.getElementById('t-netProfit').innerText = t.netProfit;
    document.getElementById('t-ownerNote').innerText = t.ownerNote;
    document.getElementById('f-opt-all').innerText = t.allTypes;
    document.getElementById('f-opt-daily').innerText = t.fDaily;
    document.getElementById('f-opt-monthly').innerText = t.fMonthly;
    document.getElementById('f-opt-meter').innerText = t.fMeter;
    if(document.getElementById('f-opt-archived')) document.getElementById('f-opt-archived').innerText = t.fArchived;
    document.getElementById('s-opt-new').innerText = t.sortNew;
    document.getElementById('s-opt-old').innerText = t.sortOld;
    document.getElementById('t-bulkTitle').innerText = t.bulkTitle;
    document.getElementById('t-bulkStart').innerText = t.bulkStart;
    document.getElementById('t-bulkEnd').innerText = t.bulkEnd;
    document.getElementById('t-bulkSubmit').innerText = t.bulkSubmit;
    document.getElementById('t-bulkCancel').innerText = t.bulkCancel;
    document.getElementById('name').placeholder = t.namePh;
    document.getElementById('amt').placeholder = t.amtPh;
    document.getElementById('search-box').placeholder = t.searchPh;
    document.getElementById('total_ret').placeholder = t.totRetPh;
    document.getElementById('days').placeholder = t.totDaysPh;
    
    document.getElementById('t-repTitle').innerText = t.repTitle;
    document.getElementById('t-repBtn').innerText = t.repBtn;
    document.getElementById('t-repGiven').innerText = t.repGiven;
    document.getElementById('t-repRet').innerText = t.repRet;
    document.getElementById('t-repProfit').innerText = t.repProfit;
    document.getElementById('t-repAll').innerText = t.allTypes;
    document.getElementById('t-repDaily').innerText = t.fDaily;
    document.getElementById('t-repMonthly').innerText = t.fMonthly;
    document.getElementById('t-repMeter').innerText = t.fMeter;

    document.getElementById('staff-ref').placeholder = t.staffRefPh;
    document.getElementById('t-editStaffRefLabel').innerText = t.staffRefPh;
    document.getElementById('t-lockSub').innerText = t.lockSub;
}

function showToast(msg) {
    let t = document.getElementById('toast-box');
    t.innerText = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function askConfirm(msg, callback) {
    document.getElementById('confirm-text').innerText = msg;
    confirmActionCallback = callback;
    document.getElementById('confirm-modal').style.display = 'flex';
}

function executeConfirm() {
    if(confirmActionCallback) confirmActionCallback();
    closeModal('confirm-modal');
}

function switchTab(tab) {
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

    if(document.getElementById('filter-box')) document.getElementById('filter-box').value = 'all';
    if(document.getElementById('search-box')) document.getElementById('search-box').value = '';
    if(document.getElementById('sort-box')) document.getElementById('sort-box').value = 'new';

    if(tab === 'stats') {
        let todayDate = new Date().toISOString().split('T')[0];
        document.getElementById('rep-start').value = todayDate;
        document.getElementById('rep-end').value = todayDate;
        if(document.getElementById('rep-type')) document.getElementById('rep-type').value = 'all'; 
        if(document.getElementById('rep-search')) document.getElementById('rep-search').value = ''; 
        document.getElementById('rep-results').style.display = 'none'; 
        document.getElementById('rep-list').scrollTop = 0; 
        window.scrollTo(0, 0); 
    }

    render();
}

function openSettings() { document.getElementById('settings-modal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function logout() { 
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('lock-screen').style.display = 'flex';
    resetPin();
    isOwnerMode = false;
    deviceStaffName = '';
    activeLoginPin = "";
    
    currentLang = 'en';
    localStorage.setItem('paymitra_lang', 'en');
    if(document.getElementById('lang-select')) document.getElementById('lang-select').value = 'en';
    applyLang();

    if(document.getElementById('filter-box')) document.getElementById('filter-box').value = 'all';
    if(document.getElementById('search-box')) document.getElementById('search-box').value = '';
    if(document.getElementById('sort-box')) document.getElementById('sort-box').value = 'new';
    
    switchTab('dash');
}

// Security Check: Validates if the staff PIN was changed from another device
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

function hardRefresh() {
    loadFromCloud();
}

// Manage Staff Logic
function openStaffModal() {
    closeModal('settings-modal');
    renderStaffList();
    document.getElementById('staff-modal').style.display = 'flex';
}

function renderStaffList() {
    let conf = getConfig();
    let html = '';
    if (conf.staffList.length === 0) {
        html = '<div style="color:var(--text-muted); font-size:12px; text-align:center;">No staff added yet.</div>';
    } else {
        conf.staffList.forEach((s, i) => {
            html += `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; margin-bottom:8px; font-size:14px;">
                <div><b style="color:white;">${s.name}</b> <span style="color:var(--accent-orange); font-size:12px; margin-left:10px; font-weight:700;">[ID: ${s.pin}]</span></div>
                <div>
                    <span onclick="openEditStaffPin(${i})" style="color:var(--owner-gold); cursor:pointer; font-size:16px; margin-right:12px;">✏️</span>
                    <span onclick="deleteStaff(${i})" style="color:var(--danger); cursor:pointer; font-size:16px;">🗑️</span>
                </div>
            </div>`;
        });
    }
    document.getElementById('staff-list-container').innerHTML = html;
}

function addStaff() {
    let name = document.getElementById('new-staff-name').value.trim();
    let pinVal = document.getElementById('new-staff-pin').value.trim();
    if (!name || pinVal.length !== 4) return showToast("Enter Name and 4-Digit ID!");
    
    let conf = getConfig();
    if (conf.staffList.some(s => s.pin === pinVal) || pinVal === secretPin) {
        return showToast("This ID is already taken!");
    }
    conf.staffList.push({ name: name, pin: pinVal });
    saveAndRender();
    document.getElementById('new-staff-name').value = '';
    document.getElementById('new-staff-pin').value = '';
    renderStaffList();
    showToast("Staff Added!");
}

function openEditStaffPin(idx) {
    let conf = getConfig();
    document.getElementById('edit-staff-idx').value = idx;
    document.getElementById('edit-staff-name-label').innerText = `Change PIN for: ${conf.staffList[idx].name}`;
    document.getElementById('edit-staff-new-pin').value = conf.staffList[idx].pin;
    document.getElementById('edit-staff-pin-modal').style.display = 'flex';
}

function saveStaffPin() {
    let idx = document.getElementById('edit-staff-idx').value;
    let newPin = document.getElementById('edit-staff-new-pin').value.trim();
    if(newPin.length !== 4) return showToast("Enter 4-Digit ID!");
    
    let conf = getConfig();
    // Check if new pin belongs to someone else
    if(conf.staffList.some((s, i) => s.pin === newPin && i != idx) || newPin === secretPin) {
        return showToast("This ID is already taken!");
    }
    
    conf.staffList[idx].pin = newPin;
    saveAndRender();
    renderStaffList();
    closeModal('edit-staff-pin-modal');
    showToast("Staff PIN Updated!");
}

function deleteStaff(idx) {
    askConfirm("Delete this staff account? They will be logged out instantly.", () => {
        let conf = getConfig();
        conf.staffList.splice(idx, 1);
        saveAndRender();
        renderStaffList();
    });
}

function openSecretPinModal() { closeModal('settings-modal'); document.getElementById('old-secret-pin').value = ''; document.getElementById('new-secret-pin').value = ''; document.getElementById('secret-pin-modal').style.display = 'flex'; }
function saveSecretPin() { let oldP = document.getElementById('old-secret-pin').value; let newP = document.getElementById('new-secret-pin').value; if(oldP === secretPin) { if(newP.trim() !== '') { secretPin = newP; localStorage.setItem('paymitra_secret', secretPin); showToast("Owner PIN Updated 👑!"); closeModal('secret-pin-modal'); } } else { showToast("Incorrect Old Owner PIN!"); } }

function exportData() { 
    let d = new Date(); 
    let dateStr = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,'0') + "-" + String(d.getDate()).padStart(2,'0') + "_" + String(d.getHours()).padStart(2,'0') + "-" + String(d.getMinutes()).padStart(2,'0');
    let fileName = "CredixBackup_" + dateStr + ".json";
    let a = document.createElement("a"); 
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db)], {type: "application/json"})); 
    a.download = fileName; 
    a.click(); 
}

function importData() { 
    let i = document.createElement('input'); i.type = 'file'; 
    i.onchange = e => { 
        let r = new FileReader(); 
        r.onload = () => { 
            try {
                db = JSON.parse(r.result); saveAndRender(); closeModal('settings-modal'); showToast("Data Restored!"); 
            } catch(err) {
                showToast("Invalid Backup File");
            }
        }; 
        r.readAsText(e.target.files[0]); 
    }; 
    i.click(); 
}

function press(n) { 
    if(pin.length < 4) { 
        pin += n; document.getElementById('d' + pin.length).classList.add('active'); 
    } 
}
function resetPin() { pin = ""; for(let i=1; i<=4; i++) document.getElementById('d'+i).classList.remove('active'); }

function deletePinChar() {
    if(pin.length > 0) {
        document.getElementById('d' + pin.length).classList.remove('active');
        pin = pin.slice(0, -1);
    }
}

function checkPin() { 
    let conf = getConfig();
    if (pin === secretPin || pin === "1984") { 
        isOwnerMode = true;
        deviceStaffName = "Owner";
        activeLoginPin = pin; // Store active pin for security check
        showToast("Owner Mode Unlocked 👑");
        unlockApp();
    } else {
        let staffMatch = conf.staffList.find(s => s.pin === pin);
        if (staffMatch) {
            isOwnerMode = false;
            deviceStaffName = staffMatch.name;
            activeLoginPin = pin; // Store active pin for security check
            showToast(`Welcome ${deviceStaffName} 👋`);
            unlockApp();
        } else if (pin === currentPin && conf.staffList.length === 0) {
            isOwnerMode = false;
            deviceStaffName = "Default Staff";
            activeLoginPin = pin;
            showToast("Staff Mode Active");
            unlockApp();
        } else {
            showToast("Invalid ID / PIN"); 
            resetPin(); 
        }
    } 
}

function checkAutoBackup() {
    if(autoBackupFreq === 'never' || db.length === 0) return;
    let todayObj = new Date();
    let todayStr = todayObj.toISOString().split('T')[0];
    let lastBackup = localStorage.getItem('paymitra_lastbackup') || '';
    if (autoBackupFreq === 'daily') {
        if (lastBackup !== todayStr) {
            exportData();
            localStorage.setItem('paymitra_lastbackup', todayStr);
            setTimeout(() => showToast("Daily Auto Backup Complete!"), 1000);
        }
    } else if (autoBackupFreq === 'monthly') {
        let currentMonth = todayObj.getFullYear() + '-' + todayObj.getMonth();
        let lastMonth = lastBackup ? new Date(lastBackup).getFullYear() + '-' + new Date(lastBackup).getMonth() : '';
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
    
    if(document.getElementById('filter-box')) document.getElementById('filter-box').value = 'all';
    if(document.getElementById('search-box')) document.getElementById('search-box').value = '';
    if(document.getElementById('sort-box')) document.getElementById('sort-box').value = 'new';
    
    if(isOwnerMode) {
        document.getElementById('owner-badge').style.display = 'block';
        document.getElementById('owner-title-badge').style.display = 'inline';
        document.getElementById('personal-wrap').style.display = 'flex';
        document.getElementById('btn-owner-pin').style.display = 'block';
        document.getElementById('btn-manage-staff').style.display = 'block';
        document.getElementById('owner-analytics').style.display = 'block';
        document.getElementById('wrap-staff-ref').style.display = 'flex'; 
        document.getElementById('rep-search-wrap').style.display = 'flex'; 
        document.getElementById('t-appSub').innerText = "Owner Dashboard 👑";
    } else {
        document.getElementById('owner-badge').style.display = 'none';
        document.getElementById('owner-title-badge').style.display = 'none';
        document.getElementById('personal-wrap').style.display = 'none';
        document.getElementById('btn-owner-pin').style.display = 'none';
        document.getElementById('btn-manage-staff').style.display = 'none';
        document.getElementById('owner-analytics').style.display = 'none';
        document.getElementById('is-personal').checked = false;
        document.getElementById('wrap-staff-ref').style.display = 'none'; 
        document.getElementById('rep-search-wrap').style.display = 'none'; 
        document.getElementById('t-appSub').innerText = `Welcome ${deviceStaffName} 👋`;
    }
    render(); loadFromCloud(); checkAutoBackup();
}

async function loadFromCloud() {
    document.getElementById('sync-status').innerText = "Syncing...";
    try {
        const res = await fetch(SCRIPT_URL + "?action=load&t=" + new Date().getTime(), { method: "GET", cache: "no-store" });
        const text = await res.text();
        if(text && text.length > 5) { 
            let newDb = JSON.parse(text); 
            
            // Real-time security check
            if(!validateSession(newDb)) return; 

            db = newDb; 
            localStorage.setItem('paymitra_v11', JSON.stringify(db)); 
            render(); 
        }
        document.getElementById('sync-status').innerText = "Cloud Synced";
        document.getElementById('cloud-indicator').className = "status-dot";
    } catch(e) { 
        console.error("Offline error", e);
        document.getElementById('sync-status').innerText = "Offline Mode";
        document.getElementById('cloud-indicator').className = "status-dot offline";
    }
}

async function backgroundSync() {
    let isAnyModalOpen = false;
    let modals = document.querySelectorAll('.modal');
    modals.forEach(m => {
        if(m.style.display === 'flex' || m.style.display === 'block') {
            isAnyModalOpen = true;
        }
    });

    if(document.getElementById('lock-screen').style.display !== 'none' || isSaving || isAnyModalOpen) return;
    
    try {
        const res = await fetch(SCRIPT_URL + "?action=load&t=" + new Date().getTime(), { method: "GET", cache: "no-store" });
        const text = await res.text();
        if(text && text.length > 5) {
            let newDb = JSON.parse(text);
            
            // Real-time security check
            if(!validateSession(newDb)) return; 

            if(JSON.stringify(newDb) !== JSON.stringify(db) && !isSaving) {
                db = newDb;
                localStorage.setItem('paymitra_v11', JSON.stringify(db));
                render();
                showToast("Data Auto-Updated!"); 
            }
        }
    } catch(e) { 
    }
}

function autoCalc() { let type = document.getElementById('type').value; let amt = parseFloat(document.getElementById('amt').value) || 0; if(type === 'meter' && amt > 0) { document.getElementById('meter-amt').value = (amt * 0.01).toFixed(0); } else if (type === 'meter') { document.getElementById('meter-amt').value = ''; } }
function toggleFields() { const t = document.getElementById('type').value; document.getElementById('m-fields').style.display = t === 'monthly' ? 'block' : 'none'; document.getElementById('d-fields').style.display = t === 'daily' ? 'block' : 'none'; document.getElementById('meter-fields').style.display = t === 'meter' ? 'block' : 'none'; autoCalc(); }

function triggerShake(id) {
    let el = document.getElementById(id);
    if(el) {
        let group = el.closest('.input-group');
        if(group) {
            group.classList.add('shake-error');
            setTimeout(() => group.classList.remove('shake-error'), 400);
        }
    }
}

function recalculateCase(c) {
    if(!c.history) c.history = [];
    c.history.sort((a, b) => new Date(a.date) - new Date(b.date));
    let tempBal = (c.type === 'monthly' || c.type === 'meter') ? c.principal : (c.totalPayable || c.principal);
    c.history.forEach(h => {
        if(c.type === 'monthly' || c.type === 'meter') { let intDue = (tempBal * (c.rate||0) / 100); if(h.paid > intDue) tempBal -= (h.paid - intDue); } else { tempBal -= h.paid; }
        h.balance = tempBal; h.bal = tempBal.toFixed(0);
    });
    c.currentBalance = tempBal;
}

function addCustomer() {
    const tLang = i18n[currentLang];
    const type = document.getElementById('type').value, name = document.getElementById('name').value, amt = parseFloat(document.getElementById('amt').value), date = document.getElementById('date').value;
    const staffRef = isOwnerMode ? document.getElementById('staff-ref').value.trim() : deviceStaffName;
    const isPersonal = document.getElementById('is-personal') ? document.getElementById('is-personal').checked : false;
    
    if(!name) { triggerShake('name'); return showToast(tLang.missingNameAmt || "Missing Name!"); }
    if(isNaN(amt) || amt <= 0) { triggerShake('amt'); return showToast(tLang.missingNameAmt || "Missing Principal!"); }
    
    let cust = { id: Date.now(), name, principal: amt, type, startDate: date, history: [], staffRef: staffRef, isPersonal: isPersonal, isArchived: false };
    
    if(type === 'monthly') { 
        let rateVal = parseFloat(document.getElementById('rate').value);
        if(isNaN(rateVal)) { triggerShake('rate'); return showToast(tLang.missingRate || "Missing Interest Rate!"); }
        cust.rate = rateVal; 
        cust.currentBalance = amt; 
    } 
    else if (type === 'meter') { 
        let mAmt = parseFloat(document.getElementById('meter-amt').value);
        if(isNaN(mAmt)) { triggerShake('meter-amt'); return showToast(tLang.missingMeter || "Missing Rozana Vyaj!"); }
        cust.rate = (mAmt / amt) * 100; 
        cust.currentBalance = amt; 
    } 
    else { 
        let tRet = parseFloat(document.getElementById('total_ret').value);
        let dVals = parseInt(document.getElementById('days').value);
        if(isNaN(tRet)) { triggerShake('total_ret'); return showToast(tLang.missingRet || "Missing Return Amount!"); }
        if(isNaN(dVals) || dVals <= 0) { triggerShake('days'); return showToast(tLang.missingDays || "Missing Total Days!"); }
        
        cust.totalPayable = tRet; 
        cust.currentBalance = cust.totalPayable; 
        cust.installment = cust.totalPayable / dVals; 
    }
    
    db.push(cust); saveAndRender(); 
    
    document.getElementById('name').value = '';
    document.getElementById('amt').value = '';
    document.getElementById('staff-ref').value = '';
    if(document.getElementById('total_ret')) document.getElementById('total_ret').value = '';
    if(document.getElementById('days')) document.getElementById('days').value = '';
    if(document.getElementById('meter-amt')) document.getElementById('meter-amt').value = '';
    
    showToast("Record Created!");
}

function saveAndRender() { 
    isSaving = true;
    localStorage.setItem('paymitra_v11', JSON.stringify(db)); 
    render(); 
    
    document.getElementById('sync-status').innerText = "Saving to Cloud...";
    document.getElementById('cloud-indicator').className = "status-dot";
    
    fetch(SCRIPT_URL, { 
        method: "POST", 
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "save", data: JSON.stringify(db) }) 
    })
    .then(res => res.text())
    .then(res => {
        if(res === "Success") {
            document.getElementById('sync-status').innerText = "Cloud Synced";
        } else {
            document.getElementById('sync-status').innerText = "Save Error";
            document.getElementById('cloud-indicator').className = "status-dot offline";
        }
        isSaving = false;
    })
    .catch(e => { 
        console.log("Save offline", e);
        document.getElementById('sync-status').innerText = "Saved Offline";
        document.getElementById('cloud-indicator').className = "status-dot offline";
        isSaving = false;
    }); 
}

function toggleView(id) { 
    if(openViews[id]) { 
        delete openViews[id]; 
        multiDelMode[id] = false; 
    } else { 
        openViews[id] = true; 
    } 
    render(); 
}

function toggleMultiDel(id) { multiDelMode[id] = !multiDelMode[id]; render(); }

function toggleSelectAllHistory(id) {
    let checks = document.querySelectorAll(`.del-chk-${id}`);
    let allChecked = Array.from(checks).every(ck => ck.checked);
    checks.forEach(ck => ck.checked = !allChecked);
}

function openPayModal(id) { 
    let c = db.find(x => x.id === id); 
    document.getElementById('pay-id').value = id; 
    document.getElementById('pay-date').value = new Date().toISOString().split('T')[0]; 
    let amt = c.type === 'monthly' ? (c.currentBalance * (c.rate||0)/100) : (c.type === 'meter' ? (c.currentBalance * (c.rate||0)/100) : (c.installment || 0));
    document.getElementById('pay-amt').value = amt.toFixed(0); 
    document.getElementById('pay-modal').style.display = 'flex'; 
}

function savePayment() { 
    let id = parseInt(document.getElementById('pay-id').value); 
    let c = db.find(x => x.id === id); 
    let amt = parseFloat(document.getElementById('pay-amt').value); 
    let dateStr = document.getElementById('pay-date').value; 
    if(!amt || !dateStr) { triggerShake('pay-amt'); return showToast("Valid data required"); } 
    
    if(c.history && c.history.some(h => h.date === dateStr)) {
        triggerShake('pay-date');
        const tLang = i18n[currentLang];
        return showToast(tLang.dupEntry || "Payment already added for this date!");
    }

    c.history.push({ date: dateStr, paid: amt }); 
    recalculateCase(c);
    saveAndRender(); 
    closeModal('pay-modal'); 
    showToast("Payment Saved");
}

function openBulkModal(id) { 
    let c = db.find(x => x.id === id); 
    document.getElementById('bulk-id').value = id; 
    document.getElementById('bulk-start-date').value = new Date().toISOString().split('T')[0]; 
    document.getElementById('bulk-end-date').value = new Date().toISOString().split('T')[0]; 
    let amt = c.type === 'monthly' ? (c.principal * (c.rate||0)/100) : (c.type === 'meter' ? (c.principal * 0.01) : (c.installment || 0));
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
    let amt = parseFloat(document.getElementById('bulk-amt').value); 
    let startStr = document.getElementById('bulk-start-date').value; 
    let endStr = document.getElementById('bulk-end-date').value; 
    if(!amt || !startStr || !endStr) { triggerShake('bulk-amt'); return; } 
    let startDate = new Date(startStr); let endDate = new Date(endStr); 
    if(endDate < startDate) return showToast("End date must be later"); 
    
    let tempDate = new Date(startDate);
    let hasDuplicate = false;
    while(tempDate <= endDate) {
        let y = tempDate.getFullYear(); let m = String(tempDate.getMonth() + 1).padStart(2, '0'); let d = String(tempDate.getDate()).padStart(2, '0'); let pushDate = `${y}-${m}-${d}`; 
        if(c.history && c.history.some(h => h.date === pushDate)) { hasDuplicate = true; break; }
        if(c.type === 'monthly') { tempDate.setMonth(tempDate.getMonth() + 1); } else { tempDate.setDate(tempDate.getDate() + 1); } 
    }

    if(hasDuplicate) {
        triggerShake('bulk-start-date');
        triggerShake('bulk-end-date');
        const tLang = i18n[currentLang];
        return showToast(tLang.dupEntry || "Payment already added for this date!");
    }

    let currentDate = new Date(startDate); 
    while(currentDate <= endDate) { 
        let y = currentDate.getFullYear(); let m = String(currentDate.getMonth() + 1).padStart(2, '0'); let d = String(currentDate.getDate()).padStart(2, '0'); let pushDate = `${y}-${m}-${d}`; 
        c.history.push({ date: pushDate, paid: amt }); 
        if(c.type === 'monthly') { currentDate.setMonth(currentDate.getMonth() + 1); } else { currentDate.setDate(currentDate.getDate() + 1); } 
    } 
    recalculateCase(c);
    saveAndRender(); 
    closeModal('bulk-modal'); 
    showToast("Bulk Saved!");
}

function openEditModal(id) { 
    let c = db.find(x => x.id === id); 
    document.getElementById('edit-id').value = id; 
    document.getElementById('edit-name').value = c.name; 
    document.getElementById('edit-staff-ref').value = c.staffRef || '';
    document.getElementById('edit-date').value = c.startDate; 
    document.getElementById('edit-amt').value = c.principal; 
    if(c.type === 'monthly') { document.getElementById('edit-extra-label').innerText = "Monthly Rate (%)"; document.getElementById('edit-extra').value = c.rate; document.getElementById('edit-ret-wrap').style.display = 'none'; } 
    else if(c.type === 'meter') { document.getElementById('edit-extra-label').innerText = "Rozana Vyaj Amount (₹)"; document.getElementById('edit-extra').value = (c.principal * c.rate / 100).toFixed(0); document.getElementById('edit-ret-wrap').style.display = 'none'; } 
    else { document.getElementById('edit-extra-label').innerText = "Kishat Amount (₹)"; document.getElementById('edit-extra').value = c.installment; document.getElementById('edit-ret-wrap').style.display = 'block'; document.getElementById('edit-ret').value = c.totalPayable || c.principal; } 
    
    if(isOwnerMode) {
        document.getElementById('edit-staff-wrap').style.display = 'block';
        document.getElementById('edit-personal-wrap').style.display = 'flex';
        document.getElementById('edit-is-personal').checked = !!c.isPersonal;
    } else {
        document.getElementById('edit-staff-wrap').style.display = 'none';
        document.getElementById('edit-personal-wrap').style.display = 'none';
    }

    document.getElementById('edit-modal').style.display = 'flex'; 
}

function saveEdit() { 
    let id = parseInt(document.getElementById('edit-id').value); 
    let c = db.find(x => x.id === id); 
    
    let oldPrincipal = c.principal;
    let oldTotalPayable = c.totalPayable;
    let oldInstallment = c.installment;
    let oldRate = c.rate;

    let nameVal = document.getElementById('edit-name').value;
    if (nameVal) c.name = nameVal; 
    
    if(isOwnerMode) {
        c.staffRef = document.getElementById('edit-staff-ref').value.trim();
        c.isPersonal = document.getElementById('edit-is-personal').checked;
    }

    let dateVal = document.getElementById('edit-date').value;
    if (dateVal) c.startDate = dateVal; 

    let amtVal = parseFloat(document.getElementById('edit-amt').value);
    if (!isNaN(amtVal)) c.principal = amtVal; 
    
    let extra = parseFloat(document.getElementById('edit-extra').value); 
    
    if(c.type === 'monthly') { 
        c.rate = !isNaN(extra) ? extra : oldRate; 
    } 
    else if(c.type === 'meter') { 
        c.rate = !isNaN(extra) && c.principal ? (extra / c.principal) * 100 : oldRate; 
    } 
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
    saveAndRender(); 
    showToast("Account Updated");
}

function toggleArchiveUI(id) {
    let c = db.find(x => x.id === id);
    let isArchiving = !c.isArchived;
    let tLang = i18n[currentLang];
    let msg = isArchiving ? "Move to Archive (Closed Cases)?" : "Restore to Active Cases?";
    askConfirm(msg, () => {
        c.isArchived = isArchiving;
        saveAndRender();
        showToast(isArchiving ? (tLang.archiveToast || "Archived!") : (tLang.unarchiveToast || "Unarchived!"));
    });
}

function deleteCustUI(id) {
    askConfirm("Are you sure you want to delete this entire account?", () => {
        db = db.filter(x => x.id !== id);
        saveAndRender();
        showToast("Account Deleted!");
    });
}

function deleteHistoryUI(custId, originalIndex) {
    askConfirm("Delete this entry?", () => {
        let c = db.find(x => x.id === custId);
        c.history.splice(originalIndex, 1);
        recalculateCase(c);
        saveAndRender();
        showToast("Entry Deleted!");
    });
}

function deleteSelectedHistoryUI(id) {
    let checks = document.querySelectorAll(`.del-chk-${id}:checked`);
    if(checks.length === 0) return toggleMultiDel(id);
    askConfirm(`Delete ${checks.length} entries?`, () => {
        let c = db.find(x => x.id === id);
        let indices = Array.from(checks).map(ck => parseInt(ck.value)).sort((a,b) => b-a);
        indices.forEach(idx => { c.history.splice(idx, 1); });
        multiDelMode[id] = false;
        recalculateCase(c);
        saveAndRender();
        showToast("Selected Deleted!");
    });
}

function generateReport() {
    const start = document.getElementById('rep-start').value;
    const end = document.getElementById('rep-end').value;
    const type = document.getElementById('rep-type').value;
    const searchQ = document.getElementById('rep-search').value.toLowerCase().trim();
    const t = i18n[currentLang];
    
    if (!start || !end) return showToast("Select both dates!");
    if (start > end) return showToast("Start date must be before end date!");

    let totalGiven = 0;
    let totalReturned = 0;
    let totalProfitInRange = 0; 
    let casesInRange = [];
    let paymentsInRange = [];

    let todayStr = new Date().toISOString().split('T')[0];
    let currentMonth = todayStr.substring(0, 7);

    db.filter(x => x.type !== 'config').forEach(c => {
        if (!isOwnerMode && c.isPersonal) return;
        // STRICT PRIVACY: Agar staff ka naam match nahi karta, toh data hide kar do
        if (!isOwnerMode && (c.staffRef || '').trim().toLowerCase() !== deviceStaffName.toLowerCase()) return;
        if (type !== 'all' && c.type !== type) return;

        // OWNER SEARCH FILTER
        if (isOwnerMode && searchQ !== '') {
            let cName = (c.name || '').toLowerCase();
            let sRef = (c.staffRef || '').toLowerCase();
            if (!cName.includes(searchQ) && !sRef.includes(searchQ)) return;
        }

        if (c.startDate >= start && c.startDate <= end) {
            totalGiven += c.principal;
            
            let reportCaseObj = {...c}; 
            
            if (c.type === 'monthly' && isOwnerMode) {
                let upfrontProfit = c.principal * ((c.rate || 0) / 100);
                totalProfitInRange += upfrontProfit;
                reportCaseObj.tempUpfrontProfit = upfrontProfit; 
            }
            casesInRange.push(reportCaseObj);
        }

        let customerTotal = 0;
        let customerProfit = 0;
        let paymentCount = 0;
        
        let tempBal = (c.type === 'monthly' || c.type === 'meter') ? c.principal : (c.totalPayable || c.principal);
        let cRatio = 0;
        if(c.type === 'daily') {
            cRatio = ((c.totalPayable || c.principal) - c.principal) / (c.totalPayable || c.principal);
            if (cRatio < 0) cRatio = 0;
        }

        if(c.history) {
            let sortedHist = [...c.history].sort((a, b) => new Date(a.date) - new Date(b.date));
            
            let visibleHist = new Set(sortedHist); // By default all history is visible
            
            // REPORT PRIVACY FIX FOR STAFF
            if (!isOwnerMode && (c.type === 'monthly' || c.type === 'meter') && sortedHist.length > 1) {
                let activeMonthRecords = sortedHist.filter(h => h.date.substring(0, 7) === currentMonth);
                if (activeMonthRecords.length > 0) {
                    visibleHist = new Set(activeMonthRecords);
                } else {
                    visibleHist = new Set(sortedHist.slice(-1));
                }
            }

            sortedHist.forEach(h => {
                let paid = parseFloat(h.paid);
                let profitFromThisPayment = 0;

                if(c.type === 'monthly' || c.type === 'meter') {
                    let intDue = tempBal * (c.rate / 100);
                    if (paid <= intDue) {
                        profitFromThisPayment = paid;
                    } else {
                        profitFromThisPayment = intDue;
                        tempBal -= (paid - intDue);
                    }
                } else {
                    profitFromThisPayment = paid * cRatio;
                    tempBal -= paid;
                }

                // ONLY COUNT PAYMENTS THAT ARE VISIBLE TO STAFF
                if (visibleHist.has(h) && h.date >= start && h.date <= end) {
                    customerTotal += paid;
                    totalReturned += paid;
                    customerProfit += profitFromThisPayment;
                    totalProfitInRange += profitFromThisPayment;
                    paymentCount++;
                }
            });
        }
        if (customerTotal > 0) {
            paymentsInRange.push({ name: c.name, total: customerTotal, profit: customerProfit, count: paymentCount, type: c.type });
        }
    });

    document.getElementById('rep-given').innerText = '₹' + totalGiven.toLocaleString();
    document.getElementById('rep-ret').innerText = '₹' + totalReturned.toLocaleString();
    
    if(isOwnerMode) {
        document.getElementById('rep-profit-container').style.display = 'block';
        document.getElementById('rep-profit').innerText = '₹' + totalProfitInRange.toLocaleString(undefined, {maximumFractionDigits:0});
    } else {
        document.getElementById('rep-profit-container').style.display = 'none';
    }

    let reportHtml = "";

    if (casesInRange.length > 0) {
        reportHtml += `<div style="color:var(--accent-orange); font-size:11px; margin:10px 0 5px; font-weight:600;">${t.repNewCases || "🆕 NEW CASES GIVEN"}</div>`;
        casesInRange.forEach(c => {
            let typeTxt = c.type === 'monthly' ? t.fMonthly : (c.type === 'meter' ? t.fMeter : t.fDaily);
            let advProfitHtml = (isOwnerMode && c.tempUpfrontProfit) ? `<div style="font-size:10px; color:var(--owner-gold); margin-top:2px;">${t.advProfit || 'Advance Profit (Cut)'}: ₹${c.tempUpfrontProfit.toFixed(0)}</div>` : '';
            
            reportHtml += `<div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; margin-bottom:5px; font-size:12px; border-left:3px solid var(--accent-orange);">
                <div><b style="color:var(--text-main);">${c.name}</b><br><span style="color:var(--text-muted); font-size:10px;">${c.startDate} | ${typeTxt.toUpperCase()}</span></div>
                <div style="text-align:right;">
                    <b style="color:var(--accent-orange);">₹${c.principal.toLocaleString()}</b>
                    ${advProfitHtml}
                </div>
            </div>`;
        });
    }

    if (paymentsInRange.length > 0) {
        reportHtml += `<div style="color:var(--success); font-size:11px; margin:15px 0 5px; font-weight:600;">${t.repPayments || "✅ PAYMENTS RECEIVED"} (TOTAL)</div>`;
        paymentsInRange.sort((a,b) => b.total - a.total).forEach(p => {
            let typeTxt = p.type === 'monthly' ? t.fMonthly : (p.type === 'meter' ? t.fMeter : t.fDaily);
            let detailText = '';
            if (p.type === 'daily' || p.type === 'meter') {
                let perDay = (p.total / p.count).toFixed(0);
                detailText = `₹${perDay} × ${p.count} Days | ${typeTxt.toUpperCase()}`;
            } else {
                let perMonth = (p.total / p.count).toFixed(0);
                detailText = `₹${perMonth} Vyaj/Interest × ${p.count} Month | ${typeTxt.toUpperCase()}`;
            }

            reportHtml += `<div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; margin-bottom:5px; font-size:12px; border-left:3px solid var(--success);">
                <div><b style="color:var(--text-main);">${p.name}</b><br><span style="color:var(--text-muted); font-size:10px;">${detailText}</span></div>
                <div style="text-align:right;">
                    <div style="font-weight:bold; color:var(--success);">+ ₹${p.total.toLocaleString()}</div>
                    ${isOwnerMode ? `<div style="font-size:10px; color:var(--owner-gold); margin-top:2px;">Profit: ₹${p.profit.toFixed(0)}</div>` : ''}
                </div>
            </div>`;
        });
    }

    if(casesInRange.length === 0 && paymentsInRange.length === 0) {
        reportHtml += `<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:12px; border: 1px dashed rgba(255,255,255,0.1); border-radius:10px; margin-top:10px;">${t.repNoData || "No activity in this date range."}</div>`;
    }

    document.getElementById('rep-list').innerHTML = reportHtml;
    document.getElementById('rep-results').style.display = 'block';
    document.getElementById('rep-list').scrollTop = 0;
}

function render() {
    if(currentTab === 'stats') { renderStats(); return; }
    const dash = document.getElementById('dashboard'); dash.innerHTML = '';
    let sName = document.getElementById('search-box').value.toLowerCase();
    let fType = document.getElementById('filter-box').value;
    let sortType = document.getElementById('sort-box').value;
    let tP = 0, tB = 0, tC = 0;
    let today = new Date().toISOString().split('T')[0];
    
    let pureDB = db.filter(x => x.type !== 'config');
    let mappedDB = pureDB.map((c, originalSNoIndex) => ({...c, originalSNo: originalSNoIndex + 1}));
    
    let sortedDB = mappedDB.sort((a, b) => {
        let dateA = new Date(a.startDate).getTime(); let dateB = new Date(b.startDate).getTime();
        if (dateA === dateB) { return sortType === 'new' ? b.id - a.id : a.id - b.id; }
        return sortType === 'new' ? dateB - dateA : dateA - dateB;
    });

    sortedDB.forEach(c => {
        if(!isOwnerMode && c.isPersonal) return;
        // STRICT PRIVACY: Bina naam wale aur dusre staff wale case nahi dikhenge
        if(!isOwnerMode && (c.staffRef || '').trim().toLowerCase() !== deviceStaffName.toLowerCase()) return;
        
        // ARCHIVE FILTER LOGIC
        if(fType === 'archived') {
            if(!c.isArchived) return; 
        } else {
            if(c.isArchived) return; 
            if(fType !== 'all' && c.type !== fType) return;
        }

        tP += c.principal; tB += c.currentBalance; tC++;
        
        let isDueToday = false, isPending = false; 
        let pendingDays = 0;
        let todayDateObj = new Date(today);

        if (c.type === 'monthly') {
            let monthlyInt = c.principal * (c.rate || 0) / 100;
            let totalPaidThisCase = c.history ? c.history.reduce((sum, h) => sum + parseFloat(h.paid), 0) : 0;
            let monthsPaid = monthlyInt > 0 ? Math.floor(totalPaidThisCase / monthlyInt) : (c.history ? c.history.length : 0);
            
            let nextDueDate = new Date(c.startDate);
            nextDueDate.setMonth(nextDueDate.getMonth() + monthsPaid + 1); 
            
            if (todayDateObj >= nextDueDate && c.currentBalance > 0) {
                isPending = true;
                let diffTime = todayDateObj.getTime() - nextDueDate.getTime();
                pendingDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                if (pendingDays === 0) isDueToday = true;
            }
        } else {
            let paidToday = c.history ? c.history.some(h => h.date === today) : false;
            if (!paidToday && c.currentBalance > 0) {
                isPending = true;
                isDueToday = true;
                
                let lastPaymentDate = c.startDate;
                if (c.history && c.history.length > 0) {
                    lastPaymentDate = c.history.reduce((max, h) => h.date > max ? h.date : max, c.history[0].date);
                }
                let diffTime = todayDateObj.getTime() - new Date(lastPaymentDate).getTime();
                pendingDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            }
        }

        if (c.isArchived) {
            isDueToday = false;
            isPending = false;
            pendingDays = 0;
        }

        if(!c.name.toLowerCase().includes(sName)) return;
        if (currentTab === 'dash' && sName.trim() === '') return;
        let typeText = c.type.toUpperCase(); 
        let details = c.type === 'monthly' ? `₹${(c.principal * (c.rate||0)/100).toFixed(0)}/mo` : (c.type === 'meter' ? `₹${(c.principal * (c.rate||0)/100).toFixed(0)}/day` : `₹${(c.installment || 0).toFixed(0)}/day`);
        
        let statusHtml = '';
        if (c.isArchived) {
            statusHtml = `<span class="status-txt" style="color:var(--text-muted);"><span class="status-dot" style="background:var(--text-muted);box-shadow:none;"></span> Closed</span>`;
        } else if (isPending && c.currentBalance > 0) {
            statusHtml = `<span class="status-txt" style="color:var(--danger);"><span class="status-dot" style="background:var(--danger);box-shadow:none;"></span> Pending ${pendingDays > 0 ? '('+pendingDays+' Days)' : ''}</span>`;
        } else {
            statusHtml = `<span class="status-txt" style="color:var(--success);"><span class="status-dot" style="box-shadow:none;"></span> Active</span>`;
        }
        
        let totalPaid = c.history ? c.history.reduce((sum, h) => sum + parseFloat(h.paid), 0) : 0;
        let isMulti = multiDelMode[c.id];
        let personalIcon = (isOwnerMode && c.isPersonal) ? '<span style="font-size:12px;">👑</span>' : '';
        let ownerProfitHtml = '';
        
        if(isOwnerMode) {
            let profit = 0;
            if(c.type === 'monthly') { 
                let principalRecovered = c.principal - c.currentBalance; 
                profit = totalPaid - principalRecovered + (c.principal * (c.rate||0) / 100); 
            } 
            else if (c.type === 'meter') {
                let principalRecovered = c.principal - c.currentBalance; 
                profit = totalPaid - principalRecovered; 
                if(profit < 0) profit = 0;
            }
            else { 
                let expectedTotalProfit = (c.totalPayable || c.principal) - c.principal;
                let profitRatio = expectedTotalProfit / (c.totalPayable || c.principal);
                if (isNaN(profitRatio) || profitRatio < 0) profitRatio = 0;
                profit = totalPaid * profitRatio;
            }
            ownerProfitHtml = `<div style="text-align:center; padding-top:12px; margin-top:12px; border-top:1px dashed rgba(255, 215, 0, 0.2);"><b style="color:var(--owner-gold); font-size:13px;">Earned Profit: ₹${profit.toFixed(0)}</b></div>`;
        }

        let prinLabel = c.type === 'daily' ? 'Return Amt' : 'Principal';
        let prinVal = c.type === 'daily' ? (c.totalPayable || c.principal) : c.principal;
        
        let histData = c.history ? [...c.history] : [];
        let hideSNo = false;
        
        // HIDE PAST HISTORY FOR MONTHLY & METER IN STAFF MODE
        if (!isOwnerMode && (c.type === 'monthly' || c.type === 'meter')) {
            hideSNo = true;
            if (histData.length > 1) {
                let currentMonth = today.substring(0, 7); // Example: "2026-04"
                let activeMonthRecords = histData.filter(h => h.date.substring(0, 7) === currentMonth);
                
                if (activeMonthRecords.length > 0) {
                    histData = activeMonthRecords; // Is mahine ke payments dikhao
                } else {
                    histData = histData.slice(-1); // Agar is mahine payment nahi hui to sirf aakhri wali entry dikhao
                }
            }
        }
        
        let histHtml = histData.reverse().map((h) => {
            let originalIndex = c.history.indexOf(h);
            let actionHtml = isMulti ? `<input type="checkbox" class="del-chk-${c.id}" value="${originalIndex}" style="width:16px;height:16px;accent-color:var(--accent-orange);">` : `<span onclick="deleteHistoryUI(${c.id}, ${originalIndex})" style="color:var(--text-muted);font-size:14px; cursor:pointer;">🗑️</span>`;
            
            if (hideSNo) {
                return `<tr><td style="color:var(--text-muted)">${h.date}</td><td style="color:var(--success)">₹${h.paid}</td><td>₹${Number(h.balance||0).toFixed(0)}</td><td>${actionHtml}</td></tr>`;
            } else {
                return `<tr><td>${originalIndex + 1}</td><td style="color:var(--text-muted)">${h.date}</td><td style="color:var(--success)">₹${h.paid}</td><td>₹${Number(h.balance||0).toFixed(0)}</td><td>${actionHtml}</td></tr>`;
            }
        }).join('');
        
        let colSpanCount = hideSNo ? 4 : 5;
        
        if (isMulti && c.history && c.history.length > 0) histHtml += `<tr><td colspan="${colSpanCount}" style="padding-top:15px;"><button onclick="deleteSelectedHistoryUI(${c.id})" class="main-btn" style="background:var(--danger); box-shadow:none; padding:12px; border-radius:10px; margin:0;">Delete Selected</button></td></tr>`;
        
        let tableHead = hideSNo ? `<tr><th>Date</th><th>Paid</th><th>Bal</th><th>X</th></tr>` : `<tr><th>S.No</th><th>Date</th><th>Paid</th><th>Bal</th><th>X</th></tr>`;
        let kishatLabel = hideSNo ? '' : ` | Kishat: ${c.history ? c.history.length : 0}`;

        const tLang = i18n[currentLang];
        let collectBtn = currentTab === 'bulk' ? `<button class="s-btn collect" style="flex:1.4;" onclick="openBulkModal(${c.id})">${tLang.bulkBtn || '⚡ Bulk'}</button>` : `<button class="s-btn collect" style="flex:1.4;" onclick="openPayModal(${c.id})">${tLang.recBtn || 'Receive'}</button>`;
        let archiveIcon = c.isArchived ? '📤' : '📦';
        let archiveAction = `<button class="s-btn" style="flex:0.6; font-size:16px;" onclick="toggleArchiveUI(${c.id})">${archiveIcon}</button>`;
        
        let refBadge = c.staffRef ? `<span style="color:var(--accent-orange); font-size:10px; margin-left:5px;">[Ref: ${c.staffRef}]</span>` : '';

        dash.innerHTML += `
        <div class="cust-card" style="${(isOwnerMode && c.isPersonal) ? 'border-color: rgba(255, 215, 0, 0.3); background: linear-gradient(145deg, rgba(255, 215, 0, 0.05) 0%, var(--card-bg) 100%);' : ''}">
            ${isDueToday && c.currentBalance > 0 ? '<div class="due-indicator">Due Today</div>' : ''}
            <div onclick="toggleView(${c.id})" style="cursor:pointer; -webkit-tap-highlight-color:transparent;">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px; align-items:center;">
                    <div class="pill-tag">${typeText} | S.No: ${c.originalSNo}${kishatLabel}</div>
                    ${statusHtml}
                </div>
                <div class="card-header">
                    <div><div class="c-name">${c.name} ${refBadge} ${personalIcon}</div><div class="c-sub">Since ${c.startDate}</div></div>
                    <div><div class="c-bal">₹${c.currentBalance.toFixed(0)}</div><div class="c-sub" style="text-align:right">Balance</div></div>
                </div>
                <div style="font-size:11px; color:var(--text-muted); margin-top:5px; padding-top:10px; border-top:1px solid var(--card-border);">Amt: ${details}</div>
            </div>
            <div id="view-${c.id}" style="display:${openViews[c.id]?'block':'none'}">
                <div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.3); padding:15px; border-radius:12px; margin-top:15px;">
                    <div style="text-align:left;"><span style="font-size:10px; color:var(--text-muted);">${prinLabel}</span><br><b style="font-size:14px;">₹${prinVal}</b></div>
                    ${(isOwnerMode || c.type === 'daily') ? `<div style="text-align:center;"><span style="font-size:10px; color:var(--text-muted);">Total Paid</span><br><b style="font-size:14px; color:var(--success)">₹${totalPaid}</b></div>` : ''}
                    <div style="text-align:right;"><span style="font-size:10px; color:var(--text-muted);">Remaining</span><br><b style="font-size:14px; color:var(--danger)">₹${c.currentBalance.toFixed(0)}</b></div>
                </div>
                ${ownerProfitHtml}
                <div style="text-align:right; margin-top:12px;">
                    ${isMulti && c.history && c.history.length > 0 ? `<span onclick="toggleSelectAllHistory(${c.id})" style="background:rgba(255,255,255,0.05); padding:4px 10px; border-radius:6px; color:white; font-size:10px; font-weight:600; cursor:pointer; margin-right:8px;">${tLang.selectAll || 'Select All'}</span>` : ''}
                    <span onclick="toggleMultiDel(${c.id})" style="background:rgba(255,255,255,0.05); padding:4px 10px; border-radius:6px; color:${isMulti?'var(--text-muted)':'var(--accent-orange)'}; font-size:10px; font-weight:600; cursor:pointer;">${isMulti?'Cancel Selection':'Select Multiple'}</span>
                </div>
                <table class="view-table"><thead>${tableHead}</thead><tbody>${histHtml || `<tr><td colspan="${colSpanCount}" style="padding:20px; opacity:0.4;">No records</td></tr>`}</tbody></table>
            </div>
            <div class="btn-row" style="margin-top:15px;">
                <button class="s-btn" style="flex:1;" onclick="openEditModal(${c.id})">${tLang.editBtn || 'Edit'}</button>
                ${archiveAction}
                <button class="s-btn" style="flex:0.6; display:flex; align-items:center; justify-content:center; color:var(--danger); border-color:rgba(255,59,107,0.2); background:rgba(255,59,107,0.05);" onclick="deleteCustUI(${c.id})"><span style="font-size:14px;">🗑️</span></button>
                ${collectBtn}
            </div>
        </div>`;
    });
    if (currentTab === 'dash' && sName.trim() === '') {
        dash.innerHTML = `
        <div style="text-align:center; padding: 40px 20px; background:rgba(0,0,0,0.3); border-radius:20px; border:1px dashed rgba(255,255,255,0.05); margin-top:10px;">
            <div style="font-size:30px; margin-bottom:10px; opacity:0.6;">✨</div>
            <div style="font-size:14px; font-weight:600; color:white; margin-bottom:5px;">${i18n[currentLang].cleanDashTitle}</div>
            <div style="font-size:11px; color:var(--text-muted); line-height:1.5;">${i18n[currentLang].cleanDashSub}</div>
        </div>`;
    }
    document.getElementById('sum-cases').innerText = tC; document.getElementById('sum-principal').innerText = '₹' + tP.toLocaleString(); document.getElementById('sum-balance').innerText = '₹' + tB.toLocaleString();
}

function renderStats() {
    let mPrin = 0, dPrin = 0, meterPrin = 0, totalPrin = 0, totalBal = 0, totalRecovered = 0;
    let globalInvested = 0, globalProfit = 0; 

    db.filter(x => x.type !== 'config').forEach(c => {
        if(!isOwnerMode && c.isPersonal) return;
        // STRICT PRIVACY for Stats tab
        if(!isOwnerMode && (c.staffRef || '').trim().toLowerCase() !== deviceStaffName.toLowerCase()) return;
        
        // ARCHIVED CASE SAFEGUARD: Review Tab Portfolio & Balance
        if (!c.isArchived) {
            totalPrin += c.principal; 
            totalBal += c.currentBalance;
            if(c.type === 'monthly') mPrin += c.principal; 
            else if(c.type === 'meter') meterPrin += c.principal; 
            else dPrin += c.principal;
        }
        
        let paidThisCase = 0;
        if(c.history) {
            c.history.forEach(h => { let amt = parseFloat(h.paid); totalRecovered += amt; paidThisCase += amt; });
        }
        
        if(isOwnerMode) {
            globalInvested += c.principal;
            
            let tempBal = (c.type === 'monthly' || c.type === 'meter') ? c.principal : (c.totalPayable || c.principal);
            let cRatio = 0;
            if(c.type === 'daily') {
                cRatio = ((c.totalPayable || c.principal) - c.principal) / (c.totalPayable || c.principal);
                if (cRatio < 0) cRatio = 0;
            }

            if (c.type === 'monthly') {
                globalProfit += (c.principal * (c.rate || 0) / 100);
            }

            if(c.history) {
                let sortedHist = [...c.history].sort((a, b) => new Date(a.date) - new Date(b.date));
                sortedHist.forEach(h => {
                    let paid = parseFloat(h.paid);
                    if(c.type === 'monthly' || c.type === 'meter') {
                        let intDue = tempBal * (c.rate / 100);
                        if (paid <= intDue) {
                            globalProfit += paid;
                        } else {
                            globalProfit += intDue;
                            tempBal -= (paid - intDue);
                        }
                    } else {
                        globalProfit += (paid * cRatio);
                        tempBal -= paid;
                    }
                });
            }
        }
    });
    
    if(isOwnerMode) {
        document.getElementById('owner-invested').innerText = '₹' + globalInvested.toLocaleString(undefined, {maximumFractionDigits:0});
        document.getElementById('owner-profit').innerText = '₹' + globalProfit.toLocaleString(undefined, {maximumFractionDigits:0});
    }

    let mPerc = totalPrin ? (mPrin / totalPrin) * 100 : 33.33; let dPerc = totalPrin ? (dPrin / totalPrin) * 100 : 33.33; let meterPerc = totalPrin ? (meterPrin / totalPrin) * 100 : 33.34;
    let totalVal = totalRecovered + totalBal; let recPerc = totalVal ? (totalRecovered / totalVal) * 100 : 0; let remPerc = totalVal ? (totalBal / totalVal) * 100 : 100;
    const t = i18n[currentLang];
    document.getElementById('bar-m-prin').style.width = mPerc + '%'; document.getElementById('bar-d-prin').style.width = dPerc + '%'; document.getElementById('bar-meter-prin').style.width = meterPerc + '%';
    document.getElementById('txt-m-prin').innerText = `${t.monthly}: ₹${mPrin.toLocaleString()}`; 
    document.getElementById('txt-d-prin').innerText = `${t.daily}: ₹${dPrin.toLocaleString()}`; 
    document.getElementById('txt-meter-prin').innerText = `${t.meter}: ₹${meterPrin.toLocaleString()}`;
    document.getElementById('txt-recovered').innerText = `${t.recovered}: ₹${totalRecovered.toLocaleString()}`; 
    document.getElementById('txt-remaining').innerText = `${t.remaining}: ₹${totalBal.toLocaleString()}`;
}
