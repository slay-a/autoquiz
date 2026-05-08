"""
FEAT-014 — §14.3 Event Catalog Completeness
Red-phase tests: each test pins a gap from the triaged blocker list.
All tests must FAIL against the current codebase.

Blockers covered:
  B-1: upload.py missing log_event("upload.file.accepted") and log_event("upload.file.rejected")
  B-2: retrieval.py missing log_event("retrieval.search.completed") with duration_ms/top_k/chunks_returned/fallback_keyword
  B-3: notes_gen.py missing log_event("notes.generate.started"), "completed", "failed"
  B-4: classes.py publish_class_note missing log_event("notes.publish.toggled")
  B-5: flashcards.py missing log_event("flashcard.set.created") and log_event("flashcard.set.shared")
  B-6: classes.py remove_member missing log_event("class.member.removed")
  B-7: quiz.py emits quiz.load.completed which is absent from DESIGN.md §14.3 — must be added there
"""

import pathlib
import pytest
import io
import jwt
import uuid
import time
from unittest.mock import MagicMock, patch, call
from fastapi.testclient import TestClient

from main import app

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
from app.api.dependencies import get_current_user

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

SECRET = "test-secret"


def _make_token(user_id: str = None, role: str = "instructor") -> str:
    uid = user_id or str(uuid.uuid4())
    payload = {
        "sub": uid,
        "email": "test@example.com",
        "user_metadata": {"role": role},
        "exp": int(time.time()) + 3600,
    }
    return jwt.encode(payload, SECRET, algorithm="HS256"), uid


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# B-1: upload.py — upload.file.accepted and upload.file.rejected
# ---------------------------------------------------------------------------

