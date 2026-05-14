// --- FIREBASE SETUP ---
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

    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth(); 
    const database = firebase.database();
    // ----------------------

    // --- INDIAN TIMEZONE HELPER ---
    function getISTDate() {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date());
    }
    
    let db = JSON.parse(localStorage.getItem('paymitra_v11')) || [];
    let pin = ""; 
    let activeLoginPin = ""; 
    let currentPin = localStorage.getItem('paymitra_pin') || "2525"; 
    let secretPin = localStorage.getItem('paymitra_secret') || "1984"; 
    let isOwnerMode = false; 
    let deviceStaffName = ''; 
    let activeStaffPhoto = '';
    let currentTab = 'dash'; let openViews = {}; let multiDelMode = {}; 
    let confirmActionCallback = null;
    let isSaving = false;
    let lastGeneratedReportData = null;

    let activeCropper = null;
    let currentCropTarget = ''; 
    let lastCroppedBase64 = '';

    function formatDateDisplay(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return dateStr;
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
    }

    // Helper for End Date Calculation
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
        if(!src) return;
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

    // --- VIP TRASH BIN (RECYCLE LOGIC) ---
    function getTrash() {
        let tr = db.find(x => x.type === 'trash');
        if (!tr) {
            tr = { id: 'trash_bin', type: 'trash', cases: [], histories: [] };
            db.push(tr);
        }
        return tr;
    }

    let currentTrashTab = 'cases';
    let isTrashMulti = false;

    function openTrashModal() {
        closeModal('settings-modal');
        isTrashMulti = false;
        document.getElementById('trash-modal').style.display = 'flex';
        switchTrashTab('cases');
    }

    function switchTrashTab(tab) {
        currentTrashTab = tab;
        document.getElementById('tab-trash-cases').style.background = tab === 'cases' ? 'var(--accent-orange)' : 'rgba(255,255,255,0.05)';
        document.getElementById('tab-trash-cases').style.color = tab === 'cases' ? 'white' : 'var(--text-muted)';
        document.getElementById('tab-trash-entries').style.background = tab === 'entries' ? 'var(--accent-orange)' : 'rgba(255,255,255,0.05)';
        document.getElementById('tab-trash-entries').style.color = tab === 'entries' ? 'white' : 'var(--text-muted)';
        isTrashMulti = false;
        document.getElementById('btn-trash-multi').innerText = 'MULTI-SELECT';
        document.getElementById('trash-actions').style.display = 'none';
        renderTrash();
    }

    function toggleTrashMulti() {
        isTrashMulti = !isTrashMulti;
        document.getElementById('btn-trash-multi').innerText = isTrashMulti ? 'CANCEL' : 'MULTI-SELECT';
        document.getElementById('trash-actions').style.display = isTrashMulti ? 'flex' : 'none';
        renderTrash();
    }

    function renderTrash() {
        let tr = getTrash();
        let html = '';
        let list = currentTrashTab === 'cases' ? (tr.cases || []) : (tr.histories || []);

        if (!list || list.length === 0) {
            html = `<div style="text-align:center; color:var(--text-muted); font-size:12px; padding:30px; border:1px dashed rgba(255,255,255,0.1); border-radius:15px;">No deleted ${currentTrashTab} found.<br><br><b>All clear! 🚀</b></div>`;
        } else {
            list.forEach((item, i) => {
                let chkHtml = isTrashMulti ? `<input type="checkbox" class="trash-chk" value="${i}" style="width:18px;height:18px;accent-color:var(--accent-orange); flex-shrink:0;">` : '';
                let title = currentTrashTab === 'cases' ? `Case: ${item.name} (₹${item.principal})` : `Entry: ₹${item.paid} from ${item.caseName}`;
                let dateInfo = currentTrashTab === 'cases' ? `Case Given: ${formatDateDisplay(item.startDate)}` : `Paid Date: ${formatDateDisplay(item.date)}`;
                
                html += `
                <div style="display:flex; align-items:center; gap:12px; background:rgba(0,0,0,0.4); padding:15px; border-radius:12px; margin-bottom:8px; border-left: 3px solid var(--danger);">
                    ${chkHtml}
                    <div style="flex:1; min-width:0;">
                        <b style="color:white; font-size:13px; display:block;">${title}</b>
                        <span style="color:var(--text-muted); font-size:11px; display:block; margin-top:2px;">${dateInfo}</span>
                        <div style="background:rgba(255, 106, 0, 0.1); padding:4px 8px; border-radius:6px; display:inline-block; margin-top:6px;">
                            <span style="color:var(--accent-orange); font-size:10px; font-weight:700;">🗑️ Deleted by: ${item.deletedBy} on ${item.deletedAt}</span>
                        </div>
                    </div>
                    ${!isTrashMulti ? `
                    <div style="display:flex; flex-direction:column; gap:8px;">
                        <button onclick="restoreTrashItem(${i})" style="background:var(--success); border:none; border-radius:8px; padding:8px; font-size:14px; cursor:pointer;" title="Restore">🔄</button>
                        <button onclick="deleteTrashItem(${i})" style="background:var(--danger); border:none; border-radius:8px; padding:8px; font-size:14px; cursor:pointer;" title="Permanent Delete">✖</button>
                    </div>
                    ` : ''}
                </div>`;
            });
        }
        document.getElementById('trash-list-container').innerHTML = html;
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
        if(checks.length === 0) return showToast("Select items first!");
        let msg = action === 'restore' ? `Restore ${checks.length} items?` : `Permanently Delete ${checks.length} items?`;
        askConfirm(msg, () => {
            let indices = Array.from(checks).map(c => parseInt(c.value));
            processTrashAction(action, indices);
        });
    }

    function processTrashAction(action, indices) {
        let tr = getTrash();
        indices.sort((a,b) => b-a); 
        
        indices.forEach(idx => {
            if (currentTrashTab === 'cases') {
                if(!tr.cases) return;
                let item = tr.cases[idx];
                if (action === 'restore') {
                    delete item.deletedAt;
                    delete item.deletedBy;
                    db.push(item);
                }
                tr.cases.splice(idx, 1);
            } else {
                if(!tr.histories) return;
                let item = tr.histories[idx];
                if (action === 'restore') {
                    let targetCase = db.find(x => x.id === item.caseId && x.type !== 'config' && x.type !== 'trash');
                    if (targetCase) {
                        delete item.deletedAt;
                        delete item.deletedBy;
                        delete item.caseId;
                        delete item.caseName;
                        if(!targetCase.history) targetCase.history = [];
                        targetCase.history.push(item);
                        recalculateCase(targetCase);
                    } else {
                        showToast(`Skipped! Customer Case "${item.caseName}" not found. Restore case first.`);
                    }
                }
                tr.histories.splice(idx, 1);
            }
        });

        isTrashMulti = false;
        document.getElementById('btn-trash-multi').innerText = 'MULTI-SELECT';
        document.getElementById('trash-actions').style.display = 'none';
        saveAndRender();
        renderTrash();
        showToast(action === 'restore' ? "Restored Successfully! ✅" : "Space Cleared! 🗑️");
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
            archiveToast: "Case Archived!", unarchiveToast: "Case Restored!", staffRefPh: "Reference / Staff Name", lockSub: "Enter 4-Digit Login ID",
            refStatTitle: "👑 Reference Summary", refStatCases: "Total Accounts", refStatValue: "Total Value", refStatRec: "Recovered", refStatOut: "Outstanding",
            refStatCollection: "Daily Collection", refStatInterest: "Monthly Interest", refStatProfit: "Estimated Profit",
            repPendings: "⚠️ PENDING COLLECTIONS", caseDate: "Case Date",
            returnAmt: "Return Amt", principal: "Principal", totalPaid: "Total Paid", remainingAcc: "Remaining", payHistory: "Payment History",
            repNewDaily: "🆕 New Daily Cases", repNewMonthly: "🆕 New Monthly Cases", repNewMeter: "🆕 New Meter Cases",
            repRecDaily: "✅ Daily Recoveries", repRecMonthly: "✅ Monthly Recoveries", repRecMeter: "✅ Pending Collections (Meter)",
            repPendDaily: "⚠️ Pending Collections (Daily)", repPendMonthly: "⚠️ Pending Collections (Monthly)", repPendMeter: "⚠️ Pending Collections (Meter)",
            givenOn: "Given on", profitCut: "Profit Cut:", intRec: "Interest Received", monthsText: "Months", kishatsText: "Kishats", profitText: "Profit:", missedText: "Missed:", basisText: "BASIS", repTotal: "TOTAL:"
        },
        'hi': { 
            appSub: "नमस्ते 👋", sumPrin: "कुल मूलधन", sumCases: "कुल खाते", sumOut: "बकाया", 
            addTitle: "नया खाता बनाएं", namePh: "ग्राहक का नाम", amtPh: "मूलधन (Principal)", addBtn: "खाता जोड़ें", 
            navDash: "होम", navCust: "खाते", navBulk: "फास्ट ऐड", navStats: "रिव्यू", 
            setMainTitle: "ऐप सेटिंग्स", setBackup: "डेटा बैकअप", setRestore: "डेटा रिस्टor", setPinStaff: "स्टाफ PIN बदलें", setPinOwner: "मालिक PIN बदलें 👑", setLogout: "लॉगआउट", setClose: "बंद करें", 
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
            repTitle: "📅 तारीख के अनुसार रिपोर्ट", repBtn: "रिपोर्ट देखें", repGiven: "कुल दिया", repRet: "कुल रिकवरी", repProfit: "कमाया प्रॉफिट", repNoData: "इस तारीख में कोई डेटा नहीं।", repNewCases: "🆕 नए खाते (GIVEN)", repPayments: "✅ प्राप्त रिकवरी (RECEIVED)", advProfit: "Advance Profit (Cut)",
            archiveToast: "खाता आर्काइव हो गया!", unarchiveToast: "खाता वापस आ गया!", staffRefPh: "रेफरेंस / स्टाफ का नाम", lockSub: "4-अक्षरों की Login ID डालें",
            refStatTitle: "👑 रेफरेंस सारांश", refStatCases: "कुल खाते", refStatValue: "कुल वैल्यू", refStatRec: "प्राप्त", refStatOut: "बकाया",
            refStatCollection: "कुल रोज़ाना किश्त", refStatInterest: "कुल महीने का ब्याज", refStatProfit: "अनुमानित प्रॉफिट",
            repPendings: "⚠️ पेंडिंग कलेक्शन (PENDING)", caseDate: "केस तारीख",
            returnAmt: "वापसी रकम", principal: "मूलधन", totalPaid: "कुल जमा", remainingAcc: "बाकी", payHistory: "पेमेंट हिस्ट्री",
            repNewDaily: "🆕 नए रोज़ाना खाते", repNewMonthly: "🆕 नए महीने के खाते", repNewMeter: "🆕 नए मीटर खाते",
            repRecDaily: "✅ रोज़ाना रिकवरी", repRecMonthly: "✅ महीने की रिकवरी", repRecMeter: "✅ मीटर रिकवरी",
            repPendDaily: "⚠️ पेंडिंग कलेक्शन (रोज़ाना)", repPendMonthly: "⚠️ पेंडिंग कलेक्शन (महीना)", repPendMeter: "⚠️ पेंडिंग कलेक्शन (मीटर)",
            givenOn: "तारीख:", profitCut: "प्रॉफिट कट:", intRec: "ब्याज मिला", monthsText: "महीने", kishatsText: "किश्तें", profitText: "प्रॉफिट:", missedText: "छूटा:", basisText: "आधार", repTotal: "कुल जोड़:"
        },
        'pa': { 
            appSub: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ 👋", sumPrin: "ਕੁੱਲ ਰਕਮ", sumCases: "ਕੁੱਲ ਖਾਤੇ", sumOut: "ਬਕਾਇਆ", 
            addTitle: "ਨਵਾਂ ਖਾਤਾ ਬਣਾਓ", namePh: "ਗਾਹਕ ਦਾ ਨਾਮ", amtPh: "ਮੂਲ ਰਕਮ", addBtn: "ਖਾਤਾ ਜੋੜੋ", 
            navDash: "ਹੋਮ", navCust: "ਖਾਤੇ", navBulk: "ਫਾਸਟ ਐਡ", navStats: "ਰਿਵਿਊ", 
            setMainTitle: "ਐਪ ਸੈਟਿੰਗਜ਼", setBackup: "ਡਾਟਾ ਬੈਕਅੱਪ", setRestore: "ਡਾਟਾ ਰੀੀਸਟੋਰ", setPinStaff: "ਸਟਾਫ PIN ਬਦਲੋ", setPinOwner: "ਮਾਲਕ PIN ਬਦਲੋ 👑", setLogout: "ਲਾਗਆਉਟ", setClose: "ਬੰਦ ਕਰੋ", 
            searchPh: "ਨਾਮ ਖੋਜੋ...", cleanDashTitle: "ਕਲੀਨ ਡੈਸ਼ਬੋਰਡ", cleanDashSub: "ਖਾਤਾ ਦੇਖਣ ਲਈ ਉੱਪਰ ਨਾਮ ਖੋਜੋ।<br>ਪੂਰੀ ਸੂਚੀ ਲਈ <b>ਖਾਤੇ</b> टैਬ 'ਤੇ ਜਾਓ।", 
            bizPort: "ਕਾਰੋਬਾਰ ਪੋਰਟਫੋਲੀਓ", recStatus: "ਰਿਕਵਰੀ ਸਥਿਤੀ", monthly: "ਮਹੀਨਾਵਾਰ", daily: "ਰੋਜ਼ਾਨਾ", meter: "ਮੀਟਰ", recovered: "ਵਸੂਲੀ ਹੋਈ", remaining: "ਬਕਾਇਆ", 
            ownerGrowth: "👑 ਮੁਨਾਫਾ ਅਤੇ ਵਿਕਾਸ", totInvested: "ਕੁੱਲ ਨਿਵੇਸ਼", netProfit: "ਪ੍ਰਾਪਤ ਮੁਨਾਫਾ", ownerNote: "ਇਹ ਡਾਟਾ ਸਿਰਫ਼ ਮਾਲਕ ਲਈ ਹੈ, ਸਟਾਫ਼ ਤੋਂ ਲੁਕਿਆ ਹੋਇਆ ਹੈ।",
            refresh: "ਰिफ੍ਰਐਸ਼", totRetPh: "ਕੁੱਲ ਵਾਪਸੀ ਰਕਮ", totDaysPh: "ਕੁੱਲ ਦਿਨ", 
            allTypes: "ਸਾਰੀਆਂ ਕਿਸਮਾਂ", fDaily: "ਰੋਜ਼ਾਨਾ", fMonthly: "ਮਹੀਨਾਵਾਰ", fMeter: "ਮੀਟਰ", fArchived: "ਬੰਦ ਖਾਤੇ (Archived)",
            optDaily: "ਰੋਜ਼ਾਨਾ ਕਿਸ਼ਤ", optMonthly: "ਮਹੀਨੇ ਦਾ ਵਿਆਜ", optMeter: "ਮੀਟਰ (ਰੋਜ਼ਾਨਾ)", markPersonal: "👑 ਪਰਸਨਲ ਖਾਤਾ",
            sortNew: "ਨਵਾਂ ਪਹਿਲਾਂ ▼", sortOld: "ਪੁਰਾਣਾ ਪਹਿਲਾਂ ▲",
            delCaseMsg: "ਕੀ ਤੁਸੀਂ ਇਹ ਪੂਰਾ ਖਾਤਾ ਮਿਟਾਉਣਾ ਚਾਹੁੰਦੇ ਹੋ?", delCaseSuccess: "ਖਾਤਾ ਮਿਟਾ ਦਿੱਤਾ ਗਿਆ!", editBtn: "ਐਡਿਟ", recBtn: "ਪ੍ਰਾਪਤ ਕਰੋ", bulkBtn: "⚡ ਬਲਕ",
            bulkTitle: "ਬਲਕ ਐਂਟਰੀ", bulkStart: "ਸਤੰਬਰ ਮਿਤੀ", bulkEnd: "ਆਖਰੀ ਮਿਤੀ", bulkSubmit: "ਬਲਕ ਪ੍ਰੋਸੈਸ ਕਰੋ", bulkCancel: "ਰੱਦ ਕਰੋ", perMonthAmt: "ਹਰ ਮਹੀਨੇ ਦੀ ਰਕਮ (ਏ)", perDayAmt: "ਹਰ ਦਿਨ ਦੀ ਰਕਮ (ਏ)",
            autoBackupLabel: "ਆਟੋ ਬੈਕਅੱਪ ਫਾਈਲ", abNever: "ਕਦੇ ਨਹੀਂ", abDaily: "ਰੋਜ਼ਾਨਾ (ਐਪ ਖੁੱਲਣ 'ਤੇ)", abMonthly: "ਮਹੀਨੇ ਵਿੱਚ ਇੱਕ ਵਾਰ",
            repTitle: "📅 ਤਾਰੀਖ ਦੇ ਅਨੁਸਾਰ ਰਿਪੋਰਟ", repBtn: "ਰਿਪੋਰਟ ਦੇਖੋ", repGiven: "ਕੁੱਲ ਦਿੱਤਾ", repRet: "ਕੁੱਲ ਰਿਕਵਰੀ", repProfit: "ਕਮਾਇਆ ਮੁਨਾਫਾ", repNoData: "ਇਸ ਤਾਰੀਖ ਵਿੱਚ ਕੋਦਈ ਡਾਟਾ ਨਹੀਂ ਹੈ।", repNewCases: "🆕 ਨਵੇਂ ਖਾਤੇ (GIVEN)", repPayments: "✅ ਪ੍ਰਾਪਤ ਰਿਕਵਰੀ (RECEIVED)", advProfit: "ਐਡਵਾਂਸ ਮੁਨਾਫਾ (ਕਟੌਤੀ)",
            archiveToast: "ਖਾਤਾ ਆਰਕਾਈਵ ਹੋ ਗਿਆ!", unarchiveToast: "ਖਾਤਾ ਵਾਪਸ ਆ ਗਿਆ!", staffRefPh: "ਹਵਾਲਾ / ਸਟਾਫ ਦਾ ਨਾਮ", lockSub: "4- ਅੱਖਰਾਂ ਦੀ Login ID ਦਰਜ ਕਰੋ",
            refStatTitle: "👑 ਰੈਫਰੈਂਸ ਸਾਰਾਂਸ਼", refStatCases: "ਕੁੱਲ ਖਾਤੇ", refStatValue: "ਕੁੱਲ ਮੁੱਲ", refStatRec: "ਪ੍ਰਾਪਤ", refStatOut: "ਬਕਾਇਆ",
            refStatCollection: "ਕੁੱਲ ਰੋਜ਼ਾਨਾ ਕਿਸ਼ਤ", refStatInterest: "ਕੁੱਲ ਮਹੀਨਾਵਾਰ ਵਿਆਜ", refStatProfit: "ਅਨੁਮਾਨਿਤ ਮੁਨਾਫਾ",
            repPendings: "⚠️ ਬਕਾਇਆ ਕਿਸ਼ਤਾਂ (PENDING)", caseDate: "ਕੇਸ ਮਿਤੀ",
            returnAmt: "ਵਾਪਸੀ ਰਕਮ", principal: "ਮੂਲ ਰਕਮ", totalPaid: "ਕੁੱਲ ਜਮ੍ਹਾਂ", remainingAcc: "ਬਕਾਇਆ", payHistory: "ਭੁਗਤਾਨ ਦਾ ਇਤਿਹਾਸ",
            repNewDaily: "🆕 ਨਵੇਂ ਰੋਜ਼ਾਨਾ ਖਾਤੇ", repNewMonthly: "🆕 ਨਵੇਂ ਮਹੀਨੇ ਦੇ ਖਾਤੇ", repNewMeter: "🆕 ਨਵੇਂ ਮੀਟਰ ਖਾਤੇ",
            repRecDaily: "✅ ਰੋਜ਼ਾਨਾ ਰਿਕਵਰੀ", repRecMonthly: "✅ ਮਹੀਨੇ ਦੀ ਰਿਕਵਰੀ", repRecMeter: "✅ ਮੀਟਰ ਰਿਕਵਰੀ",
            repPendDaily: "⚠️ ਬਕਾਇਆ ਕਿਸ਼ਤਾਂ (ਰੋਜ਼ਾਨਾ)", repPendMonthly: "⚠️ ਬਕਾਇਆ ਕਿਸ਼ਤਾਂ (ਮਹੀਨਾਵਾਰ)", repPendMeter: "⚠️ ਬਕਾਇਆ ਕਿਸ਼ਤਾਂ (ਮੀਟਰ)",
            givenOn: "ਤारीख:", profitCut: "ਮੁਨਾਫਾ ਕੱਟਿਆ:", intRec: "ਵਿਆਜ ਮਿਲਿਆ", monthsText: "ਮਹੀਨੇ", kishatsText: "ਕਿਸ਼ਤਾਂ", profitText: "ਮੁਨਾਫਾ:", missedText: "ਛੱਡਿਆ:", basisText: "ਆਧਾਰ", repTotal: "ਕੁੱਲ ਜੋੜ:"
        }
    };
    
    let currentLang = localStorage.getItem('paymitra_lang') || 'en';
    let autoBackupFreq = localStorage.getItem('paymitra_autobackup') || 'never';

    window.onload = function() { 
        document.getElementById('lock-screen').style.display = 'flex'; 
        document.getElementById('main-app').style.display = 'none'; 
        if(document.getElementById('lang-select')) document.getElementById('lang-select').value = currentLang;
        if(document.getElementById('auto-backup-select')) document.getElementById('auto-backup-select').value = autoBackupFreq;
        
        let todayDate = getISTDate(); 
        if(document.getElementById('date')) document.getElementById('date').value = todayDate;
        if(document.getElementById('rep-start')) document.getElementById('rep-start').value = todayDate;
        if(document.getElementById('rep-end')) document.getElementById('rep-end').value = todayDate;
        applyLang();
        
        document.getElementById('t-lockSub').innerText = "Securing Connection... ⏳";
        
        auth.signInAnonymously().catch(function(error) {
            console.error("Security Auth Failed:", error);
            document.getElementById('t-lockSub').innerText = "Security Auth Failed. Please Refresh.";
        });

        auth.onAuthStateChanged(function(user) {
            if (user) {
                setupFirebaseListener();
            }
        });

        if (!document.getElementById('trash-modal')) {
            const trashHtml = `
            <div id="trash-modal" class="modal">
                <div class="modal-cont" style="max-width: 500px;">
                    <h3 style="margin-top:0; font-size:20px; font-weight:700; color:var(--text-main);">🗑️ Recycle Bin & Log</h3>
                    
                    <div style="display:flex; gap:10px; margin-bottom:15px;">
                        <button class="main-btn" id="tab-trash-cases" style="margin:0; padding:10px; font-size:12px; background:var(--accent-orange);" onclick="switchTrashTab('cases')">Deleted Cases</button>
                        <button class="main-btn" id="tab-trash-entries" style="margin:0; padding:10px; font-size:12px; background:rgba(255,255,255,0.05); color:white;" onclick="switchTrashTab('entries')">Deleted Entries</button>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <button onclick="toggleTrashMulti()" style="background:rgba(255,255,255,0.05); border:1px solid var(--card-border); color:white; font-size:10px; padding:6px 12px; border-radius:10px; font-weight:600;" id="btn-trash-multi">MULTI-SELECT</button>
                        
                        <div id="trash-actions" style="display:none; gap:5px;">
                            <button onclick="executeTrashAction('restore')" style="background:var(--success); border:none; color:black; font-size:10px; padding:6px 12px; border-radius:10px; font-weight:700;">RESTORE</button>
                            <button onclick="executeTrashAction('delete')" style="background:var(--danger); border:none; color:white; font-size:10px; padding:6px 12px; border-radius:10px; font-weight:700;">CLEAR PERMANENTLY</button>
                        </div>
                    </div>

                    <div id="trash-list-container" style="max-height: 350px; overflow-y: auto; padding-right: 5px;"></div>

                    <div style="display:flex; gap:10px; margin-top:20px;">
                        <button class="main-btn" style="background:rgba(255,255,255,0.05); color:white; box-shadow:none; margin:0;" onclick="closeModal('trash-modal')">Close Window</button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', trashHtml);
        }
        
        if (!document.getElementById('btn-trash')) {
            const btnHtml = `<button class="main-btn" id="btn-trash" style="background:rgba(138, 141, 152, 0.1); color:#8A8D98; box-shadow:none; display:none; margin-top:10px;" onclick="openTrashModal()">🗑️ Recycle Bin & Activity Log</button>`;
            let target = document.getElementById('btn-manage-staff');
            if(target) target.insertAdjacentHTML('afterend', btnHtml);
        }
    };

    function changeLang() { currentLang = document.getElementById('lang-select').value; localStorage.setItem('paymitra_lang', currentLang); applyLang(); render(); showToast("Language Updated!"); }
    function changeAutoBackup() { autoBackupFreq = document.getElementById('auto-backup-select').value; localStorage.setItem('paymitra_autobackup', autoBackupFreq); showToast("Auto Backup Saved!"); }

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

    function showToast(msg) { let t = document.getElementById('toast-box'); t.innerText = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); }
    function askConfirm(msg, callback) { document.getElementById('confirm-text').innerText = msg; confirmActionCallback = callback; document.getElementById('confirm-modal').style.display = 'flex'; }
    function executeConfirm() { if(confirmActionCallback) confirmActionCallback(); closeModal('confirm-modal'); confirmActionCallback = null; }
    function switchTab(tab) { currentTab = tab; openViews = {}; multiDelMode = {}; document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active')); document.getElementById('nav-' + tab).classList.add('active'); document.getElementById('section-summary').style.display = (tab === 'dash') ? 'grid' : 'none'; document.getElementById('section-add').style.display = (tab === 'dash') ? 'block' : 'none'; document.getElementById('section-stats').style.display = (tab === 'stats') ? 'block' : 'none'; document.getElementById('section-search').style.display = (tab === 'stats') ? 'none' : 'flex'; document.getElementById('section-sort').style.display = (tab === 'stats') ? 'none' : 'flex'; document.getElementById('dashboard').style.display = (tab === 'stats') ? 'none' : 'block'; if(document.getElementById('filter-box')) document.getElementById('filter-box').value = 'all'; if(document.getElementById('search-box')) document.getElementById('search-box').value = ''; if(document.getElementById('sort-box')) document.getElementById('sort-box').value = 'new'; if(tab === 'stats') { let todayDate = getISTDate(); // IST FIX
        document.getElementById('rep-start').value = todayDate; document.getElementById('rep-end').value = todayDate; if(document.getElementById('rep-type')) document.getElementById('rep-type').value = 'all'; if(document.getElementById('rep-search')) document.getElementById('rep-search').value = ''; document.getElementById('rep-results').style.display = 'none'; document.getElementById('rep-list').scrollTop = 0; window.scrollTo(0, 0); } render(); }
    function openSettings() { document.getElementById('settings-modal').style.display = 'flex'; }
    function closeModal(id) { document.getElementById(id).style.display = 'none'; }
    
    function toSquareBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const img = new Image();
                img.src = reader.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const size = 400; 
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
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
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
                    const max_size = 800; 
                    if (width > height) { if (width > max_size) { height *= max_size / width; width = max_size; } }
                    else { if (height > max_size) { width *= max_size / height; height = max_size; } }
                    canvas.width = width; canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
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
            const canvas = activeCropper.getCroppedCanvas({ width: 400, height: 400, fillColor: '#fff' });
            if (!canvas) return showToast("Cropping failed. Try again.");
            lastCroppedBase64 = canvas.toDataURL('image/jpeg', 0.8);
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
        } catch(e) {
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

    // VIP FIX: Logout par cache clear aur Firebase disconnect
    function logout() { 
        document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); 
        document.getElementById('main-app').style.display = 'none'; 
        document.getElementById('lock-screen').style.display = 'flex'; 
        
        // Disconnect from Firebase to stop background downloads
        try {
            database.ref('credix_db').off(); 
        } catch(e) { console.log(e); }

        resetPin(); 
        isOwnerMode = false; 
        deviceStaffName = ''; 
        activeStaffPhoto = '';
        activeLoginPin = ""; 
        currentLang = 'en'; 
        localStorage.setItem('paymitra_lang', 'en'); 
        if(document.getElementById('lang-select')) document.getElementById('lang-select').value = 'en'; 
        applyLang(); 
        if(document.getElementById('filter-box')) document.getElementById('filter-box').value = 'all'; 
        if(document.getElementById('search-box')) document.getElementById('search-box').value = ''; 
        if(document.getElementById('sort-box')) document.getElementById('sort-box').value = 'new'; 
        document.getElementById('profile-icon-area').innerHTML = '⚙️';
        switchTab('dash'); 
    }
    
    function validateSession(newDb) { if (isOwnerMode || deviceStaffName === '' || deviceStaffName === 'Default Staff') return true; let conf = newDb.find(x => x.type === 'config'); if (!conf || !conf.staffList) return true; let isValid = conf.staffList.some(s => s.name === deviceStaffName && s.pin === activeLoginPin); if (!isValid) { logout(); setTimeout(() => showToast("Access Revoked / PIN Changed!"), 500); return false; } return true; }
    
    function openStaffModal() { closeModal('settings-modal'); renderStaffList(); document.getElementById('staff-modal').style.display = 'flex'; }
    
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

    function renderStaffList() { 
        let conf = getConfig(); 
        let html = ''; 
        if (conf.staffList.length === 0) { 
            html = '<div style="color:var(--text-muted); font-size:12px; text-align:center;">No staff added yet.</div>'; 
        } else { 
            conf.staffList.forEach((s, i) => { 
                const photoHtml = s.photo ? `<img src="${s.photo}" style="width:32px; height:32px; border-radius:50%; object-fit:cover; border:1px solid var(--accent-orange);">` : `<div style="width:32px; height:32px; border-radius:50%; background:rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:center; font-size:14px;">👤</div>`;
                html += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:10px; border-radius:12px; margin-bottom:8px; font-size:14px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        ${photoHtml}
                        <div>
                            <b style="color:white;">${s.name}</b> 
                            <span style="color:var(--accent-orange); font-size:11px; margin-left:5px; font-weight:700;">[ID: ${s.pin}]</span>
                        </div>
                    </div>
                    <div>
                        <span onclick="openEditStaffProfile(${i})" style="color:var(--owner-gold); cursor:pointer; font-size:16px; margin-right:12px;">✏️</span>
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
        if (conf.staffList.some(s => s.pin === pinVal) || pinVal === secretPin) { return showToast("This ID is already taken!"); } 
        let photo = (currentCropTarget === 'staff-add' && lastCroppedBase64) ? lastCroppedBase64 : "";
        conf.staffList.push({ name: name, pin: pinVal, photo: photo }); 
        saveAndRender(); 
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
        if(conf.staffList[idx].photo) {
            previewImg.src = conf.staffList[idx].photo;
            previewWrap.style.display = 'flex';
        } else {
            previewWrap.style.display = 'none';
        }
        document.getElementById('edit-staff-pin-modal').style.display = 'flex'; 
    }
    
    function saveStaffProfile() { 
        let idx = document.getElementById('edit-staff-idx').value; 
        let newName = document.getElementById('edit-staff-new-name').value.trim();
        let newPin = document.getElementById('edit-staff-new-pin').value.trim(); 
        if(!newName || newPin.length !== 4) return showToast("Name & 4-Digit ID required!"); 
        let conf = getConfig(); 
        if(conf.staffList.some((s, i) => s.pin === newPin && i != idx) || newPin === secretPin) { return showToast("This ID is already taken!"); } 
        conf.staffList[idx].name = newName;
        conf.staffList[idx].pin = newPin; 
        if (currentCropTarget === 'staff-edit' && lastCroppedBase64) {
            conf.staffList[idx].photo = lastCroppedBase64;
        } else if (window._pendingStaffPhotoRemoval) {
            conf.staffList[idx].photo = "";
        }
        saveAndRender(); 
        renderStaffList(); 
        closeModal('edit-staff-pin-modal'); 
        showToast("Staff Profile Updated!"); 
    }

    function deleteStaff(idx) { 
        askConfirm("Delete this staff account? They will be logged out instantly.", () => { 
            let conf = getConfig(); 
            conf.staffList.splice(idx, 1); 
            saveAndRender(); 
            renderStaffList(); 
            showToast("Staff Account Deleted!");
        }); 
    }

    function openSecretPinModal() { closeModal('settings-modal'); document.getElementById('old-secret-pin').value = ''; document.getElementById('new-secret-pin').value = ''; document.getElementById('secret-pin-modal').style.display = 'flex'; }
    function saveSecretPin() { let oldP = document.getElementById('old-secret-pin').value; let newP = document.getElementById('new-secret-pin').value; if(oldP === secretPin) { if(newP.trim() !== '') { secretPin = newP; localStorage.setItem('paymitra_secret', secretPin); showToast("Owner PIN Updated 👑!"); closeModal('secret-pin-modal'); } } else { showToast("Incorrect Old Owner PIN!"); } }
    function exportData() { let d = new Date(); let dateStr = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,'0') + "-" + String(d.getDate()).padStart(2,'0') + "_" + String(d.getHours()).padStart(2,'0') + "-" + String(d.getMinutes()).padStart(2,'0'); let fileName = "CredixBackup_" + dateStr + ".json"; let a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(db)], {type: "application/json"})); a.download = fileName; a.click(); }
    function importData() { let i = document.createElement('input'); i.type = 'file'; i.onchange = e => { let r = new FileReader(); r.onload = () => { try { db = JSON.parse(r.result); saveAndRender(); closeModal('settings-modal'); showToast("Data Restored!"); } catch(err) { showToast("Invalid Backup File"); } }; r.readAsText(e.target.files[0]); }; i.click(); }
    
    // --- GLASS UI LOCK SCREEN LOGIC WITH VIBRATION ---
    function triggerShakeLock() { const dotsContainer = document.getElementById('dots-container'); if(dotsContainer) { dotsContainer.classList.remove('shake'); void dotsContainer.offsetWidth; dotsContainer.classList.add('shake'); } }
    function press(n) { if(pin.length < 4) { if (navigator.vibrate) navigator.vibrate(20); pin += n; let d = document.getElementById('d' + pin.length); if(d) d.classList.add('active'); } }
    function resetPin() { pin = ""; for(let i=1; i<=4; i++) { let d = document.getElementById('d'+i); if(d) d.classList.remove('active'); } }
    function deletePinChar() { if(pin.length > 0) { if (navigator.vibrate) navigator.vibrate(20); let d = document.getElementById('d' + pin.length); if(d) d.classList.remove('active'); pin = pin.slice(0, -1); } }
    
    function checkPin() { 
        let conf = getConfig(); if (navigator.vibrate) navigator.vibrate(30);
        if (pin === secretPin || pin === "1984") { 
            isOwnerMode = true; 
            deviceStaffName = "Owner"; 
            activeStaffPhoto = "";
            activeLoginPin = pin; 
            showToast("Owner Mode Unlocked 👑"); unlockApp(); 
        } else { 
            let staffMatch = conf.staffList.find(s => s.pin === pin); 
            if (staffMatch) { 
                isOwnerMode = false; 
                deviceStaffName = staffMatch.name; 
                activeStaffPhoto = staffMatch.photo || "";
                activeLoginPin = pin; 
                showToast(`Welcome ${deviceStaffName} 👋`); unlockApp(); 
            } else if (pin === currentPin && conf.staffList.length === 0) { 
                isOwnerMode = false; 
                deviceStaffName = "Default Staff"; 
                activeStaffPhoto = "";
                activeLoginPin = pin; 
                showToast("Staff Mode Active"); unlockApp(); 
            } else { 
                triggerShakeLock();
                showToast("Invalid ID / PIN"); resetPin(); 
            } 
        } 
    }

    function checkAutoBackup() { 
        if(autoBackupFreq === 'never' || db.length === 0) return; 
        let todayStr = getISTDate(); // IST FIX
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
        if(document.getElementById('filter-box')) document.getElementById('filter-box').value = 'all';
        if(document.getElementById('search-box')) document.getElementById('search-box').value = '';
        if(document.getElementById('sort-box')) document.getElementById('sort-box').value = 'new';
        const profArea = document.getElementById('profile-icon-area');
        if (activeStaffPhoto) {
            profArea.innerHTML = `<img src="${activeStaffPhoto}" style="width:100%; height:100%; border-radius:50%; object-fit:cover; border:1px solid var(--accent-orange);">`;
        } else {
            profArea.innerHTML = '⚙️';
        }
        if(isOwnerMode) {
            document.getElementById('owner-badge').style.display = 'block';
            document.getElementById('owner-title-badge').style.display = 'inline';
            document.getElementById('personal-wrap').style.display = 'flex';
            document.getElementById('btn-owner-pin').style.display = 'block';
            document.getElementById('btn-manage-staff').style.display = 'block';
            document.getElementById('owner-analytics').style.display = 'block';
            document.getElementById('wrap-staff-ref').style.display = 'flex'; 
            document.getElementById('rep-search-wrap').style.display = 'flex'; 
            if(document.getElementById('btn-trash')) document.getElementById('btn-trash').style.display = 'block';
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
            if(document.getElementById('btn-trash')) document.getElementById('btn-trash').style.display = 'none';
            document.getElementById('t-appSub').innerText = `Welcome ${deviceStaffName} 👋`;
        }
        
        // VIP FIX: App unlock hone par hi database connect hoga
        try {
            database.ref('credix_db').off(); 
        } catch(e) {}
        setupFirebaseListener();
        
        render(); checkAutoBackup();
    }

    function setupFirebaseListener() {
        // App khulte hi phone ki memory wala data check karo
        let cachedDb = [];
        try {
            cachedDb = JSON.parse(localStorage.getItem('paymitra_v11')) || [];
        } catch(e) {}
        
        if (cachedDb.length > 0) {
            db = cachedDb;
            window.lastSyncedDbStr = JSON.stringify(db);
        }

        database.ref('credix_db').on('value', (snapshot) => {
            if(snapshot.exists()) {
                let newDb = snapshot.val();
                if (!Array.isArray(newDb)) newDb = Object.values(newDb);
                newDb.forEach(item => { if(item.type !== 'config' && item.type !== 'trash' && !item.history) item.history = []; });
                
                // VIP FIX: Agar local aur naya data alag hai, tabhi update karo
                if (JSON.stringify(newDb) !== JSON.stringify(db)) {
                    if (document.getElementById('main-app').style.display === 'none') {
                        db = newDb;
                        localStorage.setItem('paymitra_v11', JSON.stringify(db));
                        window.lastSyncedDbStr = JSON.stringify(db); 
                        document.getElementById('t-lockSub').innerText = i18n[currentLang].lockSub;
                    } else {
                        if (!isSaving) {
                            if(!validateSession(newDb)) return;
                            db = newDb;
                            localStorage.setItem('paymitra_v11', JSON.stringify(db));
                            window.lastSyncedDbStr = JSON.stringify(db); 
                            render();
                            
                            if (document.getElementById('trash-modal') && document.getElementById('trash-modal').style.display === 'flex') {
                                renderTrash();
                            }
                            showToast("Data Auto-Updated!");
                        }
                    }
                }
            } else {
                document.getElementById('t-lockSub').innerText = i18n[currentLang].lockSub;
            }
            document.getElementById('sync-status').innerText = "Cloud Synced";
            document.getElementById('cloud-indicator').className = "status-dot";
        }, (error) => {
            document.getElementById('sync-status').innerText = "Offline Mode";
            document.getElementById('cloud-indicator').className = "status-dot offline";
            document.getElementById('t-lockSub').innerText = i18n[currentLang].lockSub;
        });
    }

    function hardRefresh() { 
        document.getElementById('sync-status').innerText = "Syncing...";
        database.ref('credix_db').once('value').then(() => {
            document.getElementById('sync-status').innerText = "Cloud Synced";
            showToast("Sync Successful!");
        }).catch(() => {
            document.getElementById('sync-status').innerText = "Offline Mode";
        });
    }

    function saveAndRender() {
        isSaving = true;
        let currentDbStr = JSON.stringify(db);
        localStorage.setItem('paymitra_v11', currentDbStr);
        render();
        document.getElementById('sync-status').innerText = "Saving to Cloud...";
        document.getElementById('cloud-indicator').className = "status-dot";
        
        let oldDb = [];
        try { oldDb = JSON.parse(window.lastSyncedDbStr || "[]"); } catch(e) { oldDb = []; }
        
        const successCb = () => {
            window.lastSyncedDbStr = currentDbStr; 
            document.getElementById('sync-status').innerText = "Cloud Synced";
            document.getElementById('cloud-indicator').className = "status-dot";
            isSaving = false;
        };
        const errCb = (e) => {
            document.getElementById('sync-status').innerText = "Saved Offline";
            document.getElementById('cloud-indicator').className = "status-dot offline";
            isSaving = false;
        };

        if (oldDb.length === 0) {
            database.ref('credix_db').set(db).then(successCb).catch(errCb);
        } else {
            let updates = {};
            let hasChanges = false;
            let maxLen = Math.max(oldDb.length, db.length);
            
            for (let i = 0; i < maxLen; i++) {
                let oldItem = oldDb[i];
                let newItem = db[i];
                
                if (!oldItem && newItem) {
                    updates[i] = newItem; 
                    hasChanges = true;
                } else if (oldItem && !newItem) {
                    updates[i] = null; 
                    hasChanges = true;
                } else if (JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
                    for (let key in newItem) {
                        if (JSON.stringify(newItem[key]) !== JSON.stringify(oldItem[key])) {
                            updates[i + '/' + key] = newItem[key]; 
                            hasChanges = true;
                        }
                    }
                    for (let key in oldItem) {
                        if (!(key in newItem)) {
                            updates[i + '/' + key] = null;
                            hasChanges = true;
                        }
                    }
                }
            }
            
            if (hasChanges) {
                database.ref('credix_db').update(updates).then(successCb).catch(errCb);
            } else {
                successCb();
            }
        }
    }

    function autoCalc() { let type = document.getElementById('type').value; let amt = parseFloat(document.getElementById('amt').value) || 0; if(type === 'meter' && amt > 0) { document.getElementById('meter-amt').value = (amt * 0.01).toFixed(0); } else if (type === 'meter') { document.getElementById('meter-amt').value = ''; } }
    function toggleFields() { const t = document.getElementById('type').value; document.getElementById('m-fields').style.display = t === 'monthly' ? 'block' : 'none'; document.getElementById('d-fields').style.display = t === 'daily' ? 'block' : 'none'; document.getElementById('meter-fields').style.display = t === 'meter' ? 'block' : 'none'; autoCalc(); }
    function triggerShake(id) { let el = document.getElementById(id); if(el) { let group = el.closest('.input-group'); if(group) { group.classList.add('shake-error'); setTimeout(() => group.classList.remove('shake-error'), 400); } } }

    function recalculateCase(c) { 
        if(!c.history) c.history = []; 
        c.history.sort((a, b) => (a.date > b.date ? 1 : -1)); 
        let tempBal = (c.type === 'monthly' || c.type === 'meter') ? c.principal : (c.totalPayable || c.principal); 
        c.history.forEach(h => { 
            if(c.type === 'monthly' || c.type === 'meter') { 
            } else { 
                tempBal -= h.paid; 
            } 
            h.balance = tempBal; 
            h.bal = tempBal.toFixed(0); 
        }); 
        c.currentBalance = tempBal; 
    }

    async function addCustomer() {
        const tLang = i18n[currentLang];
        const type = document.getElementById('type').value, name = document.getElementById('name').value, amt = parseFloat(document.getElementById('amt').value), date = document.getElementById('date').value;
        const staffRef = isOwnerMode ? document.getElementById('staff-ref').value.trim() : deviceStaffName;
        const isPersonal = document.getElementById('is-personal') ? document.getElementById('is-personal').checked : false;
        if(!name) { triggerShake('name'); return showToast(tLang.missingNameAmt || "Missing Name!"); }
        if(isNaN(amt) || amt <= 0) { triggerShake('amt'); return showToast(tLang.missingNameAmt || "Missing Principal!"); }
        let photoBase64 = "";
        if (lastCroppedBase64) {
            photoBase64 = lastCroppedBase64;
        } 
        else {
            const fileInput = document.getElementById('cust-photo');
            if (fileInput.files && fileInput.files[0]) {
                photoBase64 = await toSquareBase64(fileInput.files[0]);
            }
        }
        let cust = { id: Date.now(), name, principal: amt, type, startDate: date, history: [], staffRef: staffRef, isPersonal: isPersonal, isArchived: false, photo: photoBase64 };
        if(type === 'monthly') { 
            let rateVal = parseFloat(document.getElementById('rate').value);
            if(isNaN(rateVal)) { triggerShake('rate'); return showToast(tLang.missingRate || "Missing Interest Rate!"); }
            cust.rate = rateVal; cust.currentBalance = amt; 
        } else if (type === 'meter') { 
            let mAmt = parseFloat(document.getElementById('meter-amt').value);
            if(isNaN(mAmt)) { triggerShake('meter-amt'); return showToast(tLang.missingMeter || "Missing Rozana Vyaj!"); }
            cust.rate = (mAmt / amt) * 100; cust.currentBalance = amt; 
        } else { 
            let tRet = parseFloat(document.getElementById('total_ret').value);
            let dVals = parseInt(document.getElementById('days').value);
            if(isNaN(tRet)) { triggerShake('total_ret'); return showToast(tLang.missingRet || "Missing Return Amount!"); }
            if(isNaN(dVals) || dVals <= 0) { triggerShake('days'); return showToast(tLang.missingDays || "Missing Total Days!"); }
            cust.totalPayable = tRet; cust.currentBalance = cust.totalPayable; cust.installment = cust.totalPayable / dVals; 
        }
        db.push(cust); saveAndRender(); 
        document.getElementById('name').value = ''; document.getElementById('amt').value = ''; document.getElementById('staff-ref').value = '';
        document.getElementById('cust-photo').value = '';
        lastCroppedBase64 = ''; 
        if(document.getElementById('total_ret')) document.getElementById('total_ret').value = '';
        if(document.getElementById('days')) document.getElementById('days').value = '';
        if(document.getElementById('meter-amt')) document.getElementById('meter-amt').value = '';
        showToast("Record Created!");
    }

    function toggleView(id) { 
        const viewEl = document.getElementById('view-' + id);
        if (!viewEl) return;
        if (openViews[id]) { 
            delete openViews[id]; 
            multiDelMode[id] = false; 
            viewEl.style.display = 'none';
        } else { 
            openViews[id] = true; 
            viewEl.style.display = 'block';
        } 
    }

    function toggleMultiDel(id) { multiDelMode[id] = !multiDelMode[id]; render(); }
    function toggleSelectAllHistory(id) { let checks = document.querySelectorAll(`.del-chk-${id}`); let allChecked = Array.from(checks).every(ck => ck.checked); checks.forEach(ck => ck.checked = !allChecked); }
    
    function openPayModal(id) { 
        let c = db.find(x => x.id === id); 
        document.getElementById('pay-id').value = id; 
        document.getElementById('pay-date').value = getISTDate(); // IST FIX
        let amt = c.type === 'monthly' ? (c.currentBalance * (c.rate||0)/100) : (c.type === 'meter' ? (c.currentBalance * (c.rate||0)/100) : (c.installment || 0)); 
        document.getElementById('pay-amt').value = amt.toFixed(0); 
        document.getElementById('pay-modal').style.display = 'flex'; 
    }

    function savePayment() { let id = parseInt(document.getElementById('pay-id').value); let c = db.find(x => x.id === id); let amt = parseFloat(document.getElementById('pay-amt').value); let dateStr = document.getElementById('pay-date').value; if(!amt || !dateStr) { triggerShake('pay-amt'); return showToast("Valid data required"); } if(c.history && c.history.some(h => h.date === dateStr)) { triggerShake('pay-date'); return showToast(i18n[currentLang].dupEntry || "Payment already added for this date!"); } c.history.push({ date: dateStr, paid: amt }); recalculateCase(c); saveAndRender(); closeModal('pay-modal'); showToast("Payment Saved"); }
    
    function openBulkModal(id) { 
        let c = db.find(x => x.id === id); 
        document.getElementById('bulk-id').value = id; 
        let todayStr = getISTDate(); // IST FIX
        document.getElementById('bulk-start-date').value = todayStr; 
        document.getElementById('bulk-end-date').value = todayStr; 
        let amt = c.type === 'monthly' ? (c.principal * (c.rate||0)/100) : (c.type === 'meter' ? (c.principal * 0.01) : (c.installment || 0)); 
        document.getElementById('bulk-amt').value = amt.toFixed(0); 
        const t = i18n[currentLang]; const freqText = c.type === 'monthly' ? t.fMonthly : (c.type === 'meter' ? t.fMeter : t.fDaily); 
        document.getElementById('bulk-freq-label').innerText = `(${freqText})`; 
        document.getElementById('bulk-amt-label').innerText = c.type === 'monthly' ? t.perMonthAmt : t.perDayAmt; 
        document.getElementById('bulk-modal').style.display = 'flex'; 
    }

    function saveBulkPayment() { let id = parseInt(document.getElementById('bulk-id').value); let c = db.find(x => x.id === id); let amt = parseFloat(document.getElementById('bulk-amt').value); let startStr = document.getElementById('bulk-start-date').value; let endStr = document.getElementById('bulk-end-date').value; if(!amt || !startStr || !endStr) { triggerShake('bulk-amt'); return; } let startDate = new Date(startStr); let endDate = new Date(endStr); if(endDate < startDate) return showToast("End date must be later"); let tempDate = new Date(startDate); let hasDuplicate = false; while(tempDate <= endDate) { let y = tempDate.getFullYear(); let m = String(tempDate.getMonth() + 1).padStart(2, '0'); let d = String(tempDate.getDate()).padStart(2, '0'); let pushDate = `${y}-${m}-${d}`; if(c.history && c.history.some(h => h.date === pushDate)) { hasDuplicate = true; break; } if(c.type === 'monthly') tempDate.setMonth(tempDate.getMonth() + 1); else tempDate.setDate(tempDate.getDate() + 1); } if(hasDuplicate) { triggerShake('bulk-start-date'); triggerShake('bulk-end-date'); return showToast(i18n[currentLang].dupEntry || "Payment already added for this date!"); } let currentDate = new Date(startDate); while(currentDate <= endDate) { let y = currentDate.getFullYear(); let m = String(currentDate.getMonth() + 1).padStart(2, '0'); let d = String(currentDate.getDate()).padStart(2, '0'); let pushDate = `${y}-${m}-${d}`; c.history.push({ date: pushDate, paid: amt }); if(c.type === 'monthly') currentDate.setMonth(currentDate.getMonth() + 1); else currentDate.setDate(currentDate.getDate() + 1); } recalculateCase(c); saveAndRender(); closeModal('bulk-modal'); showToast("Bulk Saved!"); }
    
    function removeEditPhoto() {
        document.getElementById('edit-photo-preview-wrap').style.display = 'none';
        document.getElementById('edit-photo-preview').src = '';
        window._pendingPhotoRemoval = true;
    }

    function openEditModal(id) { 
        window._pendingPhotoRemoval = false;
        lastCroppedBase64 = ''; 
        let c = db.find(x => x.id === id); 
        document.getElementById('edit-id').value = id; 
        document.getElementById('edit-name').value = c.name; 
        document.getElementById('edit-staff-ref').value = c.staffRef || ''; 
        document.getElementById('edit-date').value = c.startDate; 
        document.getElementById('edit-amt').value = c.principal; 
        const previewWrap = document.getElementById('edit-photo-preview-wrap');
        const previewImg = document.getElementById('edit-photo-preview');
        if(c.photo) { 
            previewImg.src = c.photo; 
            previewWrap.style.display = 'flex'; 
        } else { 
            previewWrap.style.display = 'none'; 
        }
        document.getElementById('edit-photo-input').value = '';
        if(c.type === 'monthly') { document.getElementById('edit-extra-label').innerText = "Monthly Rate (%)"; document.getElementById('edit-extra').value = c.rate; document.getElementById('edit-ret-wrap').style.display = 'none'; } else if(c.type === 'meter') { document.getElementById('edit-extra-label').innerText = "Rozana Vyaj Amount (₹)"; document.getElementById('edit-extra').value = (c.principal * c.rate / 100).toFixed(0); document.getElementById('edit-ret-wrap').style.display = 'none'; } else { document.getElementById('edit-extra-label').innerText = "Kishat Amount (₹)"; document.getElementById('edit-extra').value = c.installment; document.getElementById('edit-ret-wrap').style.display = 'block'; document.getElementById('edit-ret').value = c.totalPayable || c.principal; } if(isOwnerMode) { document.getElementById('edit-staff-wrap').style.display = 'block'; document.getElementById('edit-personal-wrap').style.display = 'flex'; document.getElementById('edit-is-personal').checked = !!c.isPersonal; } else { document.getElementById('edit-staff-wrap').style.display = 'none'; document.getElementById('edit-personal-wrap').style.display = 'none'; } 
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
        if (lastCroppedBase64) { 
            c.photo = lastCroppedBase64; 
        } 
        else if (window._pendingPhotoRemoval) { 
            c.photo = ""; 
        } 
        else { 
            const fileInput = document.getElementById('edit-photo-input'); 
            if (fileInput.files && fileInput.files[0]) { 
                c.photo = await toSquareBase64(fileInput.files[0]); 
            } 
        }
        if(isOwnerMode) { c.staffRef = document.getElementById('edit-staff-ref').value.trim(); c.isPersonal = document.getElementById('edit-is-personal').checked; } let dateVal = document.getElementById('edit-date').value; if (dateVal) c.startDate = dateVal; let amtVal = parseFloat(document.getElementById('edit-amt').value); if (!isNaN(amtVal)) c.principal = amtVal; let extra = parseFloat(document.getElementById('edit-extra').value); if(c.type === 'monthly') c.rate = !isNaN(extra) ? extra : oldRate; else if(c.type === 'meter') c.rate = !isNaN(extra) && c.principal ? (extra / c.principal) * 100 : oldRate; else { c.installment = !isNaN(extra) ? extra : oldInstallment; let retInput = document.getElementById('edit-ret'); if (retInput && retInput.value) { let parsedRet = parseFloat(retInput.value); c.totalPayable = !isNaN(parsedRet) ? parsedRet : (oldTotalPayable || c.principal); } else c.totalPayable = oldTotalPayable || c.principal; } 
        recalculateCase(c); 
        closeModal('edit-modal'); 
        saveAndRender(); 
        lastCroppedBase64 = ''; 
        showToast("Account Updated ✅"); 
    }
    
    // --- UPDATED DELETE ACTIONS TO USE RECYCLE BIN ---
    function deleteCustUI(id) { 
        askConfirm("Move this entire account to Recycle Bin?", () => { 
            let cIndex = db.findIndex(x => x.id === id);
            if(cIndex > -1) {
                let c = db[cIndex];
                let tr = getTrash();
                if (!tr.cases) tr.cases = []; // FIREBASE EMPTY ARRAY FIX
                let nowStr = getISTDate() + " " + new Date().toLocaleTimeString('en-US', {hour12: true, hour: "numeric", minute: "numeric"});
                tr.cases.push({ ...c, deletedAt: nowStr, deletedBy: deviceStaffName });
                db.splice(cIndex, 1);
                saveAndRender(); 
                showToast("Account Moved to Recycle Bin! 🗑️"); 
            }
        }); 
    }

    function deleteHistoryUI(custId, originalIndex) { 
        askConfirm("Move this entry to Recycle Bin?", () => { 
            let c = db.find(x => x.id === custId); 
            let tr = getTrash();
            if (!tr.histories) tr.histories = []; // FIREBASE EMPTY ARRAY FIX
            let nowStr = getISTDate() + " " + new Date().toLocaleTimeString('en-US', {hour12: true, hour: "numeric", minute: "numeric"});
            let deletedEntry = c.history[originalIndex];
            tr.histories.push({ ...deletedEntry, caseId: c.id, caseName: c.name, deletedAt: nowStr, deletedBy: deviceStaffName });
            c.history.splice(originalIndex, 1); 
            recalculateCase(c); 
            saveAndRender(); 
            showToast("Entry Moved to Recycle Bin! 🗑️"); 
        }); 
    }

    function deleteSelectedHistoryUI(id) { 
        let checks = document.querySelectorAll(`.del-chk-${id}:checked`); 
        if(checks.length === 0) return toggleMultiDel(id); 
        askConfirm(`Move ${checks.length} entries to Recycle Bin?`, () => { 
            let c = db.find(x => x.id === id); 
            let tr = getTrash();
            if (!tr.histories) tr.histories = []; // FIREBASE EMPTY ARRAY FIX
            let nowStr = getISTDate() + " " + new Date().toLocaleTimeString('en-US', {hour12: true, hour: "numeric", minute: "numeric"});
            let indices = Array.from(checks).map(ck => parseInt(ck.value)).sort((a,b) => b-a); 
            indices.forEach(idx => { 
                let deletedEntry = c.history[idx];
                tr.histories.push({ ...deletedEntry, caseId: c.id, caseName: c.name, deletedAt: nowStr, deletedBy: deviceStaffName });
                c.history.splice(idx, 1); 
            }); 
            multiDelMode[id] = false; 
            recalculateCase(c); 
            saveAndRender(); 
            showToast("Selected Moved to Recycle Bin! 🗑️"); 
        }); 
    }

    function toggleArchiveUI(id) { let c = db.find(x => x.id === id); let isArchiving = !c.isArchived; let msg = isArchiving ? "Move to Archive (Closed Cases)?" : "Restore to Active Cases?"; askConfirm(msg, () => { c.isArchived = isArchiving; saveAndRender(); showToast(isArchiving ? (i18n[currentLang].archiveToast || "Archived!") : (i18n[currentLang].unarchiveToast || "Unarchived!")); }); }

    function generateCustomerPDF(id) {
        const { jsPDF } = window.jspdf;
        const c = db.find(x => x.id === id);
        if(!c) return;
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
        if(c.staffRef) doc.text(`Ref: ${c.staffRef}`, 120, 54);
        const tableData = []; let totalPaid = 0;
        if(c.history) {
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

    // VIP FIX: GENERATE REPORT WITH CASH OUT LOGIC (APP UI MEIN 15000, OWNER PDF MEIN 13500)
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
            
            // VIP FIX: Cash Out deduction for Monthly ONLY FOR OWNER PDF
            if (c.startDate >= start && c.startDate <= end) {
                let cCopy = {...c};
                let actualCashGiven = c.principal;

                if (c.type === 'monthly') {
                    let upfrontProfit = c.principal * ((c.rate || 0) / 100);
                    actualCashGiven = c.principal - upfrontProfit; // Deduct Interest for PDF ONLY
                    if(isOwnerMode) {
                        totalProfitInRange += upfrontProfit;
                        cCopy.tempUpfrontProfit = upfrontProfit;
                    }
                    newCasesMonthly.push(cCopy);
                } else if (c.type === 'daily') {
                    newCasesDaily.push(cCopy);
                } else if (c.type === 'meter') {
                    newCasesMeter.push(cCopy);
                }

                cCopy.actualCashGiven = actualCashGiven; // Save value for later PDF use
                totalGiven += actualCashGiven; // Adjust Top Report Counter (Actual cash outflow)
            }
            
            let customerTotalInRange = 0, customerProfitInRange = 0, histHits = [];
            let tempBalForRec = (c.type === 'monthly' || c.type === 'meter') ? c.principal : (c.totalPayable || c.principal);
            let cRatio = (c.type === 'daily') ? Math.max(0, ((c.totalPayable || c.principal) - c.principal) / (c.totalPayable || c.principal)) : 0;
            
            if(c.history) {
                let sortedHist = [...c.history].sort((a, b) => (a.date > b.date ? 1 : -1));
                sortedHist.forEach(h => {
                    let paid = parseFloat(h.paid); let profitFromThisPayment = 0;
                    if(c.type === 'monthly' || c.type === 'meter') { profitFromThisPayment = paid; }
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

                if (c.type === 'daily' || c.type === 'meter') {
                    amountPerUnit = c.type === 'daily' ? (c.installment || 0) : (c.principal * (c.rate || 0) / 100);
                    let [sy, sm, sd] = c.startDate.split('-').map(Number);
                    let iterDate = new Date(sy, sm - 1, sd); iterDate.setDate(iterDate.getDate() + 1); 
                    while (toLocalYMD(iterDate) <= rangeEndStr) {
                        let currentCheckStr = toLocalYMD(iterDate);
                        if (!historyUpToEnd.some(h => h.date === currentCheckStr)) { 
                            accumulatedTotal += amountPerUnit; 
                            missedDates.push(String(iterDate.getDate()).padStart(2,'0') + "/" + String(iterDate.getMonth()+1).padStart(2,'0')); 
                        }
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
                        }
                        cycle++;
                    }
                }
                if (missedDates.length > 0) { pendingsInRange.push({ ...c, accumulatedTotal: accumulatedTotal, missedDatesStr: missedDates.join(", ") }); }
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
        
        if(isOwnerMode) { 
            document.getElementById('rep-profit-container').style.display = 'block'; 
            document.getElementById('rep-profit').innerText = '₹' + totalProfitInRange.toLocaleString(undefined, {maximumFractionDigits:0}); 
            document.getElementById('btn-rep-pdf').style.display = 'block'; 
            
            if(!document.getElementById('btn-staff-pdf')) {
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
            document.getElementById('btn-staff-pdf').style.display = 'block';
        } else { 
            document.getElementById('rep-profit-container').style.display = 'none'; 
            document.getElementById('btn-rep-pdf').style.display = 'none'; 
            if(document.getElementById('btn-staff-pdf')) document.getElementById('btn-staff-pdf').style.display = 'none';
        }
        
        let reportHtml = "";
        const renderCases = (list, title, color) => {
            if (list.length === 0) return "";
            let html = `<div style="color:${color}; font-size:11px; margin:15px 0 5px; font-weight:700; text-transform:uppercase;">${title}</div>`;
            let sectionTotal = 0;
            list.forEach(c => { 
                let amtToDisplay = c.principal; // VIP FIX: APP UI MEIN WAPAS SE PRINCIPAL (15000) AAYEGA
                sectionTotal += amtToDisplay;
                html += `<div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.3); padding:12px; border-radius:10px; margin-bottom:5px; font-size:12px; border-left:3px solid ${color}; overflow:hidden; width:100%;"><div style="flex:1; min-width:0; display:flex; align-items:center; gap:10px;">${c.photo?`<img src="${c.photo}" onclick="openPhotoZoom('${c.photo}')" style="width:30px; height:30px; border-radius:50%; object-fit:cover; cursor:zoom-in;">`:''}<div style="flex:1; min-width:0;"><div style="flex:1; min-width:0;"><b style="color:var(--text-main); display:block; word-wrap:break-word; word-break:break-word; white-space:normal; line-height:1.4;">${c.name}</b><span style="color:var(--text-muted); font-size:10px;">${t.givenOn} ${formatDateDisplay(c.startDate)}</span></div></div></div><div style="text-align:right; flex-shrink:0; margin-left:10px;"><b style="color:${color};">₹${amtToDisplay.toLocaleString()}</b>${(isOwnerMode && c.tempUpfrontProfit) ? `<div style="font-size:10px; color:var(--owner-gold); margin-top:2px;">${t.profitCut} ₹${c.tempUpfrontProfit.toFixed(0)}</div>` : ''}</div></div>`; 
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
                html += `<div style="display:flex; flex-direction:column; background:rgba(0,0,0,0.3); padding:12px; border-radius:10px; margin-bottom:8px; border-left:3px solid ${color}; overflow:hidden; width:100%;"><div style="display:flex; justify-content:space-between; align-items:center;"><div style="flex:1; min-width:0;"><b style="color:var(--text-main); display:block; word-wrap:break-word; word-break:break-word; white-space:normal; line-height:1.4;">${p.name}</b><span style="color:var(--text-muted); font-size:10px;">${dateSummary}</span></div><div style="text-align:right; flex-shrink:0; margin-left:10px;"><div style="font-weight:bold; color:${color}; font-size:14px;">+ ₹${p.total.toLocaleString()}</div></div></div><div style="font-size:10px; color:var(--text-muted); margin-top:6px; display:flex; justify-content:space-between; gap:10px;"><span style="flex:1; min-width:0; word-wrap:break-word; white-space:normal;">${detailStr}</span>${isOwnerMode ? `<span style="color:var(--owner-gold); flex-shrink:0;">${t.profitText} ₹${p.profit.toFixed(0)}</span>` : ''}</div></div>`; 
            });
            html += `<div style="text-align:right; color:${color}; font-size:14px; font-weight:bold; padding: 8px 5px; margin-bottom: 10px; border-top: 1px dashed rgba(255,255,255,0.1);">${t.repTotal || 'TOTAL'}: ₹${sectionTotal.toLocaleString()}</div>`;
            return html;
        };
        
        reportHtml += renderPayments(paymentsDaily, t.repRecDaily, "var(--success)", false);
        reportHtml += renderPayments(paymentsMonthly, t.repRecMonthly, "var(--owner-gold)", true);
        reportHtml += renderPayments(paymentsMeter, t.repRecMeter, "#a855f7", false);
        
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
                html += `<div style="display:flex; flex-direction:column; background:${bgColor}; padding:12px; border-radius:10px; margin-bottom:8px; border-left:4px solid ${color}; overflow:hidden; width:100%;"><div style="display:flex; justify-content:space-between; align-items: flex-start;"><div style="flex:1; min-width:0;"><b style="color:var(--text-main); display:block; word-wrap:break-word; word-break:break-word; white-space:normal; line-height:1.4;">${p.name}</b><span style="color:${color}; font-size:9px; font-weight:800; letter-spacing:0.5px;">${typeTranslated.toUpperCase()} ${t.basisText}</span><br><span style="color:var(--text-muted); font-size:10px; display:block; margin-top:3px; word-wrap:break-word; white-space:normal;">${t.missedText} ${p.missedDatesStr} <b style="color:var(--text-main); margin-left:5px;">(${calcNote})</b></span></div><div style="text-align:right; flex-shrink:0; margin-left:10px;"><b style="color:${color}; font-size:14px;">₹${p.accumulatedTotal.toFixed(0)}</b></div></div></div>`;
            });
            html += `<div style="text-align:right; color:${color}; font-size:14px; font-weight:bold; padding: 8px 5px; margin-bottom: 10px; border-top: 1px dashed rgba(255,255,255,0.1);">${t.repTotal || 'TOTAL'}: ₹${sectionTotal.toFixed(0).toLocaleString()}</div>`;
            return html;
        };
        
        if (pendingsInRange.length > 0) {
            let pendingDaily = pendingsInRange.filter(p => p.type === 'daily');
            let pendingMonthly = pendingsInRange.filter(p => p.type === 'monthly');
            let pendingMeter = pendingsInRange.filter(p => p.type === 'meter');
            reportHtml += renderPendings(pendingDaily, t.repPendDaily, "var(--danger)", "rgba(255, 59, 107, 0.05)");
            reportHtml += renderPendings(pendingMonthly, t.repPendMonthly, "#3da9fc", "rgba(61, 169, 252, 0.05)");
            reportHtml += renderPendings(pendingMeter, t.repPendMeter, "#c084fc", "rgba(192, 132, 252, 0.05)"); 
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

                html += `<div style="display:flex; flex-direction:column; background:${bgColor}; padding:12px; border-radius:10px; margin-bottom:8px; border-left:4px solid ${color}; overflow:hidden; width:100%;">
                    <div style="display:flex; justify-content:space-between; align-items: flex-start;">
                        <div style="flex:1; min-width:0;">
                            <b style="color:var(--text-main); display:block; word-wrap:break-word; word-break:break-word; white-space:normal; line-height:1.4;">${c.name}</b>
                            <span style="color:${color}; font-size:9px; font-weight:800; letter-spacing:0.5px;">${typeTranslated.toUpperCase()}</span><br>
                            <span style="color:var(--text-muted); font-size:10px; display:block; margin-top:3px;">Closed On: <b style="color:var(--text-main);">${formatDateDisplay(c.closedDate)}</b></span>
                        </div>
                        <div style="text-align:right; flex-shrink:0; margin-left:10px;">
                            <b style="color:${color}; font-size:14px;">₹${c.principal.toLocaleString()}</b><br>
                            <span style="font-size:9px; color:var(--text-muted);">Principal</span>
                        </div>
                    </div>
                    <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items:center;">
                        <div style="display:flex; flex-direction:column; gap:3px;">
                            <span style="font-size: 10px; color: var(--text-muted);">Recovered (In Range):</span>
                            <span style="font-size: 11px; color: white;">${detailStr}</span>
                        </div>
                        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:3px;">
                            <span style="font-size: 14px; font-weight: bold; color: var(--success);">+ ₹${(c.recoveredInRange || 0).toLocaleString()}</span>
                            ${isOwnerMode ? `<span style="font-size:10px; color:var(--owner-gold);">PROFIT: ₹${(c.profitInRange || 0).toFixed(0)}</span>` : ''}
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
        
        if(reportHtml === "") { reportHtml = `<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:12px; border:1px dashed rgba(255,255,255,0.1); border-radius:12px; margin-top:15px;">No activity found in selected date range.</div>`; }
        document.getElementById('rep-list').innerHTML = reportHtml; document.getElementById('rep-results').style.display = 'block'; document.getElementById('rep-list').scrollTop = 0;
    }

    function downloadReportPDF() {
        if(!lastGeneratedReportData) return showToast("Generate report first!");
        try {
            const { jsPDF } = window.jspdf; const doc = new jsPDF(); const data = lastGeneratedReportData; const marginX = 14; let currentY = 20;
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
                    let amtToDisplay = Number(c.actualCashGiven || c.principal || 0); // VIP FIX: OWNER PDF MEIN 13500 AAYEGA
                    totalValue += amtToDisplay; 
                    return [i + 1, c.name, formatDateDisplay(c.startDate), typeLabel, `RS. ${amtToDisplay.toLocaleString()}`]; 
                });
                doc.autoTable({ startY: currentY + 4, head: [['S.No', 'Customer Name', 'Date Given', 'Case Type', 'Principal Amount']], body: body, foot: [['', '', '', 'TOTAL NEW CAPITAL', `RS. ${totalValue.toLocaleString()}`]], theme: 'striped', headStyles: { fillColor: color }, footStyles: { fillColor: color, textColor: [255, 255, 255] } });
                currentY = doc.lastAutoTable.finalY + 12;
            };

            renderNewCases(data.newCasesDaily, "NEW PORTFOLIO ADDITIONS (DAILY)", [255, 107, 53], "DAILY");
            renderNewCases(data.newCasesMonthly, "NEW PORTFOLIO ADDITIONS (MONTHLY)", [184, 134, 11], "MONTHLY");
            renderNewCases(data.newCasesMeter, "NEW PORTFOLIO ADDITIONS (METER)", [168, 85, 247], "METER");

            if (data.paymentsDaily.length > 0) { if (currentY > 250) { doc.addPage(); currentY = 20; } doc.setFontSize(11); doc.setTextColor(40, 167, 69); doc.text("DAILY RECOVERY LOG (KISHATS)", marginX, currentY); let totalDaily = 0; let dailyTableBody = data.paymentsDaily.map((p, i) => { let dates = p.hits.map(h => h.date).sort(); let summary = dates.length > 1 ? `${formatDateDisplay(dates[0])} to ${formatDateDisplay(dates[dates.length-1])}` : formatDateDisplay(dates[0]); totalDaily += Number(p.total || 0); return [i + 1, p.name, summary, (p.type || 'DAILY').toUpperCase(), `RS. ${Number(p.total).toLocaleString()}`]; }); doc.autoTable({ startY: currentY + 4, head: [['S.No', 'Customer Name', 'Date Range', 'Basis', 'Total Received']], body: dailyTableBody, foot: [['', '', '', 'TOTAL DAILY RECOVERY', `RS. ${totalDaily.toLocaleString()}`]], theme: 'striped', headStyles: { fillColor: [40, 167, 69] }, footStyles: { fillColor: [40, 167, 69], textColor: [255, 255, 255] } }); currentY = doc.lastAutoTable.finalY + 12; }
            if (data.paymentsMeter.length > 0) { if (currentY > 250) { doc.addPage(); currentY = 20; } doc.setFontSize(11); doc.setTextColor(168, 85, 247); doc.text("METER RECOVERY LOG", marginX, currentY); let totalMeter = 0; let meterTableBody = data.paymentsMeter.map((p, i) => { let dates = p.hits.map(h => h.date).sort(); let summary = dates.length > 1 ? `${formatDateDisplay(dates[0])} to ${formatDateDisplay(dates[dates.length-1])}` : formatDateDisplay(dates[0]); totalMeter += Number(p.total || 0); return [i + 1, p.name, summary, (p.type || 'METER').toUpperCase(), `RS. ${Number(p.total).toLocaleString()}`]; }); doc.autoTable({ startY: currentY + 4, head: [['S.No', 'Customer Name', 'Date Range', 'Basis', 'Total Received']], body: meterTableBody, foot: [['', '', '', 'TOTAL METER RECOVERY', `RS. ${totalMeter.toLocaleString()}`]], theme: 'striped', headStyles: { fillColor: [168, 85, 247] }, footStyles: { fillColor: [168, 85, 247], textColor: [255, 255, 255] } }); currentY = doc.lastAutoTable.finalY + 12; }
            if (data.paymentsMonthly.length > 0) { if (currentY > 250) { doc.addPage(); currentY = 20; } doc.setFontSize(11); doc.setTextColor(212, 175, 55); doc.text("MONTHLY INTEREST LOG (VYAJ)", marginX, currentY); let totalMonthly = 0; let sortedMonthlyPayments = [...data.paymentsMonthly].sort((a, b) => { let dateA = a.hits && a.hits.length > 0 ? a.hits.map(h => h.date).sort()[0] : '9999-99-99'; let dateB = b.hits && b.hits.length > 0 ? b.hits.map(h => h.date).sort()[0] : '9999-99-99'; return (dateA > dateB ? 1 : -1); }); let monthlyTableBody = sortedMonthlyPayments.map((p, i) => { let dates = p.hits.map(h => formatDateDisplay(h.date)).sort().join(", "); totalMonthly += Number(p.total || 0); return [i + 1, p.name, dates, `RS. ${Number(p.total).toLocaleString()}`]; }); doc.autoTable({ startY: currentY + 4, head: [['S.No', 'Customer Name', 'Payment Specific Dates', 'Total Interest']], body: monthlyTableBody, foot: [['', '', 'TOTAL MONTHLY INTEREST', `RS. ${totalMonthly.toLocaleString()}`]], theme: 'striped', headStyles: { fillColor: [184, 134, 11] }, footStyles: { fillColor: [184, 134, 11], textColor: [255, 255, 255] } }); currentY = doc.lastAutoTable.finalY + 12; }

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

            if (currentY > 270) { doc.addPage(); currentY = 20; } doc.setFontSize(9); doc.setTextColor(150); doc.setFont(undefined, 'italic'); doc.text("End of Professional Business Report. Generated by Credix Premium.", marginX, currentY + 10); doc.save(`Credix_Business_Report_${data.start}_to_${data.end}.pdf`); showToast("Professional PDF Downloaded!");
        } catch (err) { console.error(err); showToast("Error generating PDF. Try again."); }
    }

    // --- BULLETPROOF: STAFF SPECIFIC BLUE PDF REPORT ---
    window.downloadStaffPDF = function() {
        if(!lastGeneratedReportData) return showToast("Generate report first!");
        try {
            const { jsPDF } = window.jspdf;
            const docPdf = new jsPDF();
            const data = lastGeneratedReportData;
            const marginX = 14;
            let currentY = 20;

            let searchEl = document.getElementById('rep-search');
            let searchVal = searchEl ? searchEl.value.trim() : "";
            let staffName = searchVal ? searchVal.toUpperCase() : "ALL STAFF";

            // Title
            docPdf.setFontSize(22);
            docPdf.setTextColor(21, 101, 192); // Deep Blue
            docPdf.setFont(undefined, 'bold');
            docPdf.text(`${staffName} - BUSINESS REPORT`, marginX, currentY);

            docPdf.setFontSize(10);
            docPdf.setTextColor(100);
            docPdf.text(`Period: ${formatDateDisplay(data.start)} to ${formatDateDisplay(data.end)}`, 130, currentY);
            currentY += 10;

            // Safe Helper for New/Old
            const getStatus = (cust) => {
                if (!cust || !cust.name) return 'New';
                let isOld = db.some(x => (x.name || "").toLowerCase().trim() === cust.name.toLowerCase().trim() && x.id < cust.id);
                return isOld ? 'Old' : 'New';
            };

            // 1. DAILY CASES (NO INTEREST)
            if(data.newCasesDaily && data.newCasesDaily.length > 0) {
                docPdf.setFontSize(14);
                docPdf.setTextColor(255, 255, 255);
                docPdf.setFillColor(21, 101, 192);
                docPdf.rect(marginX, currentY, 182, 8, 'F');
                docPdf.text(`DAILY BASIS CASES`, marginX + 5, currentY + 6);
                currentY += 12;

                let tPrin = 0;
                let dailyBody = data.newCasesDaily.map((c, i) => {
                    let pAmt = Number(c.principal || 0); // VIP FIX: STAFF PDF MEIN WAPAS SE PRINCIPAL (15000) AAYEGA
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

            // 2. MONTHLY CASES (NO INTEREST)
            if(data.newCasesMonthly && data.newCasesMonthly.length > 0) {
                if (currentY > 250) { docPdf.addPage(); currentY = 20; }
                docPdf.setFontSize(14);
                docPdf.setTextColor(255, 255, 255);
                docPdf.setFillColor(21, 101, 192);
                docPdf.rect(marginX, currentY, 182, 8, 'F');
                docPdf.text(`MONTHLY CASES HISAAB`, marginX + 5, currentY + 6);
                currentY += 12;

                let tPrinM = 0;
                let monthlyBody = data.newCasesMonthly.map((c, i) => {
                    let pAmt = Number(c.principal || 0); // VIP FIX: STAFF PDF MEIN WAPAS SE PRINCIPAL (15000) AAYEGA
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
            
            // 3. METER CASES
            if(data.newCasesMeter && data.newCasesMeter.length > 0) {
                if (currentY > 250) { docPdf.addPage(); currentY = 20; }
                docPdf.setFontSize(14);
                docPdf.setTextColor(255, 255, 255);
                docPdf.setFillColor(21, 101, 192);
                docPdf.rect(marginX, currentY, 182, 8, 'F');
                docPdf.text(`METER BASIS CASES`, marginX + 5, currentY + 6);
                currentY += 12;

                let tPrinMeter = 0;
                let meterBody = data.newCasesMeter.map((c, i) => {
                    let pAmt = Number(c.principal || 0); // VIP FIX: STAFF PDF MEIN WAPAS SE PRINCIPAL
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

    function render() {
        if(currentTab === 'stats') { renderStats(); return; }
        const dash = document.getElementById('dashboard'); dash.innerHTML = '';
        let sName = document.getElementById('search-box').value.toLowerCase().trim();
        let fType = document.getElementById('filter-box').value;
        let sortType = document.getElementById('sort-box').value;
        let tP = 0, tB = 0, tC = 0;
        let searchCasesCount = 0, searchTotalValue = 0, searchTotalBal = 0, searchTotalRec = 0;
        let searchTotalKishat = 0, searchTotalProfit = 0;
        let showSearchStat = false;
        let today = getISTDate(); // IST FIX
        let pureDB = db.filter(x => x.type !== 'config' && x.type !== 'trash');
        let mappedDB = pureDB.map((c, idx) => ({...c, originalSNo: idx + 1}));
        let sortedDB = mappedDB.sort((a, b) => { let dateA = a.startDate; let dateB = b.startDate; if (dateA === dateB) return sortType === 'new' ? b.id - a.id : a.id - b.id; return sortType === 'new' ? (dateB > dateA ? 1 : -1) : (dateA > dateB ? 1 : -1); });
        const accountsHtmlArray = [];
        const t = i18n[currentLang]; 
        sortedDB.forEach(c => {
            if(!isOwnerMode && c.isPersonal) return;
            if(!isOwnerMode && (c.staffRef || '').trim().toLowerCase() !== deviceStaffName.toLowerCase()) return;
            if(fType === 'archived') { if(!c.isArchived) return; } else { if(c.isArchived) return; if(fType !== 'all' && c.type !== fType) return; }
            tP += c.principal; tB += c.currentBalance; tC++;
            let nameMatch = c.name.toLowerCase().includes(sName);
            let refMatch = (currentTab === 'dash' && isOwnerMode && sName !== '') && (c.staffRef || '').toLowerCase().includes(sName);
            if(!nameMatch && !refMatch) return;
            if (currentTab === 'dash' && sName === '') return;
            if (refMatch) { showSearchStat = true; searchCasesCount++; searchTotalValue += c.principal; searchTotalBal += c.currentBalance; let paid = c.history ? c.history.reduce((sum, h) => sum + parseFloat(h.paid), 0) : 0; searchTotalRec += paid; if (c.type === 'daily') { searchTotalKishat += (c.installment || 0); let totalP = (c.totalPayable || c.principal) - c.principal; let ratio = totalP / (c.totalPayable || c.principal); searchTotalProfit += (c.installment * ratio); } else if (c.type === 'monthly' || c.type === 'meter') { let interest = (c.principal * (c.rate || 0) / 100); searchTotalKishat += interest; searchTotalProfit += interest; } }
            let isDueToday = false, isPending = false, pendingDays = 0;
            let todayDateObj = new Date(today);
            if (c.type === 'monthly') { let monthlyInt = c.principal * (c.rate || 0) / 100; let totalPaidThisCase = c.history ? c.history.reduce((sum, h) => sum + parseFloat(h.paid), 0) : 0; let monthsPaid = monthlyInt > 0 ? Math.floor(totalPaidThisCase / monthlyInt) : (c.history ? c.history.length : 0); let nextDueDate = new Date(c.startDate); nextDueDate.setMonth(nextDueDate.getMonth() + monthsPaid + 1); if (todayDateObj >= nextDueDate && c.currentBalance > 0) { isPending = true; pendingDays = Math.floor((todayDateObj.getTime() - nextDueDate.getTime()) / (1000 * 60 * 60 * 24)); if (pendingDays === 0) isDueToday = true; } }
            else { let paidToday = c.history ? c.history.some(h => h.date === today) : false; if (!paidToday && c.currentBalance > 0) { isPending = true; isDueToday = true; let lastPaymentDate = (c.history && c.history.length > 0) ? c.history.reduce((max, h) => h.date > max ? h.date : max, c.history[0].date) : c.startDate; pendingDays = Math.floor((todayDateObj.getTime() - new Date(lastPaymentDate).getTime()) / (1000 * 60 * 60 * 24)); } }
            if (c.isArchived) { isDueToday = false; isPending = false; pendingDays = 0; }
            let totalPaid = c.history ? c.history.reduce((sum, h) => sum + parseFloat(h.paid), 0) : 0;
            let histData = c.history ? [...c.history] : [], hideSNo = false;
            if (!isOwnerMode && (c.type === 'monthly' || c.type === 'meter')) { hideSNo = true; if (histData.length > 1) { let currentMonthStr = today.substring(0, 7); let activeMonthRecords = histData.filter(h => h.date.substring(0, 7) === currentMonthStr); histData = activeMonthRecords.length > 0 ? activeMonthRecords : histData.slice(-1); } }
            let histHtml = histData.reverse().map((h) => { let origIdx = c.history.indexOf(h); let actHtml = multiDelMode[c.id] ? `<input type="checkbox" class="del-chk-${c.id}" value="${origIdx}" style="width:16px;height:16px;accent-color:var(--accent-orange); cursor:pointer;">` : `<span onclick="deleteHistoryUI(${c.id}, ${origIdx})" style="color:var(--text-muted);font-size:14px; cursor:pointer;">🗑️</span>`; return hideSNo ? `<tr><td style="color:var(--text-muted)">${formatDateDisplay(h.date)}</td><td style="color:var(--success)">₹${h.paid}</td><td>₹${Number(h.balance||0).toFixed(0)}</td><td>${actHtml}</td></tr>` : `<tr><td>${origIdx + 1}</td><td style="color:var(--text-muted)">${formatDateDisplay(h.date)}</td><td style="color:var(--success)">₹${h.paid}</td><td>₹${Number(h.balance||0).toFixed(0)}</td><td>${actHtml}</td></tr>`; }).join('');
            const statusHtml = c.isArchived ? `<span class="status-txt" style="color:var(--text-muted);"><span class="status-dot" style="background:var(--text-muted);box-shadow:none;"></span> Closed</span>` : (isPending && c.currentBalance > 0 ? `<span class="status-txt" style="color:var(--danger);"><span class="status-dot" style="background:var(--danger);box-shadow:none;"></span> Pending ${pendingDays > 0 ? '('+pendingDays+' Days)' : ''}</span>` : `<span class="status-txt" style="color:var(--success);"><span class="status-dot" style="box-shadow:none;"></span> Active</span>`);
            const avatarHtml = c.photo ? `<img src="${c.photo}" class="cust-avatar" onclick="event.stopPropagation(); openPhotoZoom('${c.photo}')">` : `<div class="cust-avatar" style="display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.05); color:var(--text-muted); font-size:20px;">👤</div>`;
            accountsHtmlArray.push(`
            <div class="cust-card glass-card" style="${(isOwnerMode && c.isPersonal) ? 'border-color: rgba(255, 215, 0, 0.3); background: linear-gradient(145deg, rgba(255, 215, 0, 0.05) 0%, var(--card-bg) 100%);' : ''}">
                ${isDueToday && c.currentBalance > 0 ? '<div class="due-indicator">Due Today</div>' : ''}
                <div onclick="toggleView(${c.id})" style="cursor:pointer;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:5px; align-items:center;"><div class="pill-tag">${c.type.toUpperCase()} | S.No: ${c.originalSNo}${hideSNo ? '' : ' | Kishat: ' + (c.history?c.history.length:0)}</div>${statusHtml}</div>
                    <div class="card-header">
                        <div style="min-width:0; flex:1; display:flex; align-items:center; gap:12px;">
                            ${avatarHtml}
                            <div style="min-width:0;">
                                <div class="c-name" style="word-wrap:break-word; word-break:break-word;">${c.name} ${c.staffRef?`<span style="color:var(--accent-orange); font-size:10px; margin-left:5px; flex-shrink:0;">[Ref: ${c.staffRef}]</span>`:''} ${(isOwnerMode && c.isPersonal)?'<span style="flex-shrink:0;">👑</span>':''}</div>
                                <div class="c-sub">${t.caseDate || 'Case Date'}: ${formatDateDisplay(c.startDate)}</div>
                            </div>
                        </div>
                        <div style="flex-shrink:0;">
                            <div class="c-bal">₹${c.currentBalance.toFixed(0)}</div>
                            <div class="c-sub" style="text-align:right">Balance</div>
                        </div>
                    </div>
                </div>
                <div id="view-${c.id}" style="display:${openViews[c.id]?'block':'none'}">
                    <div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.3); padding:15px; border-radius:12px; margin-top:15px;">
                        <div style="text-align:left;"><span style="font-size:10px; color:var(--text-muted);">${c.type==='daily'?t.returnAmt:t.principal}</span><br><b style="font-size:14px;">₹${c.type==='daily'?(c.totalPayable||c.principal):c.principal}</b></div>
                        ${(isOwnerMode || c.type === 'daily') ? `
                        <div style="text-align:center;"><span style="font-size:10px; color:var(--text-muted);">${t.totalPaid}</span><br><b style="font-size:14px; color:var(--success)">₹${totalPaid}</b></div>
                        ` : ''}
                        <div style="text-align:right;"><span style="font-size:10px; color:var(--text-muted);">${t.remainingAcc}</span><br><b style="font-size:14px; color:var(--danger)">₹${c.currentBalance.toFixed(0)}</b></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px;"><span style="font-size:11px; color:var(--text-muted);">${t.payHistory}</span><div style="display:flex; gap:10px;">${multiDelMode[c.id] ? `<button onclick="deleteSelectedHistoryUI(${c.id})" style="background:var(--danger); border:none; color:white; font-size:10px; padding:4px 10px; border-radius:10px; font-weight:700;">DELETE ALL</button>` : ''}<button onclick="toggleMultiDel(${c.id})" style="background:rgba(255,255,255,0.05); border:1px solid var(--card-border); color:white; font-size:10px; padding:4px 10px; border-radius:10px; font-weight:600;">${multiDelMode[c.id]?'CANCEL':'MULTI-SELECT'}</button></div></div>
                    <table class="view-table"><thead>${hideSNo ? '<tr><th>Date</th><th>Paid</th><th>Bal</th><th>X</th></tr>' : '<tr><th>S.No</th><th>Date</th><th>Paid</th><th>Bal</th><th>X</th></tr>'}</thead><tbody>${histHtml || '<tr><td colspan="5" style="padding:20px; opacity:0.4;">No records</td></tr>'}</tbody></table>
                </div>
                <div class="btn-row" style="margin-top:15px;"><button class="s-btn" onclick="openEditModal(${c.id})">${i18n[currentLang].editBtn||'Edit'}</button>${isOwnerMode ? `<button class="s-btn" style="flex:0.6; font-size:16px;" onclick="generateCustomerPDF(${c.id})">📄</button>` : ''}<button class="s-btn" style="flex:0.6; font-size:16px;" onclick="toggleArchiveUI(${c.id})">${c.isArchived?'📤':'📦'}</button><button class="s-btn" style="flex:0.6; color:var(--danger);" onclick="deleteCustUI(${c.id})">🗑️</button><button class="s-btn collect" style="flex:1.4;" onclick="${currentTab==='bulk'?'openBulkModal':'openPayModal'}(${c.id})">${currentTab==='bulk'?'⚡ Bulk':i18n[currentLang].recBtn||'Receive'}</button></div>
            </div>`);
        });
        let finalHtml = ""; 
        if (currentTab === 'dash' && sName === '') { finalHtml = `<div style="text-align:center; padding: 40px 20px; background:rgba(0,0,0,0.3); border-radius:20px; border:1px dashed rgba(255,255,255,0.05); margin-top:10px;"><div style="font-size:30px; margin-bottom:10px; opacity:0.6;">✨</div><div style="font-size:14px; font-weight:600; color:white; margin-bottom:5px;">${t.cleanDashTitle}</div><div style="font-size:11px; color:var(--text-muted); line-height:1.5;">${t.cleanDashSub}</div></div>`; }
        else {
            if (currentTab === 'dash' && isOwnerMode && showSearchStat && sName !== '') { let collectionLabel = t.refStatCollection; if (fType === 'monthly') collectionLabel = t.refStatInterest; else if (fType === 'meter') collectionLabel = t.refStatInterest.replace('Monthly', 'Daily'); finalHtml += `<div class="search-stat-card"><div style="display:flex; justify-content:space-between; align-items:center;"><span style="font-size:14px; font-weight:800; color:var(--owner-gold);">${t.refStatTitle}</span><span style="font-size:11px; color:var(--text-muted); background:rgba(255,255,255,0.05); padding:3px 8px; border-radius:8px;">${sName.toUpperCase()}</span></div><div class="search-stat-grid"><div class="stat-item"><label>${t.refStatCases}</label><value>${searchCasesCount}</value></div><div class="stat-item"><label>${t.refStatValue}</label><value>₹${searchTotalValue.toLocaleString()}</value></div><div class="stat-item"><label>${t.refStatRec}</label><value style="color:var(--success);">₹${searchTotalRec.toLocaleString()}</value></div><div class="stat-item"><label>${t.refStatOut}</label><value style="color:var(--danger);">₹${searchTotalBal.toLocaleString()}</value></div>${fType !== 'all' ? `<div class="stat-item" style="border-top: 1px dashed rgba(255,255,255,0.1); padding-top:10px; grid-column: span 1;"><label>${collectionLabel}</label><value style="color:var(--accent-orange);">₹${searchTotalKishat.toFixed(0).toLocaleString()}</value></div><div class="stat-item" style="border-top: 1px dashed rgba(255,255,255,0.1); padding-top:10px; grid-column: span 1;"><label>${t.refStatProfit}</label><value style="color:var(--owner-gold);">₹${searchTotalProfit.toFixed(0).toLocaleString()}</value></div>` : ''}</div></div>`; }
            finalHtml += accountsHtmlArray.join('');
        }
        document.getElementById('dashboard').innerHTML = finalHtml; document.getElementById('sum-cases').innerText = tC; document.getElementById('sum-principal').innerText = '₹' + tP.toLocaleString(); document.getElementById('sum-balance').innerText = '₹' + tB.toLocaleString();
    }

    function renderStats() {
        let mPrin = 0, dPrin = 0, meterPrin = 0, totalPrin = 0, totalBal = 0, totalRecovered = 0, globalInvested = 0, globalProfit = 0; 
        db.filter(x => x.type !== 'config' && x.type !== 'trash').forEach(c => {
            if(!isOwnerMode && (c.isPersonal || (c.staffRef || '').trim().toLowerCase() !== deviceStaffName.toLowerCase())) return;
            if (!c.isArchived) { totalPrin += c.principal; totalBal += c.currentBalance; if(c.type === 'monthly') mPrin += c.principal; else if(c.type === 'meter') meterPrin += c.principal; else dPrin += c.principal; }
            if(c.history) c.history.forEach(h => { totalRecovered += parseFloat(h.paid); });
            if(isOwnerMode) { 
                globalInvested += c.principal; 
                let tBal = (c.type === 'monthly' || c.type === 'meter') ? c.principal : (c.totalPayable || c.principal); 
                let cRatio = (c.type === 'daily') ? Math.max(0, ((c.totalPayable || c.principal) - c.principal) / (c.totalPayable || c.principal)) : 0; 
                if (c.type === 'monthly') globalProfit += (c.principal * (c.rate || 0) / 100); 
                if(c.history) { 
                    [...c.history].sort((a,b) => (a.date > b.date ? 1 : -1)).forEach(h => { 
                        let paid = parseFloat(h.paid); 
                        if(c.type === 'monthly' || c.type === 'meter') { globalProfit += paid; } 
                        else { globalProfit += (paid * cRatio); tBal -= paid; } 
                    }); 
                } 
            }
        });
        if(isOwnerMode) { document.getElementById('owner-invested').innerText = '₹' + globalInvested.toLocaleString(undefined, {maximumFractionDigits:0}); document.getElementById('owner-profit').innerText = '₹' + globalProfit.toLocaleString(undefined, {maximumFractionDigits:0}); }
        document.getElementById('bar-m-prin').style.width = (totalPrin ? (mPrin/totalPrin)*100 : 33) + '%'; document.getElementById('bar-d-prin').style.width = (totalPrin ? (dPrin/totalPrin)*100 : 33) + '%'; document.getElementById('bar-meter-prin').style.width = (totalPrin ? (meterPrin/totalPrin)*100 : 34) + '%'; document.getElementById('txt-m-prin').innerText = `${i18n[currentLang].monthly}: ₹${mPrin.toLocaleString()}`; document.getElementById('txt-d-prin').innerText = `${i18n[currentLang].daily}: ₹${dPrin.toLocaleString()}`; document.getElementById('txt-meter-prin').innerText = `${i18n[currentLang].meter}: ₹${meterPrin.toLocaleString()}`; document.getElementById('txt-recovered').innerText = `${i18n[currentLang].recovered}: ₹${totalRecovered.toLocaleString()}`; document.getElementById('txt-remaining').innerText = `${i18n[currentLang].remaining}: ₹${totalBal.toLocaleString()}`;
    }

    // --- APP VISIBILITY & BACKGROUND HANDLING ---
    document.addEventListener("visibilitychange", function() {
        if (document.hidden) {
            console.log("App is in background. Going offline...");
            firebase.database().goOffline();
            if (window.currentRecognition) {
                try {
                    window.currentRecognition.stop();
                } catch(e) {}
            }
        } else {
            console.log("App is active. Going online...");
            firebase.database().goOnline();
        }
    });

    // --- VOICE SEARCH FEATURE ---
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
            if(targetInput) {
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
        }

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
}
Bhai  wo total or advance vala pdf ke owner update main to bilkul sahi aa raha hai but jab us pdf ko open kiya to app ne jo kal kishat total amount se minuse wala feature  update kiya tha na us main dikkat ho gi hai coz advance or total wala sirf owner main update karna tha staff ki or custom report main theek tha or kal jo apnw feature update kiya tha kishat wala ki principal - amount  = remaining wo staff ki pdf main or owner ki pdf or app main jo aana tha wo to sahi aa raha hai but owner ki report main jo last main column hota hai wo app ne 15000 set kardiya jb ki waha principal orignal theek aa rha tha us column me check karo 22 page wali custom report main  baki wo fix jo aaj diya hai vo update sirf un 2 option par dena tha main screenshot bhej raha hoon theek the usko vaise he update  rakho baki yeh theek kardo. Or sath main yeh 1st page par 3 no wala case uski pdf check karo ki app ne 2 bar 15000 add kar diya hai check karo dhyan se. Baki jo aaj ki app ne 2 fixes theek kare hai us se ui ka issue to ab 100% resolve ho gya hai ..or ab apko sirf kishat or is advance  pdf wale ko check karna hai usko dhyan se theek karo  or haan aaj ki chats main app ne file update karke jo 10gb data ka limit theek karke send kiya tha ab is fix hone ke baad vahi dena or css or html ki to file sahi hai usko ab fix nhi karna aap ab sirf yeh 2 issue theek kar do main us code ko replace kar loonga.. Bhai sabse achi baat ke aap ne jo ek kishat wala feature theek kiya na main waisa hi bhot  dino se chahta tha or aap ne mere dimang ke baat samjh ke mere kaho per woh kiya mujhe sabse accha laga us ke liye thankyou bhai