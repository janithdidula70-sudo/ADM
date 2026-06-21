const API_URL = "https://script.google.com/macros/s/AKfycbymEtnSf9_Jn9o7Wcr3-2YNOUA17RH23vvYEUjzd1icddd6I3HZwd9lky63tTRgkE8e_A/exec";

let teachers = [];
let classes = [];
let allStudents = [];
let dashboard = { summary: {}, todayAttendance: [], todayPayments: [], presentIdsToday: [] };
let deferredPrompt = null;

const $ = (id) => document.getElementById(id);

function money(n) {
  return Number(n || 0).toLocaleString("en-LK");
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function showPage(id, btn) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  $(id).classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => showPage(btn.dataset.page, btn));
});

async function api(action, payload = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload })
  });

  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(
      "Server returned non-JSON response. Check Web App deployment / permissions. First 200 chars: " +
      text.slice(0, 200)
    );
  }

  if (!data.ok) throw new Error(data.message || "Request failed");
  return data;
}

function setMsg(id, text, ok = true) {
  $(id).innerHTML = ok
    ? `<span class="ok">${esc(text)}</span>`
    : `<span class="err">${esc(text)}</span>`;
}

function clearTeacherForm() {
  $("teacherName").value = "";
  $("teacherPhone").value = "";
  $("teacherSubject").value = "";
}

function clearClassForm() {
  $("className").value = "";
  $("classGrade").value = "";
  $("classFee").value = "";
}

function clearStudentForm() {
  $("studentName").value = "";
  $("studentPhone").value = "";
  $("studentAddress").value = "";
}

async function addTeacher() {
  try {
    const result = await api("addTeacher", {
      name: $("teacherName").value.trim(),
      phone: $("teacherPhone").value.trim(),
      subject: $("teacherSubject").value.trim()
    });
    setMsg("teacherMsg", result.message, true);
    clearTeacherForm();
    await reloadAll();
  } catch (err) {
    setMsg("teacherMsg", err.message, false);
  }
}

async function addClass() {
  try {
    const result = await api("addClass", {
      className: $("className").value.trim(),
      grade: $("classGrade").value.trim(),
      teacherID: $("classTeacherSelect").value,
      feeAmount: $("classFee").value
    });
    setMsg("classMsg", result.message, true);
    clearClassForm();
    await reloadAll();
  } catch (err) {
    setMsg("classMsg", err.message, false);
  }
}

async function addStudent() {
  try {
    const result = await api("addStudent", {
      name: $("studentName").value.trim(),
      phone: $("studentPhone").value.trim(),
      address: $("studentAddress").value.trim(),
      classID: $("studentClassSelect").value
    });
    setMsg("studentMsg", result.message, true);
    clearStudentForm();
    await reloadAll();
  } catch (err) {
    setMsg("studentMsg", err.message, false);
  }
}

async function markSelectedAttendance() {
  try {
    const sel = $("studentSelect");
    const opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) return setMsg("actionMsg", "Select a student first", false);

    const result = await api("markAttendance", {
      studentId: opt.value
    });
    setMsg("actionMsg", result.message, true);
    await reloadAll();
  } catch (err) {
    setMsg("actionMsg", err.message, false);
  }
}

async function savePayment() {
  try {
    const sel = $("studentSelect");
    const opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) return setMsg("actionMsg", "Select a student first", false);

    const result = await api("addPayment", {
      studentId: opt.value,
      amount: $("amount").value,
      note: $("note").value.trim()
    });
    setMsg("actionMsg", result.message, true);
    $("amount").value = "";
    $("note").value = "";
    await reloadAll();
  } catch (err) {
    setMsg("actionMsg", err.message, false);
  }
}

function renderDashboard() {
  const s = dashboard.summary || {};
  $("studentCount").textContent = s.studentCount ?? 0;
  $("teacherCount").textContent = s.teacherCount ?? 0;
  $("classCount").textContent = s.classCount ?? 0;
  $("presentCount").textContent = s.presentCount ?? 0;
  $("todayCollection").textContent = money(s.todayCollection ?? 0);
  $("monthCollection").textContent = money(s.monthCollection ?? 0);
  $("absentCount").textContent = s.absentCount ?? 0;
}

function renderTeacherSelects() {
  $("classTeacherSelect").innerHTML = teachers.length
    ? teachers.map(t => `<option value="${esc(t.ID)}">${esc(t.Name)} (${esc(t.Subject || "Teacher")})</option>`).join("")
    : `<option value="">No teachers yet</option>`;
}

function renderClassSelects() {
  $("studentClassSelect").innerHTML = classes.length
    ? `<option value="">Select class</option>` + classes.map(c => {
        return `<option value="${esc(c.ID)}">${esc(c.ClassName)} (${esc(c.Grade)}) • ${esc(c.TeacherName)} • LKR ${money(c.FeeAmount)}</option>`;
      }).join("")
    : `<option value="">No classes yet</option>`;

  $("studentSelect").innerHTML = allStudents.length
    ? `<option value="">Select student</option>` + allStudents.map(s => {
        return `<option value="${esc(s.ID)}" data-fee="${esc(s.FeeAmount || 0)}">${esc(s.Name)} • ${esc(s.ClassName)}</option>`;
      }).join("")
    : `<option value="">No students yet</option>`;
}

