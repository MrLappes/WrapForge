from __future__ import annotations

from pathlib import Path

import pytest

from wrapforge_backend.paths import (
    UnsafePathError,
    atomic_write,
    safe_join,
    safe_relative_path,
    validate_file_name,
)


@pytest.mark.parametrize(
    "value",
    [
        "/etc/passwd",
        "../secret",
        "assets/../../secret",
        "assets\\evil",
        "~/secret",
        "",
        "assets/\x00evil",
    ],
)
def test_unsafe_relative_paths_are_rejected(value: str) -> None:
    with pytest.raises(UnsafePathError):
        safe_relative_path(value)


def test_safe_relative_path_accepts_project_paths() -> None:
    assert str(safe_relative_path("assets/artwork/logo.svg")) == "assets/artwork/logo.svg"


def test_safe_join_stays_inside_root(tmp_path: Path) -> None:
    inside = tmp_path / "assets" / "logo.svg"
    inside.parent.mkdir(parents=True)
    inside.write_text("x")
    assert safe_join(tmp_path, "assets/logo.svg") == inside.resolve()
    with pytest.raises(UnsafePathError):
        safe_join(tmp_path, "../outside")


@pytest.mark.parametrize("name", ["", "a/b.png", "a\\b.png", "..", "a\x00b"])
def test_invalid_file_names_are_rejected(name: str) -> None:
    with pytest.raises(UnsafePathError):
        validate_file_name(name)


def test_valid_file_name() -> None:
    assert validate_file_name("panel-01@150dpi.png") == "panel-01@150dpi.png"


def test_atomic_write_and_backup(tmp_path: Path) -> None:
    target = tmp_path / "project.json"
    atomic_write(target, b"first")
    assert target.read_bytes() == b"first"
    atomic_write(target, b"second", backup=True)
    assert target.read_bytes() == b"second"
    assert (tmp_path / "project.json.bak").read_bytes() == b"first"


def test_atomic_write_does_not_leave_temp_files(tmp_path: Path) -> None:
    target = tmp_path / "nested" / "file.txt"
    atomic_write(target, b"data")
    assert target.read_bytes() == b"data"
    assert not list(tmp_path.rglob("*.tmp-*"))
