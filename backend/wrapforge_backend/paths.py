"""Path safety helpers for untrusted project and asset input."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path, PurePosixPath


class UnsafePathError(ValueError):
    pass


def safe_relative_path(value: str) -> PurePosixPath:
    if not value or not value.strip():
        raise UnsafePathError("Path is empty")
    if "\x00" in value:
        raise UnsafePathError("Path contains a null byte")
    if "\\" in value:
        raise UnsafePathError("Paths must use forward slashes")
    path = PurePosixPath(value)
    if path.is_absolute():
        raise UnsafePathError("Path must be relative")
    for part in path.parts:
        if part in ("", ".", ".."):
            raise UnsafePathError("Path must not contain '.' or '..' components")
        if part.startswith("~"):
            raise UnsafePathError("Path must not expand a home directory")
    return path


def safe_join(root: Path | str, relative: str) -> Path:
    root_path = Path(root).expanduser().resolve()
    relative_path = safe_relative_path(relative)
    candidate = (root_path / relative_path).resolve()
    if not candidate.is_relative_to(root_path):
        raise UnsafePathError("Path escapes the project root")
    return candidate


def validate_file_name(name: str) -> str:
    if not name or len(name) > 255:
        raise UnsafePathError("Invalid file name length")
    if any(separator in name for separator in ("/", "\\", "\x00")):
        raise UnsafePathError("File name must not contain a path separator")
    if name in (".", ".."):
        raise UnsafePathError("Invalid file name")
    return name


def atomic_write(path: Path | str, data: bytes, *, backup: bool = False) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(
        prefix=f".{target.name}.tmp-", dir=target.parent
    )
    temp_path = Path(temp_name)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        if backup and target.exists():
            backup_path = target.with_name(f"{target.name}.bak")
            backup_path.write_bytes(target.read_bytes())
        os.replace(temp_path, target)
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)
    return target


def home_dir() -> Path | None:
    value = os.environ.get("HOME") or os.environ.get("USERPROFILE")
    return Path(value) if value else None
