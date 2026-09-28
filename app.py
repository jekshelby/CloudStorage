import os
import shutil
import hashlib
from flask import Flask, render_template, request, jsonify, send_file, abort
from PIL import Image

app = Flask(__name__)

BASE_DIR = os.path.abspath("shared")
os.makedirs(BASE_DIR, exist_ok=True)

CHUNK_TMP = os.path.join(BASE_DIR, ".chunks")
os.makedirs(CHUNK_TMP, exist_ok=True)

THUMB_DIR = os.path.join(BASE_DIR, ".thumbs")
os.makedirs(THUMB_DIR, exist_ok=True)

HIDDEN_DIRS = {".chunks", ".thumbs"}


# ==================== HELPERS ====================

def safe_path(rel_path):
    """Cegah path traversal (../../etc)."""
    rel_path = (rel_path or "").strip("/").lstrip("\\")
    target = os.path.abspath(os.path.join(BASE_DIR, rel_path))
    if target != BASE_DIR and not target.startswith(BASE_DIR + os.sep):
        abort(403, "Akses ditolak")
    return target


def human_size(n):
    for unit in ["B", "KB", "MB", "GB"]:
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


# ==================== ROUTES ====================

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/list")
def api_list():
    rel = request.args.get("path", "")
    target = safe_path(rel)
    if not os.path.isdir(target):
        return jsonify({"error": "Bukan folder"}), 400

    items = []
    for name in sorted(os.listdir(target)):
        if name in HIDDEN_DIRS:
            continue
        full = os.path.join(target, name)
        is_dir = os.path.isdir(full)
        try:
            st = os.stat(full)
            size = st.st_size if not is_dir else 0
            mtime = st.st_mtime
        except OSError:
            size, mtime = 0, 0
        items.append({
            "name": name,
            "is_dir": is_dir,
            "size": size,
            "size_human": "-" if is_dir else human_size(size),
            "mtime": mtime,
        })

    items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))

    return jsonify({
        "path": rel,
        "items": items,
        "parent": os.path.dirname(rel) if rel else None,
    })


@app.route("/api/folder", methods=["POST"])
def api_new_folder():
    data = request.get_json(silent=True) or {}
    parent = data.get("path", "")
    name = (data.get("name") or "").strip()

    if not name or "/" in name or "\\" in name:
        return jsonify({"error": "Nama folder tidak valid"}), 400

    target = os.path.join(safe_path(parent), name)
    if os.path.exists(target):
        return jsonify({"error": "Sudah ada"}), 400

    os.makedirs(target)
    return jsonify({"ok": True})


@app.route("/api/delete", methods=["POST"])
def api_delete():
    data = request.get_json(silent=True) or {}
    rel = data.get("path", "")
    if not rel:
        return jsonify({"error": "Path kosong"}), 400

    target = safe_path(rel)
    if not os.path.exists(target):
        return jsonify({"error": "Tidak ada"}), 404

    if os.path.isdir(target):
        shutil.rmtree(target)
    else:
        os.remove(target)
    return jsonify({"ok": True})


@app.route("/api/rename", methods=["POST"])
def api_rename():
    data = request.get_json(silent=True) or {}
    rel = data.get("path", "")
    new_name = (data.get("new_name") or "").strip()

    if not new_name or "/" in new_name or "\\" in new_name:
        return jsonify({"error": "Nama tidak valid"}), 400

    target = safe_path(rel)
    if not os.path.exists(target):
        return jsonify({"error": "Tidak ditemukan"}), 404

    parent = os.path.dirname(target)
    new_path = os.path.join(parent, new_name)
    if os.path.exists(new_path):
        return jsonify({"error": "Nama sudah dipakai"}), 400

    os.rename(target, new_path)
    return jsonify({"ok": True})


@app.route("/download")
def download():
    rel = request.args.get("path", "")
    target = safe_path(rel)
    if not os.path.isfile(target):
        abort(404)
    return send_file(target, as_attachment=True)


@app.route("/api/file")
def api_file():
    """Serve file inline (untuk preview), bukan download."""
    rel = request.args.get("path", "")
    target = safe_path(rel)
    if not os.path.isfile(target):
        abort(404)
    return send_file(target, as_attachment=False)


@app.route("/api/thumb")
def api_thumb():
    """Thumbnail gambar (max 320px). Di-cache ke disk pakai hash path+mtime."""
    rel = request.args.get("path", "")
    target = safe_path(rel)
    if not os.path.isfile(target):
        abort(404)

    try:
        mtime = os.path.getmtime(target)
    except OSError:
        mtime = 0

    key = hashlib.md5(f"{rel}:{mtime}".encode()).hexdigest() + ".jpg"
    cache_path = os.path.join(THUMB_DIR, key)

    if not os.path.exists(cache_path):
        try:
            img = Image.open(target)
            img = img.convert("RGB")
            img.thumbnail((320, 320), Image.LANCZOS)
            img.save(cache_path, "JPEG", quality=75, optimize=True)
        except Exception:
            abort(415, "Tidak bisa buat thumbnail")

    resp = send_file(cache_path, mimetype="image/jpeg")
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@app.route("/api/upload-chunk", methods=["POST"])
def upload_chunk():
    """Terima 1 potongan file. Kalau sudah lengkap, gabung."""
    if "chunk" not in request.files:
        return jsonify({"error": "Chunk tidak ditemukan"}), 400

    chunk = request.files["chunk"]
    try:
        index = int(request.form["index"])
        total = int(request.form["total"])
    except (KeyError, ValueError):
        return jsonify({"error": "index/total tidak valid"}), 400

    filename = request.form.get("filename", "")
    rel_dir = request.form.get("path", "")
    upload_id = request.form.get("upload_id", filename)

    filename = os.path.basename(filename)
    if not filename:
        return jsonify({"error": "Nama file invalid"}), 400

    tmp_dir = os.path.join(CHUNK_TMP, upload_id)
    os.makedirs(tmp_dir, exist_ok=True)

    chunk.save(os.path.join(tmp_dir, f"{index:06d}.part"))

    if len(os.listdir(tmp_dir)) == total:
        dest_dir = safe_path(rel_dir)
        os.makedirs(dest_dir, exist_ok=True)
        dest = os.path.join(dest_dir, filename)

        try:
            with open(dest, "wb") as out:
                for i in range(total):
                    part = os.path.join(tmp_dir, f"{i:06d}.part")
                    with open(part, "rb") as p:
                        shutil.copyfileobj(p, out)
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

        return jsonify({"status": "done"})

    return jsonify({"status": "chunk_ok", "received": index})


# ==================== MAIN ====================

if __name__ == "__main__":
    print("🌐 Buka di HP: http://<IP-LAPTOP>:5002")
    print(f"📁 Folder shared: {BASE_DIR}")
    app.run(host="0.0.0.0", port=5002, threaded=True, debug=False)