function prefillPayment() {
  const opt = $("studentSelect").options[$("studentSelect").selectedIndex];
  if (!opt || !opt.value) return;
  $("amount").value = opt.dataset.fee || "";
}

function renderTeachersTable() {
  $("teachersTable").innerHTML = teachers.length ? teachers.map(t => `
    <tr>
      <td>${esc(t.ID)}</td>
      <td>${esc(t.Name)}</td>
      <td>${esc(t.Phone)}</td>
      <td>${esc(t.Subject || "")}</td>
      <td><span class="badge green">${esc(t.Status || "")}</span></td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="muted">No teachers yet</td></tr>`;
}

function renderClassesTable() {
  $("classesTable").innerHTML = classes.length ? classes.map(c => `
    <tr>
      <td>${esc(c.ID)}</td>
      <td>${esc(c.ClassName)}</td>
      <td>${esc(c.Grade)}</td>
      <td>${esc(c.TeacherName)}</td>
      <td>LKR ${money(c.FeeAmount)}</td>
      <td><span class="badge green">${esc(c.Status || "")}</span></td>
    </tr>
  `).join("") : `<tr><td colspan="6" class="muted">No classes yet</td></tr>`;
}

function renderStudentList() {
  const q = $("search").value.trim().toLowerCase();
  const filtered = allStudents.filter(s => {
    const text = `${s.ID} ${s.Name} ${s.Phone} ${s.Address} ${s.ClassName} ${s.TeacherName}`.toLowerCase();
    return !q || text.includes(q);
  });

  $("studentList").innerHTML = filtered.length ? filtered.map(s => {
    const present = dashboard.presentIdsToday && dashboard.presentIdsToday.includes(String(s.ID));
    return `
      <div class="student">
        <div style="min-width:0">
          <div style="font-weight:800">${esc(s.Name)}</div>
          <div class="muted">${esc(s.Phone)} ${s.Address ? "• " + esc(s.Address) : ""}</div>
          <div style="margin-top:6px">
            <span class="badge ${present ? "green" : "gray"}">${present ? "Present Today" : "Not Marked"}</span>
            <span class="badge purple">${esc(s.ClassName || "")}</span>
            <span class="badge orange">${esc(s.TeacherName || "")}</span>
            <span class="badge">LKR ${money(s.FeeAmount || 0)}</span>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div class="muted" style="font-size:12px">${esc(s.ID)}</div>
          <button class="primary" style="margin-top:10px" onclick="useStudent('${esc(s.ID)}')">Use</button>
        </div>
      </div>
    `;
  }).join("") : `<div class="student"><span class="muted">No students found</span></div>`;
}

function renderTables() {
  $("attendanceTable").innerHTML = dashboard.todayAttendance.length ? dashboard.todayAttendance.map(r => `
    <tr>
      <td>${esc(String(r.Timestamp || "").slice(11,16))}</td>
      <td>${esc(r.Name)}</td>
      <td>${esc(r.ClassName || "")}</td>
      <td>${esc(r.TeacherName || "")}</td>
      <td><span class="badge green">${esc(r.Status)}</span></td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="muted">No attendance today</td></tr>`;

  $("paymentTable").innerHTML = dashboard.todayPayments.length ? dashboard.todayPayments.map(r => `
    <tr>
      <td>${esc(String(r.Timestamp || "").slice(11,16))}</td>
      <td>${esc(r.Name)}</td>
      <td>${esc(r.ClassName || "")}</td>
      <td>LKR ${money(r.Amount)}</td>
      <td>${esc(r.Note || "")}</td>
    </tr>
  `).join("") : `<tr><td colspan="5" class="muted">No payments today</td></tr>`;
}

function useStudent(id) {
  $("studentSelect").value = id;
  prefillPayment();
  showPage("actionsPage", document.querySelector('.nav-btn[data-page="actionsPage"]'));
  $("studentSelect").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function reloadAll() {
  const data = await api("getDashboard");
  dashboard = data;
  teachers = data.teachers || [];
  classes = data.classes || [];
  allStudents = data.students || [];

  renderDashboard();
  renderTeacherSelects();
  renderClassSelects();
  renderTeachersTable();
  renderClassesTable();
  renderStudentList();
  renderTables();
}

window.addEventListener("load", async () => {
  try {
    await reloadAll();
  } catch (err) {
    setMsg("actionMsg", err.message, false);
  }

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("sw.js");
    } catch (e) {}
  }
});

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  $("installBtn").classList.remove("hidden");
  $("installBtn").onclick = async () => {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    $("installBtn").classList.add("hidden");
    deferredPrompt = null;
  };
});
