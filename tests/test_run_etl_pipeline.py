import json
import tempfile
from pathlib import Path

import run_etl_pipeline as etl

TEST_DIR = Path(__file__).resolve().parent


class TestPipelineLock:
    def test_acquire_lock_removes_dead_pid(self, monkeypatch):
        with tempfile.TemporaryDirectory(dir=TEST_DIR) as tmp_dir:
            lock_file = Path(tmp_dir) / "lkw_etl_pipeline.lock"
            lock_file.write_text(json.dumps({"pid": 6096, "started_at": 1}), encoding="utf-8")

            monkeypatch.setattr(etl, "LOCK_FILE", lock_file)
            monkeypatch.setattr(etl, "LOCK_STALE_SEC", 6 * 3600)
            monkeypatch.setattr(etl, "is_process_running", lambda pid: False)

            assert etl.acquire_pipeline_lock() is True
            payload = json.loads(lock_file.read_text(encoding="utf-8"))
            assert payload["pid"] > 0
            assert payload["pid"] != 6096

            etl.release_pipeline_lock()
            assert not lock_file.exists()

    def test_acquire_lock_keeps_live_pid_blocked(self, monkeypatch):
        with tempfile.TemporaryDirectory(dir=TEST_DIR) as tmp_dir:
            lock_file = Path(tmp_dir) / "lkw_etl_pipeline.lock"
            lock_file.write_text(json.dumps({"pid": 777, "started_at": 1}), encoding="utf-8")

            monkeypatch.setattr(etl, "LOCK_FILE", lock_file)
            monkeypatch.setattr(etl, "LOCK_STALE_SEC", 10**9)
            monkeypatch.setattr(etl, "is_process_running", lambda pid: pid == 777)

            assert etl.acquire_pipeline_lock() is False
            payload = json.loads(lock_file.read_text(encoding="utf-8"))
            assert payload["pid"] == 777

    def test_acquire_lock_removes_invalid_payload(self, monkeypatch):
        with tempfile.TemporaryDirectory(dir=TEST_DIR) as tmp_dir:
            lock_file = Path(tmp_dir) / "lkw_etl_pipeline.lock"
            lock_file.write_text("{broken", encoding="utf-8")

            monkeypatch.setattr(etl, "LOCK_FILE", lock_file)
            monkeypatch.setattr(etl, "is_process_running", lambda pid: False)

            assert etl.acquire_pipeline_lock() is True
            payload = json.loads(lock_file.read_text(encoding="utf-8"))
            assert payload["pid"] > 0

            etl.release_pipeline_lock()
            assert not lock_file.exists()