class TestUploadFileEvents:
    """
    B-1: upload route must call log_event("upload.file.accepted", ...) on
    success and log_event("upload.file.rejected", ...) on rejection.
    AC-1, AC-2 (Story 1).
    """

    def _make_mock_supabase_for_upload(self):
        mock_sb = MagicMock()
        # storage upload
        mock_sb.storage.from_.return_value.upload.return_value = MagicMock(data={"path": "some/path"})
        # table insert for uploaded_files
        mock_table = MagicMock()
        mock_table.insert.return_value.execute.return_value = MagicMock(data=[{"file_id": "fid-1"}])
        # table insert for processing_jobs
        mock_sb.table.return_value = mock_table
        return mock_sb

    def test_accepted_file_emits_log_event(self):
        """
        AC-1: upload.file.accepted emitted with mime_type and size_bytes meta
        on a valid accepted file upload.
        """
        token, user_id = _make_token(role="instructor")
        client = TestClient(app)

        mock_sb = self._make_mock_supabase_for_upload()
        # store_file_and_create_job must succeed
        fake_job_result = {
            "file_id": "fid-123",
            "job_id": "jid-123",
            "status": "queued",
            "message": "Upload queued",
            "filename": "test.pdf",
        }

        with patch("app.api.routes.upload.store_file_and_create_job", return_value=fake_job_result), \
             patch("app.api.routes.upload.process_document") as mock_task, \
             patch("app.api.routes.upload.log_event") as mock_log:
            mock_task.delay = MagicMock()

            pdf_bytes = b"%PDF-1.4 test content"
            response = client.post(
                "/upload/",
                files={"file": ("lecture.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
                headers=_auth_header(token),
            )

        # The route must have called log_event with "upload.file.accepted"
        assert mock_log.called, "log_event was never called in upload route on accepted file"
        calls = [c[0][0] if c[0] else c[1].get("event", "") for c in mock_log.call_args_list]
        # also accept keyword-arg style
        all_events = []
        for c in mock_log.call_args_list:
            if c[0]:
                all_events.append(c[0][0])
            else:
                all_events.append(c[1].get("event", ""))
        assert "upload.file.accepted" in all_events, (
            f"Expected log_event('upload.file.accepted') to be called, got: {all_events}"
        )

    def test_accepted_file_meta_contains_mime_type_and_size_bytes(self):
        """
        AC-1: meta must contain mime_type and size_bytes.
        """
        token, user_id = _make_token(role="instructor")
        client = TestClient(app)

        fake_job_result = {
            "file_id": "fid-123", "job_id": "jid-123",
            "status": "queued", "message": "ok", "filename": "test.pdf",
        }

        with patch("app.api.routes.upload.store_file_and_create_job", return_value=fake_job_result), \
             patch("app.api.routes.upload.process_document") as mock_task, \
             patch("app.api.routes.upload.log_event") as mock_log:
            mock_task.delay = MagicMock()
            pdf_bytes = b"%PDF-1.4 test"
            client.post(
                "/upload/",
                files={"file": ("lecture.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
                headers=_auth_header(token),
            )

        accepted_calls = [
            c for c in mock_log.call_args_list
            if (c[0] and c[0][0] == "upload.file.accepted")
            or c[1].get("event") == "upload.file.accepted"
        ]
        assert accepted_calls, "No log_event('upload.file.accepted') call found"
        # check meta
        call_kwargs = accepted_calls[0][1]
        meta = call_kwargs.get("meta", {})
        assert "mime_type" in meta, f"meta missing 'mime_type': {meta}"
        assert "size_bytes" in meta, f"meta missing 'size_bytes': {meta}"

    def test_rejected_file_ext_emits_log_event_with_warning(self):
        """
        AC-2: upload.file.rejected emitted with level=WARNING, outcome=failure,
        meta={"reason": "ext", "size_bytes": ...} on unsupported extension.
        """
        token, _ = _make_token(role="instructor")
        client = TestClient(app)

        with patch("app.api.routes.upload.log_event") as mock_log:
            client.post(
                "/upload/",
                files={"file": ("notes.txt", io.BytesIO(b"hello"), "text/plain")},
                headers=_auth_header(token),
            )

        all_events = []
        for c in mock_log.call_args_list:
            ev = c[0][0] if c[0] else c[1].get("event", "")
            all_events.append(ev)

        assert "upload.file.rejected" in all_events, (
            f"Expected log_event('upload.file.rejected'), got: {all_events}"
        )
        # check level=WARNING and reason=ext
        rejected = [
            c for c in mock_log.call_args_list
            if (c[0] and c[0][0] == "upload.file.rejected")
            or c[1].get("event") == "upload.file.rejected"
        ]
        kw = rejected[0][1]
        assert kw.get("level", "").upper() == "WARNING", f"Expected level WARNING, got {kw.get('level')}"
        assert kw.get("outcome") == "failure", f"Expected outcome=failure, got {kw.get('outcome')}"
        meta = kw.get("meta", {})
        assert meta.get("reason") == "ext", f"Expected reason='ext', got {meta}"

    def test_rejected_file_size_emits_log_event_with_size_reason(self):
        """
        AC-2: upload.file.rejected emitted with reason='size' on oversized file.
        """
        token, _ = _make_token(role="instructor")
        client = TestClient(app)

        # Patch MAX_BYTES to 10 bytes to force size rejection
        with patch("app.api.routes.upload.MAX_BYTES", 10), \
             patch("app.api.routes.upload.log_event") as mock_log:
            client.post(
                "/upload/",
                files={"file": ("big.pdf", io.BytesIO(b"%PDF-1.4 " + b"x" * 100), "application/pdf")},
                headers=_auth_header(token),
            )

        rejected = [
            c for c in mock_log.call_args_list
            if (c[0] and c[0][0] == "upload.file.rejected")
            or c[1].get("event") == "upload.file.rejected"
        ]
        assert rejected, "Expected log_event('upload.file.rejected') for oversized file"
        meta = rejected[0][1].get("meta", {})
        assert meta.get("reason") == "size", f"Expected reason='size', got {meta}"


# ---------------------------------------------------------------------------
# B-2: retrieval.py — retrieval.search.completed
# ---------------------------------------------------------------------------

class TestRetrievalSearchCompletedEvent:
    """
    B-2: hybrid_search must emit retrieval.search.completed with
    top_k, chunks_returned, fallback_keyword, and duration_ms.
    AC-1, AC-2 (Story 2).
    """

    def test_search_completed_emitted_on_vector_path(self):
        """
        AC-1: retrieval.search.completed called after vector search succeeds.
        duration_ms must be present (int >= 0).
        """
        from app.services.retrieval import hybrid_search

        fake_chunks = [{"chunk_id": "c1", "text": "foo", "similarity": 0.9}]

        with patch("app.services.retrieval.embed_query", return_value=[0.1] * 1536), \
             patch("app.services.retrieval.get_supabase") as mock_get_sb, \
             patch("app.services.retrieval.log_event") as mock_log:

            mock_sb = MagicMock()
            mock_sb.rpc.return_value.execute.return_value = MagicMock(data=fake_chunks)
            mock_get_sb.return_value = mock_sb

            result = hybrid_search("machine learning", top_k=5)

        all_events = [
            (c[0][0] if c[0] else c[1].get("event", ""))
            for c in mock_log.call_args_list
        ]
        assert "retrieval.search.completed" in all_events, (
            f"Expected retrieval.search.completed, got: {all_events}"
        )

    def test_search_completed_meta_fields_present(self):
        """
        AC-1: meta must contain top_k, chunks_returned, fallback_keyword.
        duration_ms must be an int >= 0.
        """
        from app.services.retrieval import hybrid_search

        fake_chunks = [
            {"chunk_id": "c1", "text": "foo", "similarity": 0.9},
            {"chunk_id": "c2", "text": "bar", "similarity": 0.8},
        ]

        with patch("app.services.retrieval.embed_query", return_value=[0.1] * 1536), \
             patch("app.services.retrieval.get_supabase") as mock_get_sb, \
             patch("app.services.retrieval.log_event") as mock_log:

            mock_sb = MagicMock()
            mock_sb.rpc.return_value.execute.return_value = MagicMock(data=fake_chunks)
            mock_get_sb.return_value = mock_sb

            hybrid_search("topic", file_id="fid-1", top_k=10)

        ev_calls = [
            c for c in mock_log.call_args_list
            if (c[0] and c[0][0] == "retrieval.search.completed")
            or c[1].get("event") == "retrieval.search.completed"
        ]
        assert ev_calls, "retrieval.search.completed never called"
        kw = ev_calls[0][1]
        meta = kw.get("meta", {})
        assert "top_k" in meta, f"meta missing top_k: {meta}"
        assert "chunks_returned" in meta, f"meta missing chunks_returned: {meta}"
        assert "fallback_keyword" in meta, f"meta missing fallback_keyword: {meta}"
        duration = kw.get("duration_ms")
        assert duration is not None, "duration_ms must be set on retrieval.search.completed"
        assert isinstance(duration, int) and duration >= 0, f"duration_ms must be int >= 0, got {duration}"

    def test_search_completed_emitted_on_fallback_path(self):
        """
        AC-2: retrieval.search.completed also fires on the fallback keyword path,
        with fallback_keyword=True and outcome=success.
        """
        from app.services.retrieval import hybrid_search

        with patch("app.services.retrieval.embed_query", return_value=[0.1] * 1536), \
             patch("app.services.retrieval.get_supabase") as mock_get_sb, \
             patch("app.services.retrieval._sync_extract_and_search", return_value=[
                 {"chunk_id": "sync-1", "text": "page text", "score": 2}
             ]) as mock_fallback, \
             patch("app.services.retrieval.log_event") as mock_log:

            mock_sb = MagicMock()
            # vector search returns empty → triggers fallback
            mock_sb.rpc.return_value.execute.return_value = MagicMock(data=[])
            mock_get_sb.return_value = mock_sb

            hybrid_search("quantum", file_id="fid-2", top_k=5)

        ev_calls = [
            c for c in mock_log.call_args_list
            if (c[0] and c[0][0] == "retrieval.search.completed")
            or c[1].get("event") == "retrieval.search.completed"
        ]
        assert ev_calls, "retrieval.search.completed must fire on fallback path"
        meta = ev_calls[0][1].get("meta", {})
        assert meta.get("fallback_keyword") is True, (
            f"fallback_keyword should be True on keyword fallback path, got {meta}"
        )


# ---------------------------------------------------------------------------
# B-3: notes_gen.py — notes.generate.started / completed / failed
# ---------------------------------------------------------------------------

class TestNotesGenLifecycleEvents:
    """
    B-3: generate_notes must emit started, completed, and failed events
    with correct meta and duration_ms on completed/failed.
    AC-1, AC-2, AC-3 (Story 3).
    """

    def test_generate_started_emitted(self):
        """
        AC-1: notes.generate.started emitted before LLM call with meta={"outside_sources": bool}.
        """
        from app.services.notes_gen import generate_notes

        mock_response = MagicMock()
        mock_response.choices[0].message.content = '{"summary": "s", "key_concepts": [], "important_details": [], "common_misconceptions": [], "scope": {}, "study_tips": []}'

        with patch("app.services.notes_gen._openai") as mock_ai, \
             patch("app.services.notes_gen.log_event") as mock_log:
            mock_ai.chat.completions.create.return_value = mock_response
            generate_notes("photosynthesis", chunks=[], outside_sources=True)

        events = [
            (c[0][0] if c[0] else c[1].get("event", ""))
            for c in mock_log.call_args_list
        ]
        assert "notes.generate.started" in events, (
            f"notes.generate.started not called. Got: {events}"
        )

    def test_generate_started_meta_outside_sources(self):
        """
        AC-1: notes.generate.started meta must include outside_sources as bool.
        """
        from app.services.notes_gen import generate_notes

        mock_response = MagicMock()
        mock_response.choices[0].message.content = '{"summary": "s", "key_concepts": [], "important_details": [], "common_misconceptions": [], "scope": {}, "study_tips": []}'

        with patch("app.services.notes_gen._openai") as mock_ai, \
             patch("app.services.notes_gen.log_event") as mock_log:
            mock_ai.chat.completions.create.return_value = mock_response
            generate_notes("topic", chunks=[], outside_sources=False)

        started = [
            c for c in mock_log.call_args_list
            if (c[0] and c[0][0] == "notes.generate.started")
            or c[1].get("event") == "notes.generate.started"
        ]
        assert started, "notes.generate.started not called"
        meta = started[0][1].get("meta", {})
        assert "outside_sources" in meta, f"meta missing outside_sources: {meta}"
        assert isinstance(meta["outside_sources"], bool), "outside_sources must be bool"

    def test_generate_completed_emitted_with_duration(self):
        """
        AC-2: notes.generate.completed emitted on success with duration_ms and
        meta={"has_file": bool, "prompt_tokens": int}.
        """
        from app.services.notes_gen import generate_notes

        mock_choice = MagicMock()
        mock_choice.message.content = '{"summary": "s", "key_concepts": [], "important_details": [], "common_misconceptions": [], "scope": {}, "study_tips": []}'
        mock_usage = MagicMock()
        mock_usage.prompt_tokens = 42
        mock_response = MagicMock()
        mock_response.choices = [mock_choice]
        mock_response.usage = mock_usage

        with patch("app.services.notes_gen._openai") as mock_ai, \
             patch("app.services.notes_gen.log_event") as mock_log:
            mock_ai.chat.completions.create.return_value = mock_response
            generate_notes("topic", chunks=[{"text": "chunk", "page_numbers": [1]}], outside_sources=False)

        events = [
            c[0][0] if c[0] else c[1].get("event", "")
            for c in mock_log.call_args_list
        ]
        assert "notes.generate.completed" in events, (
            f"notes.generate.completed not called. Got: {events}"
        )
        completed = [
            c for c in mock_log.call_args_list
            if (c[0] and c[0][0] == "notes.generate.completed")
            or c[1].get("event") == "notes.generate.completed"
        ]
        kw = completed[0][1]
        assert kw.get("duration_ms") is not None, "duration_ms required on notes.generate.completed"
        assert isinstance(kw["duration_ms"], int) and kw["duration_ms"] >= 0
        meta = kw.get("meta", {})
        assert "has_file" in meta, f"meta missing has_file: {meta}"
        assert "prompt_tokens" in meta, f"meta missing prompt_tokens: {meta}"

    def test_generate_failed_emitted_on_exception(self):
        """
        AC-3: notes.generate.failed emitted on exception with level=ERROR,
        outcome=failure, duration_ms, meta={"error_code", "exception_type"}.
        """
        from app.services.notes_gen import generate_notes

        with patch("app.services.notes_gen._openai") as mock_ai, \
             patch("app.services.notes_gen.log_event") as mock_log:
            mock_ai.chat.completions.create.side_effect = RuntimeError("OpenAI down")
            with pytest.raises(RuntimeError):
                generate_notes("topic", chunks=[], outside_sources=False)

        events = [
            c[0][0] if c[0] else c[1].get("event", "")
            for c in mock_log.call_args_list
        ]
        assert "notes.generate.failed" in events, (
            f"notes.generate.failed not called on exception. Got: {events}"
        )
        failed = [
            c for c in mock_log.call_args_list
            if (c[0] and c[0][0] == "notes.generate.failed")
            or c[1].get("event") == "notes.generate.failed"
        ]
        kw = failed[0][1]
        assert kw.get("level", "").upper() == "ERROR", f"Expected level ERROR, got {kw.get('level')}"
        assert kw.get("outcome") == "failure", f"Expected outcome=failure, got {kw.get('outcome')}"
        assert kw.get("duration_ms") is not None, "duration_ms required on notes.generate.failed"
        meta = kw.get("meta", {})
        assert "error_code" in meta or "exception_type" in meta, (
            f"meta must include error_code or exception_type: {meta}"
        )


# ---------------------------------------------------------------------------
# B-4: classes.py — notes.publish.toggled
# ---------------------------------------------------------------------------

class TestNotesPublishToggledEvent:
    """
    B-4: publish_class_note route must emit notes.publish.toggled after
    DB write succeeds. AC-1, AC-2 (Story 4).
    """

    def test_publish_toggled_emitted_after_db_write(self):
        """
        AC-1: notes.publish.toggled called with meta={"note_id": ..., "is_published": bool}.
        AC-2: event fires after toggle_note_publish succeeds (not before).
        """
        token, user_id = _make_token(role="instructor")
        client = TestClient(app)
        class_id = str(uuid.uuid4())
        note_id = str(uuid.uuid4())

        fake_note = {"id": note_id, "is_published": True, "class_id": class_id}

        with patch("app.api.routes.classes.get_class_detail", return_value={
            "id": class_id, "instructor_id": user_id, "name": "Test"
        }), \
             patch("app.api.routes.classes.toggle_note_publish", return_value=fake_note), \
             patch("app.api.routes.classes.log_event") as mock_log:

            response = client.patch(
                f"/classes/{class_id}/notes/{note_id}/publish",
                json={"is_published": True},
                headers=_auth_header(token),
            )

        publish_calls = [
            c for c in mock_log.call_args_list
            if (c[0] and c[0][0] == "notes.publish.toggled")
            or c[1].get("event") == "notes.publish.toggled"
        ]
        assert publish_calls, (
            "log_event('notes.publish.toggled') must be called on publish toggle"
        )
        meta = publish_calls[0][1].get("meta", {})
        assert "note_id" in meta, f"meta missing note_id: {meta}"
        assert "is_published" in meta, f"meta missing is_published: {meta}"
        assert isinstance(meta["is_published"], bool), "is_published must be bool"

    def test_publish_toggled_not_emitted_when_note_not_found(self):
        """
        AC-2: event must NOT fire if toggle_note_publish raises (DB write failed).
        """
        token, user_id = _make_token(role="instructor")
        client = TestClient(app)
        class_id = str(uuid.uuid4())
        note_id = str(uuid.uuid4())

        with patch("app.api.routes.classes.get_class_detail", return_value={
            "id": class_id, "instructor_id": user_id, "name": "Test"
        }), \
             patch("app.api.routes.classes.toggle_note_publish", side_effect=ValueError("NOTE_NOT_FOUND")), \
             patch("app.api.routes.classes.log_event") as mock_log:

            client.patch(
                f"/classes/{class_id}/notes/{note_id}/publish",
                json={"is_published": True},
                headers=_auth_header(token),
            )

        publish_calls = [
            c for c in mock_log.call_args_list
            if (c[0] and c[0][0] == "notes.publish.toggled")
            or c[1].get("event") == "notes.publish.toggled"
        ]
        assert not publish_calls, (
            "notes.publish.toggled must NOT be emitted when DB write fails"
        )


# ---------------------------------------------------------------------------
# B-5: flashcards.py — flashcard.set.created and flashcard.set.shared
# ---------------------------------------------------------------------------

class TestFlashcardSetEvents:
    """
    B-5: flashcards route must emit flashcard.set.created and flashcard.set.shared.
    AC-1, AC-2 (Story 5).
    """

    def test_flashcard_set_created_emitted(self):
        """
        AC-1: flashcard.set.created called with meta={"set_id": ..., "card_count": int, "set_type": ...}.
        """
        token, user_id = _make_token(role="student")
        client = TestClient(app)
        set_id = str(uuid.uuid4())

        fake_row = {
            "id": set_id,
            "title": "My set",
            "cards": [{"front": "Q1", "back": "A1"}],
            "created_by": user_id,
            "is_shared": False,
            "set_type": "all",
        }

        with patch("app.api.routes.flashcards.get_supabase") as mock_get_sb, \
             patch("app.api.routes.flashcards.log_event") as mock_log:

            mock_sb = MagicMock()
            mock_sb.table.return_value.insert.return_value.select.return_value.single.return_value.execute.return_value = MagicMock(data=fake_row)
            mock_get_sb.return_value = mock_sb

            response = client.post(
                "/flashcards/",
                json={"title": "My set", "cards": [{"front": "Q1", "back": "A1"}], "set_type": "all"},
                headers=_auth_header(token),
            )

        created_calls = [
            c for c in mock_log.call_args_list
            if (c[0] and c[0][0] == "flashcard.set.created")
            or c[1].get("event") == "flashcard.set.created"
        ]
        assert created_calls, "log_event('flashcard.set.created') must be called"
        meta = created_calls[0][1].get("meta", {})
        assert "set_id" in meta, f"meta missing set_id: {meta}"
        assert "card_count" in meta, f"meta missing card_count: {meta}"
        assert "set_type" in meta, f"meta missing set_type: {meta}"
        assert isinstance(meta["card_count"], int), "card_count must be int"

    def test_flashcard_set_shared_emitted(self):
        """
        AC-2: flashcard.set.shared called with meta={"set_id": ..., "scope": "class"|"public"}.
        """
        token, user_id = _make_token(role="student")
        client = TestClient(app)
        set_id = str(uuid.uuid4())

        existing = MagicMock(data={"created_by": user_id})
        updated_row = MagicMock(data={"id": set_id, "is_public": True})

        with patch("app.api.routes.flashcards.get_supabase") as mock_get_sb, \
             patch("app.api.routes.flashcards.log_event") as mock_log:

            mock_sb = MagicMock()
            # ownership check
            mock_sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = existing
            # update
            mock_sb.table.return_value.update.return_value.eq.return_value.select.return_value.single.return_value.execute.return_value = updated_row
            mock_get_sb.return_value = mock_sb

            client.patch(
                f"/flashcards/{set_id}/share",
                json={"is_public": True},
                headers=_auth_header(token),
            )

        shared_calls = [
            c for c in mock_log.call_args_list
            if (c[0] and c[0][0] == "flashcard.set.shared")
            or c[1].get("event") == "flashcard.set.shared"
        ]
        assert shared_calls, "log_event('flashcard.set.shared') must be called"
        meta = shared_calls[0][1].get("meta", {})
        assert "set_id" in meta, f"meta missing set_id: {meta}"
        assert "scope" in meta, f"meta missing scope: {meta}"
        assert meta["scope"] in ("class", "public"), f"scope must be 'class' or 'public': {meta}"


# ---------------------------------------------------------------------------
# B-6: classes.py — class.member.removed
# ---------------------------------------------------------------------------

class TestClassMemberRemovedEvent:
    """
    B-6: remove_member route must emit class.member.removed after DB deletion.
    AC-1, AC-2 (Story 6).
    """

    def test_class_member_removed_emitted_after_delete(self):
        """
        AC-1: class.member.removed called with meta={"class_id": ..., "removed_by_instructor": bool}.
        AC-2: event fires only after remove_class_member succeeds.
        """
        token, user_id = _make_token(role="instructor")
        client = TestClient(app)
        class_id = str(uuid.uuid4())
        student_id = str(uuid.uuid4())

        with patch("app.api.routes.classes.get_class_detail", return_value={
            "id": class_id, "instructor_id": user_id, "name": "Test Class"
        }), \
             patch("app.api.routes.classes.remove_class_member", return_value=None) as mock_remove, \
             patch("app.api.routes.classes.log_event") as mock_log:

            response = client.delete(
                f"/classes/{class_id}/members/{student_id}",
                headers=_auth_header(token),
            )

        # Verify remove was called (DB write happened)
        mock_remove.assert_called_once_with(class_id, student_id)

        removed_calls = [
            c for c in mock_log.call_args_list
            if (c[0] and c[0][0] == "class.member.removed")
            or c[1].get("event") == "class.member.removed"
        ]
        assert removed_calls, "log_event('class.member.removed') must be called after member deletion"
        meta = removed_calls[0][1].get("meta", {})
        assert "class_id" in meta, f"meta missing class_id: {meta}"
        assert "removed_by_instructor" in meta, f"meta missing removed_by_instructor: {meta}"
        assert isinstance(meta["removed_by_instructor"], bool), "removed_by_instructor must be bool"


# ---------------------------------------------------------------------------
# B-7: quiz.load.completed must be in DESIGN.md §14.3 catalog
# ---------------------------------------------------------------------------

class TestQuizLoadCompletedInCatalog:
    """
    B-7: quiz.load.completed is emitted in quiz.py but must appear in
    DESIGN.md §14.3 catalog. Resolution per open question: add to catalog.
    AC-1, AC-2 (Story 7).
    """

    def test_quiz_load_completed_in_design_md(self):
        """
        AC-1: DESIGN.md §14.3 must contain 'quiz.load.completed'.
        This test fails until the row is added to the catalog table.
        """
        design_md_path = REPO_ROOT / "docs" / "DESIGN.md"
        with open(design_md_path, "r", encoding="utf-8") as f:
            content = f.read()

        assert "quiz.load.completed" in content, (
            "DESIGN.md §14.3 does not contain 'quiz.load.completed'. "
            "Per Story 7 AC-1, either add it to the catalog or remove the emission. "
            "Open question resolution: add to §14.3."
        )

    def test_quiz_load_completed_no_pii_in_meta(self):
        """
        AC-2 / §14.5: The quiz.load.completed call in quiz.py must not log
        user_id in meta (UUID is acceptable for actor_id field, not meta).
        Per §14.5, only actor_id (positional field) should carry the user UUID.
        """
        quiz_py_path = REPO_ROOT / "backend" / "app" / "api" / "routes" / "quiz.py"
        with open(quiz_py_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Find the quiz.load.completed block and verify user_id is not in meta
        # The current code has: meta={"quiz_id": quiz_id, "user_id": current_user["id"]}
        # user_id in meta is redundant — it belongs in actor_id, not meta.
        # This is a PII-adjacent violation: UUIDs are safe but poor practice.
        import re
        pattern = r'event=["\']quiz\.load\.completed["\'].*?meta=\{([^}]*)\}'
        match = re.search(pattern, content, re.DOTALL)
        if match:
            meta_content = match.group(1)
            # user_id in meta is redundant; actor_id covers this
            assert "user_id" not in meta_content, (
                "meta for quiz.load.completed should not contain user_id — "
                "use actor_id field instead. Per §14.5, minimise identifiers in meta."
            )
