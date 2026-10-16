import os
import sqlite3
from contextlib import contextmanager
from datetime import date
from pathlib import Path

from flask import Flask, jsonify, render_template, request


BASE_DIR = Path(__file__).resolve().parent
INSTANCE_DIR = BASE_DIR / "instance"
DATABASE_PATH = Path(os.environ.get("TODO_DB_PATH", INSTANCE_DIR / "tasks.sqlite3"))

app = Flask(__name__)
app.json.sort_keys = False


def get_db():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(DATABASE_PATH)


@contextmanager
def db_connection():
    connection = get_db()
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database():
    with db_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                due_date TEXT,
                completed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )


def task_to_dict(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "due_date": row["due_date"],
        "completed": bool(row["completed"]),
        "created_at": row["created_at"],
    }


def validate_task_fields(data, partial=False):
    if not isinstance(data, dict):
        return None, "Request body must be a JSON object."

    allowed = {"title", "description", "due_date", "completed"}
    unexpected = set(data) - allowed
    if unexpected:
        return None, f"Unknown field: {sorted(unexpected)[0]}."

    if not partial and "title" not in data:
        return None, "A task title is required."

    fields = {}
    if "title" in data:
        title = data["title"]
        if not isinstance(title, str) or not title.strip():
            return None, "Enter a task title."
        title = title.strip()
        if len(title) > 120:
            return None, "Task titles must be 120 characters or fewer."
        fields["title"] = title

    if "description" in data:
        description = data["description"]
        if not isinstance(description, str):
            return None, "Description must be text."
        description = description.strip()
        if len(description) > 500:
            return None, "Descriptions must be 500 characters or fewer."
        fields["description"] = description

    if "due_date" in data:
        due_date = data["due_date"]
        if due_date in (None, ""):
            fields["due_date"] = None
        elif not isinstance(due_date, str):
            return None, "Deadline must be a valid date."
        else:
            try:
                fields["due_date"] = date.fromisoformat(due_date).isoformat()
            except ValueError:
                return None, "Deadline must be a valid date."

    if "completed" in data:
        if not isinstance(data["completed"], bool):
            return None, "Completed must be true or false."
        fields["completed"] = int(data["completed"])

    return fields, None


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/tasks")
def list_tasks():
    status = request.args.get("status", "all").lower()
    if status not in {"all", "pending", "completed"}:
        return jsonify(error="Status must be all, pending, or completed."), 400

    search = request.args.get("q", "").strip()
    query = "SELECT * FROM tasks"
    conditions = []
    params = []

    if status == "pending":
        conditions.append("completed = 0")
    elif status == "completed":
        conditions.append("completed = 1")
    if search:
        conditions.append("(title LIKE ? OR description LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])

    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY completed ASC, CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, id DESC"

    with db_connection() as connection:
        rows = connection.execute(query, params).fetchall()
        counts = connection.execute(
            """
            SELECT COUNT(*) AS all_count,
                   COALESCE(SUM(CASE WHEN completed = 0 THEN 1 ELSE 0 END), 0) AS pending_count,
                   COALESCE(SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END), 0) AS completed_count
            FROM tasks
            """
        ).fetchone()

    return jsonify(
        tasks=[task_to_dict(row) for row in rows],
        counts={
            "all": counts["all_count"],
            "pending": counts["pending_count"],
            "completed": counts["completed_count"],
        },
    )


@app.post("/api/tasks")
def create_task():
    fields, error = validate_task_fields(request.get_json(silent=True))
    if error:
        return jsonify(error=error), 400

    with db_connection() as connection:
        cursor = connection.execute(
            "INSERT INTO tasks (title, description, due_date, completed) VALUES (?, ?, ?, ?)",
            (
                fields["title"],
                fields.get("description", ""),
                fields.get("due_date"),
                fields.get("completed", 0),
            ),
        )
        row = connection.execute(
            "SELECT * FROM tasks WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()

    return jsonify(task=task_to_dict(row)), 201


@app.put("/api/tasks/<int:task_id>")
def replace_task(task_id):
    fields, error = validate_task_fields(request.get_json(silent=True))
    if error:
        return jsonify(error=error), 400

    with db_connection() as connection:
        existing = connection.execute(
            "SELECT id FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
        if existing is None:
            return jsonify(error="Task not found."), 404
        connection.execute(
            """
            UPDATE tasks
            SET title = ?, description = ?, due_date = ?, completed = ?
            WHERE id = ?
            """,
            (
                fields["title"],
                fields.get("description", ""),
                fields.get("due_date"),
                fields.get("completed", 0),
                task_id,
            ),
        )
        row = connection.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()

    return jsonify(task=task_to_dict(row))


@app.patch("/api/tasks/<int:task_id>")
def update_task(task_id):
    fields, error = validate_task_fields(request.get_json(silent=True), partial=True)
    if error:
        return jsonify(error=error), 400
    if not fields:
        return jsonify(error="Provide at least one field to update."), 400

    with db_connection() as connection:
        existing = connection.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()
        if existing is None:
            return jsonify(error="Task not found."), 404

        updates = {key: existing[key] for key in ("title", "description", "due_date", "completed")}
        updates.update(fields)
        connection.execute(
            """
            UPDATE tasks
            SET title = ?, description = ?, due_date = ?, completed = ?
            WHERE id = ?
            """,
            (
                updates["title"],
                updates["description"],
                updates["due_date"],
                updates["completed"],
                task_id,
            ),
        )
        row = connection.execute(
            "SELECT * FROM tasks WHERE id = ?", (task_id,)
        ).fetchone()

    return jsonify(task=task_to_dict(row))


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id):
    with db_connection() as connection:
        cursor = connection.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        if cursor.rowcount == 0:
            return jsonify(error="Task not found."), 404
    return "", 204


initialize_database()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5000")))
