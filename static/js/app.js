const taskList = document.querySelector("#task-list");
const taskModal = document.querySelector("#task-modal");
const taskForm = document.querySelector("#task-form");
const titleInput = document.querySelector("#task-title");
const descriptionInput = document.querySelector("#task-description");
const deadlineInput = document.querySelector("#task-deadline");
const titleError = document.querySelector("#title-error");
const toast = document.querySelector("#toast");
const searchInput = document.querySelector("#search-input");

let activeFilter = "all";
let editingTaskId = null;
let searchTimer;
let toastTimer;

const filterTitles = {
  all: ["My tasks", "All tasks"],
  pending: ["Pending tasks", "Pending"],
  completed: ["Completed tasks", "Completed"],
};

const icons = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/></svg>',
  empty: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h8M3 6h.01M3 12h.01M3 18h.01"/></svg>',
};

function dateLabel(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-").map(Number);
  const due = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due - today) / 86400000);
  const label = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(due);
  return { label, diff };
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  if (response.status === 204) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}

function setCounts(counts) {
  document.querySelector("#count-all").textContent = counts.all;
  document.querySelector("#count-pending").textContent = counts.pending;
  document.querySelector("#count-completed").textContent = counts.completed;
  document.querySelector("#progress-number").textContent = counts.completed;
  document.querySelector("#total-number").textContent = counts.all;
  const percentage = counts.all ? Math.round((counts.completed / counts.all) * 100) : 0;
  document.querySelector("#progress-percent").textContent = `${percentage}%`;
  document.querySelector("#progress-fill").style.width = `${percentage}%`;
  document.querySelector("#progress-track").setAttribute("aria-valuenow", String(percentage));
}

function makeButton(className, label, iconName, handler) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = icons[iconName];
  button.addEventListener("click", handler);
  return button;
}

