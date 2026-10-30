from __future__ import annotations

import os

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

HOST = os.environ.get("BMP_HOST", "0.0.0.0")
PORT = int(os.environ.get("BMP_PORT", "5001"))
DEBUG = os.environ.get("BMP_DEBUG", "false").lower() == "true"

MAX_CONTENT_LENGTH = 32 * 1024 * 1024  # 32 MB

UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
PROJECTS_FOLDER = os.path.join(BASE_DIR, "projects")
TMP_FOLDER = os.path.join(BASE_DIR, "tmp")

SECRET_KEY = os.environ.get("BMP_SECRET_KEY", "bmp-pro-local-dev-secret-key")