function renderTasks(tasks, counts) {
  setCounts(counts);
  const [heading, filterLabel] = filterTitles[activeFilter];
  document.querySelector("#page-title").innerHTML = `${heading}<span class="heading-period">.</span>`;
  document.querySelector("#list-heading").textContent = filterLabel;
  document.querySelector("#result-count").textContent = tasks.length;
  document.querySelector("#footer-summary").textContent =
    counts.pending === 0 && counts.all > 0 ? "Everything is wrapped up. Nice work." : "A clear mind starts with a clear list.";

  if (!tasks.length) {
    const hasSearch = Boolean(searchInput.value.trim());
    const isEmptyWorkspace = counts.all === 0 && activeFilter === "all" && !hasSearch;
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const illustration = document.createElement("span");
    illustration.className = "empty-illustration";
    illustration.innerHTML = icons.empty;
    const title = document.createElement("strong");
    title.textContent = hasSearch ? "No matching tasks" : isEmptyWorkspace ? "A fresh start." : activeFilter === "completed" ? "Nothing completed yet" : "All caught up.";
    const copy = document.createElement("p");
    copy.textContent = hasSearch
      ? "Try another search or clear the search field."
      : isEmptyWorkspace
        ? "Add your first task and give today a clear direction."
        : activeFilter === "completed"
          ? "Tasks you finish will show up here."
          : "There are no pending tasks right now.";
    empty.append(illustration, title, copy);
    if (isEmptyWorkspace) {
      const add = document.createElement("button");
      add.className = "primary-button";
      add.type = "button";
      add.innerHTML = `${icons.plus} <span>Create your first task</span>`;
      add.addEventListener("click", () => openModal());
      empty.append(add);
    }
    taskList.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  tasks.forEach((task, index) => {
    const row = document.createElement("article");
    row.className = `task-row${task.completed ? " is-complete" : ""}`;
    row.style.animationDelay = `${Math.min(index, 8) * 25}ms`;
    const complete = makeButton("complete-button", task.completed ? "Mark as pending" : "Mark as completed", "check", async () => {
      try {
        await apiRequest(`/api/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({ completed: !task.completed }),
        });
        await loadTasks();
        showToast(task.completed ? "Task moved back to pending." : "Task completed.");
      } catch (error) {
        showToast(error.message, true);
      }
    });
    const main = document.createElement("div");
    main.className = "task-main";
    const title = document.createElement("p");
    title.className = "task-title";
    title.textContent = task.title;
    title.title = task.title;
    main.append(title);
    if (task.description) {
      const description = document.createElement("p");
      description.className = "task-description";
      description.textContent = task.description;
      description.title = task.description;
      main.append(description);
    }

    const meta = document.createElement("div");
    meta.className = "task-meta";
    if (task.due_date) {
      const due = dateLabel(task.due_date);
      const deadline = document.createElement("span");
      deadline.className = "deadline";
      if (!task.completed && due.diff < 0) deadline.classList.add("is-overdue");
      if (!task.completed && due.diff === 0) deadline.classList.add("is-today");
      deadline.innerHTML = icons.calendar;
      const dueText = document.createElement("span");
      dueText.textContent = due.diff === 0 ? "Today" : due.label;
      deadline.append(dueText);
      meta.append(deadline);
    }

    const actions = document.createElement("div");
    actions.className = "task-actions";
    actions.append(
      makeButton("icon-button", `Edit ${task.title}`, "edit", () => openModal(task)),
      makeButton("icon-button delete-button", `Delete ${task.title}`, "trash", async () => {
        if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return;
        try {
          await apiRequest(`/api/tasks/${task.id}`, { method: "DELETE" });
          await loadTasks();
          showToast("Task deleted.");
        } catch (error) {
          showToast(error.message, true);
        }
      }),
    );

    row.append(complete, main, meta, actions);
    fragment.append(row);
  });
  taskList.replaceChildren(fragment);
}

async function loadTasks() {
  const query = new URLSearchParams({ status: activeFilter });
  if (searchInput.value.trim()) query.set("q", searchInput.value.trim());
  try {
    const result = await apiRequest(`/api/tasks?${query.toString()}`, { headers: {} });
    renderTasks(result.tasks, result.counts);
  } catch (error) {
    const message = document.createElement("div");
    message.className = "empty-state";
    const title = document.createElement("strong");
    title.textContent = "Couldn't load your tasks";
    const copy = document.createElement("p");
    copy.textContent = error.message;
    const retry = document.createElement("button");
    retry.className = "secondary-button";
    retry.type = "button";
    retry.textContent = "Try again";
    retry.addEventListener("click", loadTasks);
    message.append(title, copy, retry);
    taskList.replaceChildren(message);
  }
}

function openModal(task = null) {
  editingTaskId = task?.id ?? null;
  document.querySelector("#modal-title").textContent = task ? "Edit task" : "Create a task";
  document.querySelector("#submit-label").textContent = task ? "Save changes" : "Create task";
  titleInput.value = task?.title ?? "";
  descriptionInput.value = task?.description ?? "";
  deadlineInput.value = task?.due_date ?? "";
  titleError.textContent = "";
  taskModal.hidden = false;
  document.body.classList.add("modal-open");
  window.requestAnimationFrame(() => titleInput.focus());
}

function closeModal() {
  taskModal.hidden = true;
  document.body.classList.remove("modal-open");
  taskForm.reset();
  editingTaskId = null;
  titleError.textContent = "";
}

document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
}).format(new Date());

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("is-active", item === button));
    loadTasks();
  });
});

document.querySelector("#add-task-button").addEventListener("click", () => openModal());
document.querySelector("#close-modal").addEventListener("click", closeModal);
document.querySelector("#cancel-modal").addEventListener("click", closeModal);
taskModal.addEventListener("click", (event) => {
  if (event.target === taskModal) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !taskModal.hidden) closeModal();
  if (event.key === "/" && taskModal.hidden && document.activeElement !== searchInput) {
    event.preventDefault();
    searchInput.focus();
  }
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) {
    titleError.textContent = "Please enter a task title.";
    titleInput.focus();
    return;
  }
  if (title.length > 120) {
    titleError.textContent = "Keep the title under 120 characters.";
    titleInput.focus();
    return;
  }
  titleError.textContent = "";
  const body = {
    title,
    description: descriptionInput.value.trim(),
    due_date: deadlineInput.value || null,
  };
  const wasEditing = editingTaskId !== null;
  const submitButton = taskForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    await apiRequest(editingTaskId ? `/api/tasks/${editingTaskId}` : "/api/tasks", {
      method: editingTaskId ? "PUT" : "POST",
      body: JSON.stringify(body),
    });
    closeModal();
    await loadTasks();
    showToast(wasEditing ? "Changes saved." : "Task created.");
  } catch (error) {
    titleError.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

searchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(loadTasks, 180);
});

loadTasks();
