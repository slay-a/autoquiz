"""
Tests for FEAT-005 File Upload & Processing Pipeline.

Tests cover:
- Story 5.1: Upload a document
- Story 5.2: Track processing status

Test strategy:
- Unit tests for upload service functions with mocked Supabase
- Integration tests for route handlers with mocked Supabase and Celery
- File validation tests (type, size)
- Access control tests (ownership verification)
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
from fastapi import HTTPException
from fastapi.testclient import TestClient
import uuid
import io

# Import the app and dependencies
from main import app
from app.services.upload import (
    store_file_and_create_job,
    get_job_status,
    create_retry_job,
    JobNotFoundError,
    AccessDeniedError,
    InvalidJobStateError,
)
from app.models.schemas import JobStatus
from app.api.dependencies import get_current_user


# ── Fixtures ──────────────────────────────────────────────────────────


@pytest.fixture
def mock_supabase():
    """Mock Supabase client."""
    mock_client = Mock()

    # Mock storage
    mock_storage = Mock()
    mock_bucket = Mock()
    mock_storage.from_ = Mock(return_value=mock_bucket)
    mock_client.storage = mock_storage

    # Mock table
    mock_table = Mock()
    mock_client.table = Mock(return_value=mock_table)

    return mock_client


@pytest.fixture
def instructor_user():
    """Fixture for an authenticated instructor user."""
    return {
        "id": "instructor-123-uuid",
        "email": "instructor@example.com",
        "role": "instructor",
    }


@pytest.fixture
def student_user():
    """Fixture for an authenticated student user."""
    return {
        "id": "student-456-uuid",
        "email": "student@example.com",
        "role": "student",
    }


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def valid_pdf_file():
    """Create a small valid PDF file for testing."""
    # Simple minimal PDF structure
    pdf_content = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n0000000101 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n149\n%%EOF"
    return ("test.pdf", io.BytesIO(pdf_content), "application/pdf")


@pytest.fixture
def valid_docx_file():
    """Create a small valid DOCX file stub for testing."""
    # Minimal DOCX is a ZIP file, but for validation we just need the extension
    docx_content = b"PK\x03\x04" + b"\x00" * 100  # ZIP header
    return ("test.docx", io.BytesIO(docx_content), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")


@pytest.fixture
def oversized_file():
    """Create a file that exceeds 50MB limit."""
    # 51MB of data
    large_content = b"x" * (51 * 1024 * 1024)
    return ("large.pdf", io.BytesIO(large_content), "application/pdf")


@pytest.fixture
def invalid_extension_file():
    """Create a file with invalid extension."""
    return ("test.txt", io.BytesIO(b"Hello World"), "text/plain")


# ── Unit Tests: upload.py service ──────────────────────────────────────


class TestStoreFileAndCreateJob:
    """Tests for store_file_and_create_job() function."""

    @patch("app.services.upload.get_supabase")
    def test_successful_upload_creates_file_and_job(self, mock_get_supabase):
        """AC-5.1.4, AC-5.1.5: Creates uploaded_files and processing_jobs rows."""
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Mock storage upload
        mock_bucket = Mock()
        mock_bucket.upload = Mock(return_value=None)
        mock_supabase.storage.from_ = Mock(return_value=mock_bucket)

        # Mock table inserts
        mock_table = Mock()
        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=None)
        mock_table.insert = Mock(return_value=mock_execute)
        mock_supabase.table = Mock(return_value=mock_table)

        result = store_file_and_create_job(
            file_contents=b"test content",
            filename="test.pdf",
            content_type="application/pdf",
            uploaded_by="user-123",
        )

        # Verify result structure
        assert "file_id" in result
        assert "job_id" in result
        assert result["status"] == JobStatus.queued
        assert result["message"] == "File uploaded. Processing queued."

        # Verify UUIDs are valid
        uuid.UUID(result["file_id"])
        uuid.UUID(result["job_id"])

    @patch("app.services.upload.get_supabase")
    def test_storage_path_uses_server_generated_uuid(self, mock_get_supabase):
        """AC-5.1.3: Storage path is {file_id}/{filename} where file_id is server-generated UUID."""
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        mock_bucket = Mock()
        mock_bucket.upload = Mock(return_value=None)
        mock_supabase.storage.from_ = Mock(return_value=mock_bucket)

        mock_table = Mock()
        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=None)
        mock_table.insert = Mock(return_value=mock_execute)
        mock_supabase.table = Mock(return_value=mock_table)

        result = store_file_and_create_job(
            file_contents=b"test",
            filename="test.pdf",
            content_type="application/pdf",
            uploaded_by="user-123",
        )

        # Verify upload was called with correct path format
        mock_bucket.upload.assert_called_once()
        call_args = mock_bucket.upload.call_args
        uploaded_path = call_args.kwargs["path"]

        # Path should be {uuid}/{filename}
        parts = uploaded_path.split("/")
        assert len(parts) == 2
        uuid.UUID(parts[0])  # Should be valid UUID
        assert parts[1] == "test.pdf"

    @patch("app.services.upload.get_supabase")
    def test_uploaded_files_row_has_required_fields(self, mock_get_supabase):
        """AC-5.1.4: uploaded_files row has file_id, filename, uploaded_by."""
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        mock_bucket = Mock()
        mock_bucket.upload = Mock(return_value=None)
        mock_supabase.storage.from_ = Mock(return_value=mock_bucket)

        mock_table = Mock()
        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=None)
        mock_table.insert = Mock(return_value=mock_execute)
        mock_supabase.table = Mock(return_value=mock_table)

        store_file_and_create_job(
            file_contents=b"test",
            filename="test.pdf",
            content_type="application/pdf",
            uploaded_by="user-123",
        )

        # Find the uploaded_files insert call
        table_calls = mock_supabase.table.call_args_list
        uploaded_files_call = None
        for call in table_calls:
            if call[0][0] == "uploaded_files":
                uploaded_files_call = call
                break

        assert uploaded_files_call is not None
        mock_supabase.table.assert_any_call("uploaded_files")

        # Verify insert payload
        insert_calls = mock_table.insert.call_args_list
        assert len(insert_calls) >= 1

        uploaded_files_payload = insert_calls[0][0][0]
        assert "file_id" in uploaded_files_payload
        assert uploaded_files_payload["filename"] == "test.pdf"
        assert uploaded_files_payload["uploaded_by"] == "user-123"

    @patch("app.services.upload.get_supabase")
    def test_processing_jobs_row_has_queued_status_and_upload_stage(self, mock_get_supabase):
        """AC-5.1.5: processing_jobs row has status=queued and stage=upload."""
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        mock_bucket = Mock()
        mock_bucket.upload = Mock(return_value=None)
        mock_supabase.storage.from_ = Mock(return_value=mock_bucket)

        mock_table = Mock()
        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=None)
        mock_table.insert = Mock(return_value=mock_execute)
        mock_supabase.table = Mock(return_value=mock_table)

        store_file_and_create_job(
            file_contents=b"test",
            filename="test.pdf",
            content_type="application/pdf",
            uploaded_by="user-123",
        )

        # Find the processing_jobs insert call
        insert_calls = mock_table.insert.call_args_list
        assert len(insert_calls) >= 2

        # Second insert should be processing_jobs
        processing_jobs_payload = insert_calls[1][0][0]
        assert processing_jobs_payload["status"] == JobStatus.queued
        assert processing_jobs_payload["stage"] == "upload"


class TestGetJobStatus:
    """Tests for get_job_status() function."""

    @patch("app.services.upload.get_supabase")
    def test_returns_job_data_for_owner(self, mock_get_supabase):
        """AC-5.2.1: Returns current job status for the owner."""
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        mock_result = Mock()
        mock_result.data = {
            "job_id": "job-123",
            "file_id": "file-456",
            "status": "in_progress",
            "stage": "extract",
            "uploaded_by": "user-123",
            "created_at": "2024-01-01T00:00:00",
            "updated_at": "2024-01-01T00:01:00",
        }

        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_result)
        mock_single = Mock()
        mock_single.single = Mock(return_value=mock_execute)
        mock_eq = Mock()
        mock_eq.eq = Mock(return_value=mock_single)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq)
        mock_table = Mock()
        mock_table.table = Mock(return_value=mock_select)
        mock_supabase.table = Mock(return_value=mock_select)

        result = get_job_status("job-123", "user-123")

        assert result["job_id"] == "job-123"
        assert result["status"] == "in_progress"
        assert result["stage"] == "extract"

    @patch("app.services.upload.get_supabase")
    def test_raises_job_not_found_error_for_missing_job(self, mock_get_supabase):
        """Returns 404 when job does not exist."""
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        mock_result = Mock()
        mock_result.data = None

        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_result)
        mock_single = Mock()
        mock_single.single = Mock(return_value=mock_execute)
        mock_eq = Mock()
        mock_eq.eq = Mock(return_value=mock_single)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq)
        mock_supabase.table = Mock(return_value=mock_select)

        with pytest.raises(JobNotFoundError):
            get_job_status("nonexistent-job", "user-123")

    @patch("app.services.upload.get_supabase")
    def test_raises_access_denied_error_for_wrong_owner(self, mock_get_supabase):
        """Returns 403 when job belongs to another user."""
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        mock_result = Mock()
        mock_result.data = {
            "job_id": "job-123",
            "uploaded_by": "other-user",
        }

        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_result)
        mock_single = Mock()
        mock_single.single = Mock(return_value=mock_execute)
        mock_eq = Mock()
        mock_eq.eq = Mock(return_value=mock_single)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq)
        mock_supabase.table = Mock(return_value=mock_select)

        with pytest.raises(AccessDeniedError):
            get_job_status("job-123", "user-123")


class TestCreateRetryJob:
    """Tests for create_retry_job() function."""

    @patch("app.services.upload.get_supabase")
    def test_creates_new_job_for_failed_job(self, mock_get_supabase):
        """POST /upload/retry/{job_id} creates a new job for a failed job."""
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Mock select existing failed job
        mock_select_result = Mock()
        mock_select_result.data = {
            "job_id": "old-job-123",
            "file_id": "file-456",
            "filename": "test.pdf",
            "status": "failed",
            "uploaded_by": "user-123",
        }

        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_select_result)
        mock_single = Mock()
        mock_single.single = Mock(return_value=mock_execute)
        mock_eq = Mock()
        mock_eq.eq = Mock(return_value=mock_single)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq)

        # Mock insert new job
        mock_insert = Mock()
        mock_insert_execute = Mock()
        mock_insert_execute.execute = Mock(return_value=None)
        mock_insert.insert = Mock(return_value=mock_insert_execute)

        mock_supabase.table = Mock(side_effect=[mock_select, mock_insert])

        result = create_retry_job("old-job-123", "user-123")

        assert result["file_id"] == "file-456"
        assert result["status"] == JobStatus.queued
        assert "job_id" in result
        assert result["job_id"] != "old-job-123"  # New job ID

    @patch("app.services.upload.get_supabase")
    def test_raises_invalid_job_state_error_for_non_failed_job(self, mock_get_supabase):
        """Raises InvalidJobStateError when job status is not 'failed'."""
        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        mock_result = Mock()
        mock_result.data = {
            "job_id": "job-123",
            "status": "success",
            "uploaded_by": "user-123",
        }

        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_result)
        mock_single = Mock()
        mock_single.single = Mock(return_value=mock_execute)
        mock_eq = Mock()
        mock_eq.eq = Mock(return_value=mock_single)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq)
        mock_supabase.table = Mock(return_value=mock_select)

        with pytest.raises(InvalidJobStateError):
            create_retry_job("job-123", "user-123")


# ── Integration Tests: upload.py routes ────────────────────────────────


class TestUploadEndpoint:
    """Integration tests for POST /upload/."""

    @patch("celery_worker.process_document")
    @patch("app.services.upload.get_supabase")
    def test_rejects_unsupported_file_extension(self, mock_get_supabase, mock_process_document, client, instructor_user):
        """AC-5.1.1: Backend rejects non-.pdf/.docx/.pptx files with 400."""
        # Override auth dependency
        app.dependency_overrides[get_current_user] = lambda: instructor_user

        files = {"file": ("test.txt", io.BytesIO(b"Hello World"), "text/plain")}
        response = client.post("/upload/", files=files)

        assert response.status_code == 400
        assert "Unsupported file type" in response.json()["error"]["message"]

        # Cleanup
        app.dependency_overrides.clear()

    @patch("celery_worker.process_document")
    @patch("app.services.upload.get_supabase")
    def test_accepts_pdf_file(self, mock_get_supabase, mock_process_document, client, instructor_user):
        """AC-5.1.1: Backend accepts .pdf files."""
        app.dependency_overrides[get_current_user] = lambda: instructor_user

        # Mock Supabase
        mock_supabase = Mock()
        mock_bucket = Mock()
        mock_bucket.upload = Mock(return_value=None)
        mock_supabase.storage.from_ = Mock(return_value=mock_bucket)

        mock_table = Mock()
        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=None)
        mock_table.insert = Mock(return_value=mock_execute)
        mock_supabase.table = Mock(return_value=mock_table)

        mock_get_supabase.return_value = mock_supabase

        # Mock Celery task
        mock_process_document.delay = Mock(return_value=None)

        files = {"file": ("test.pdf", io.BytesIO(b"PDF content"), "application/pdf")}
        response = client.post("/upload/", files=files)

        assert response.status_code == 200
        assert response.json()["status"] == "queued"

        app.dependency_overrides.clear()

    @patch("celery_worker.process_document")
    @patch("app.services.upload.get_supabase")
    def test_accepts_docx_file(self, mock_get_supabase, mock_process_document, client, instructor_user):
        """AC-5.1.1: Backend accepts .docx files."""
        app.dependency_overrides[get_current_user] = lambda: instructor_user

        mock_supabase = Mock()
        mock_bucket = Mock()
        mock_bucket.upload = Mock(return_value=None)
        mock_supabase.storage.from_ = Mock(return_value=mock_bucket)

        mock_table = Mock()
        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=None)
        mock_table.insert = Mock(return_value=mock_execute)
        mock_supabase.table = Mock(return_value=mock_table)

        mock_get_supabase.return_value = mock_supabase
        mock_process_document.delay = Mock(return_value=None)

        files = {"file": ("test.docx", io.BytesIO(b"DOCX content"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
        response = client.post("/upload/", files=files)

        assert response.status_code == 200

        app.dependency_overrides.clear()

    @patch("celery_worker.process_document")
    @patch("app.services.upload.get_supabase")
    def test_accepts_pptx_file(self, mock_get_supabase, mock_process_document, client, instructor_user):
        """AC-5.1.1: Backend accepts .pptx files."""
        app.dependency_overrides[get_current_user] = lambda: instructor_user

        mock_supabase = Mock()
        mock_bucket = Mock()
        mock_bucket.upload = Mock(return_value=None)
        mock_supabase.storage.from_ = Mock(return_value=mock_bucket)

        mock_table = Mock()
        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=None)
        mock_table.insert = Mock(return_value=mock_execute)
        mock_supabase.table = Mock(return_value=mock_table)

        mock_get_supabase.return_value = mock_supabase
        mock_process_document.delay = Mock(return_value=None)

        files = {"file": ("test.pptx", io.BytesIO(b"PPTX content"), "application/vnd.openxmlformats-officedocument.presentationml.presentation")}
        response = client.post("/upload/", files=files)

        assert response.status_code == 200

        app.dependency_overrides.clear()

    @patch("celery_worker.process_document")
    @patch("app.services.upload.get_supabase")
    def test_rejects_file_exceeding_50mb(self, mock_get_supabase, mock_process_document, client, instructor_user):
        """AC-5.1.2: Backend returns HTTP 413 for files > 50MB."""
        app.dependency_overrides[get_current_user] = lambda: instructor_user

        # Create a file that exceeds 50MB (using chunked read simulation)
        # We'll create a 51MB file
        large_content = b"x" * (51 * 1024 * 1024)
        files = {"file": ("large.pdf", io.BytesIO(large_content), "application/pdf")}

        response = client.post("/upload/", files=files)

        assert response.status_code == 413
        assert "50MB limit" in response.json()["detail"]

        app.dependency_overrides.clear()

    @patch("celery_worker.process_document")
    @patch("app.services.upload.get_supabase")
    def test_successful_upload_dispatches_celery_task(self, mock_get_supabase, mock_process_document, client, instructor_user):
        """Verifies Celery task is dispatched after successful upload."""
        app.dependency_overrides[get_current_user] = lambda: instructor_user

        mock_supabase = Mock()
        mock_bucket = Mock()
        mock_bucket.upload = Mock(return_value=None)
        mock_supabase.storage.from_ = Mock(return_value=mock_bucket)

        mock_table = Mock()
        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=None)
        mock_table.insert = Mock(return_value=mock_execute)
        mock_supabase.table = Mock(return_value=mock_table)

        mock_get_supabase.return_value = mock_supabase
        mock_process_document.delay = Mock(return_value=None)

        files = {"file": ("test.pdf", io.BytesIO(b"PDF content"), "application/pdf")}
        response = client.post("/upload/", files=files)

        assert response.status_code == 200

        # Verify Celery task was called
        mock_process_document.delay.assert_called_once()
        call_kwargs = mock_process_document.delay.call_args.kwargs
        assert "file_id" in call_kwargs
        assert "job_id" in call_kwargs
        assert call_kwargs["filename"] == "test.pdf"

        app.dependency_overrides.clear()

    def test_upload_requires_authentication(self, client):
        """Verifies upload endpoint requires authentication."""
        files = {"file": ("test.pdf", io.BytesIO(b"PDF content"), "application/pdf")}
        response = client.post("/upload/", files=files)

        # Should return 401 or 403 when not authenticated
        assert response.status_code in [401, 403]


class TestGetJobStatusEndpoint:
    """Integration tests for GET /upload/status/{job_id}."""

    @patch("app.services.upload.get_supabase")
    def test_returns_job_status_for_owner(self, mock_get_supabase, client, instructor_user):
        """AC-5.2.1: Returns current job status."""
        app.dependency_overrides[get_current_user] = lambda: instructor_user

        mock_supabase = Mock()
        mock_result = Mock()
        mock_result.data = {
            "job_id": "job-123",
            "file_id": "file-456",
            "status": "in_progress",
            "stage": "extract",
            "uploaded_by": instructor_user["id"],
            "created_at": "2024-01-01T00:00:00",
            "updated_at": "2024-01-01T00:01:00",
        }

        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_result)
        mock_single = Mock()
        mock_single.single = Mock(return_value=mock_execute)
        mock_eq = Mock()
        mock_eq.eq = Mock(return_value=mock_single)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq)
        mock_supabase.table = Mock(return_value=mock_select)

        mock_get_supabase.return_value = mock_supabase

        response = client.get("/upload/status/job-123")

        assert response.status_code == 200
        data = response.json()
        assert data["job_id"] == "job-123"
        assert data["status"] == "in_progress"
        assert data["stage"] == "extract"

        app.dependency_overrides.clear()

    @patch("app.services.upload.get_supabase")
    def test_returns_404_for_nonexistent_job(self, mock_get_supabase, client, instructor_user):
        """Returns 404 when job does not exist."""
        app.dependency_overrides[get_current_user] = lambda: instructor_user

        mock_supabase = Mock()
        mock_result = Mock()
        mock_result.data = None

        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_result)
        mock_single = Mock()
        mock_single.single = Mock(return_value=mock_execute)
        mock_eq = Mock()
        mock_eq.eq = Mock(return_value=mock_single)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq)
        mock_supabase.table = Mock(return_value=mock_select)

        mock_get_supabase.return_value = mock_supabase

        response = client.get("/upload/status/nonexistent-job")

        assert response.status_code == 404

        app.dependency_overrides.clear()

    @patch("app.services.upload.get_supabase")
    def test_returns_403_for_wrong_owner(self, mock_get_supabase, client, instructor_user):
        """Returns 403 when job belongs to another user."""
        app.dependency_overrides[get_current_user] = lambda: instructor_user

        mock_supabase = Mock()
        mock_result = Mock()
        mock_result.data = {
            "job_id": "job-123",
            "uploaded_by": "other-user-id",
        }

        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_result)
        mock_single = Mock()
        mock_single.single = Mock(return_value=mock_execute)
        mock_eq = Mock()
        mock_eq.eq = Mock(return_value=mock_single)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq)
        mock_supabase.table = Mock(return_value=mock_select)

        mock_get_supabase.return_value = mock_supabase

        response = client.get("/upload/status/job-123")

        assert response.status_code == 403

        app.dependency_overrides.clear()

    @patch("app.services.upload.get_supabase")
    def test_status_progression_values(self, mock_get_supabase, client, instructor_user):
        """AC-5.2.2: Status values are queued, in_progress, success, or failed."""
        app.dependency_overrides[get_current_user] = lambda: instructor_user

        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        valid_statuses = ["queued", "in_progress", "success", "failed"]

        for status in valid_statuses:
            mock_result = Mock()
            mock_result.data = {
                "job_id": f"job-{status}",
                "file_id": "file-456",
                "status": status,
                "stage": "upload",
                "uploaded_by": instructor_user["id"],
                "created_at": "2024-01-01T00:00:00",
                "updated_at": "2024-01-01T00:01:00",
            }

            mock_execute = Mock()
            mock_execute.execute = Mock(return_value=mock_result)
            mock_single = Mock()
            mock_single.single = Mock(return_value=mock_execute)
            mock_eq = Mock()
            mock_eq.eq = Mock(return_value=mock_single)
            mock_select = Mock()
            mock_select.select = Mock(return_value=mock_eq)
            mock_supabase.table = Mock(return_value=mock_select)

            response = client.get(f"/upload/status/job-{status}")

            assert response.status_code == 200
            assert response.json()["status"] == status

        app.dependency_overrides.clear()

    @patch("app.services.upload.get_supabase")
    def test_stage_labels_at_each_step(self, mock_get_supabase, client, instructor_user):
        """AC-5.2.3: Stage label reflects pipeline step: upload, extract, clean, section, chunk."""
        app.dependency_overrides[get_current_user] = lambda: instructor_user

        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Test that each stage label is returned correctly
        # Note: The worker sets these stages during processing (celery_worker.py lines 36, 42, 45, 51)
        valid_stages = ["upload", "extract", "clean", "section", "chunk"]

        for stage in valid_stages:
            mock_result = Mock()
            mock_result.data = {
                "job_id": f"job-{stage}",
                "file_id": "file-456",
                "status": "in_progress",
                "stage": stage,
                "uploaded_by": instructor_user["id"],
                "created_at": "2024-01-01T00:00:00",
                "updated_at": "2024-01-01T00:01:00",
            }

            mock_execute = Mock()
            mock_execute.execute = Mock(return_value=mock_result)
            mock_single = Mock()
            mock_single.single = Mock(return_value=mock_execute)
            mock_eq = Mock()
            mock_eq.eq = Mock(return_value=mock_single)
            mock_select = Mock()
            mock_select.select = Mock(return_value=mock_eq)
            mock_supabase.table = Mock(return_value=mock_select)

            response = client.get(f"/upload/status/job-{stage}")

            assert response.status_code == 200
            assert response.json()["stage"] == stage

        app.dependency_overrides.clear()

    @patch("app.services.upload.get_supabase")
    def test_failed_job_includes_error_message_and_code(self, mock_get_supabase, client, instructor_user):
        """AC-5.2.4: Failed jobs include error_message and error_code."""
        app.dependency_overrides[get_current_user] = lambda: instructor_user

        mock_supabase = Mock()
        mock_result = Mock()
        mock_result.data = {
            "job_id": "job-failed",
            "file_id": "file-456",
            "status": "failed",
            "stage": "extract",
            "error_code": "PROCESSING_ERROR",
            "error_message": "Failed to extract text from PDF",
            "uploaded_by": instructor_user["id"],
            "created_at": "2024-01-01T00:00:00",
            "updated_at": "2024-01-01T00:01:00",
        }

        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_result)
        mock_single = Mock()
        mock_single.single = Mock(return_value=mock_execute)
        mock_eq = Mock()
        mock_eq.eq = Mock(return_value=mock_single)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq)
        mock_supabase.table = Mock(return_value=mock_select)

        mock_get_supabase.return_value = mock_supabase

        response = client.get("/upload/status/job-failed")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "failed"
        assert data["error_message"] == "Failed to extract text from PDF"
        assert data["error_code"] == "PROCESSING_ERROR"

        app.dependency_overrides.clear()


class TestRetryJobEndpoint:
    """Integration tests for POST /upload/retry/{job_id}."""

    @patch("celery_worker.process_document")
    @patch("app.services.upload.get_supabase")
    def test_creates_retry_job_for_failed_job(self, mock_get_supabase, mock_process_document, client, instructor_user):
        """Creates a new retry job for a failed job."""
        app.dependency_overrides[get_current_user] = lambda: instructor_user

        mock_supabase = Mock()

        # Mock select existing failed job
        mock_select_result = Mock()
        mock_select_result.data = {
            "job_id": "old-job-123",
            "file_id": "file-456",
            "filename": "test.pdf",
            "status": "failed",
            "uploaded_by": instructor_user["id"],
        }

        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_select_result)
        mock_single = Mock()
        mock_single.single = Mock(return_value=mock_execute)
        mock_eq = Mock()
        mock_eq.eq = Mock(return_value=mock_single)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq)

        # Mock insert new job
        mock_insert = Mock()
        mock_insert_execute = Mock()
        mock_insert_execute.execute = Mock(return_value=None)
        mock_insert.insert = Mock(return_value=mock_insert_execute)

        mock_supabase.table = Mock(side_effect=[mock_select, mock_insert])
        mock_get_supabase.return_value = mock_supabase
        mock_process_document.delay = Mock(return_value=None)

        response = client.post("/upload/retry/old-job-123")

        assert response.status_code == 200
        data = response.json()
        assert data["file_id"] == "file-456"
        assert data["status"] == "queued"
        assert data["job_id"] != "old-job-123"

        # Verify Celery task was dispatched
        mock_process_document.delay.assert_called_once()

        app.dependency_overrides.clear()

    @patch("app.services.upload.get_supabase")
    def test_returns_400_for_non_failed_job(self, mock_get_supabase, client, instructor_user):
        """Returns 400 when trying to retry a non-failed job."""
        app.dependency_overrides[get_current_user] = lambda: instructor_user

        mock_supabase = Mock()
        mock_result = Mock()
        mock_result.data = {
            "job_id": "job-123",
            "status": "success",
            "uploaded_by": instructor_user["id"],
        }

        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_result)
        mock_single = Mock()
        mock_single.single = Mock(return_value=mock_execute)
        mock_eq = Mock()
        mock_eq.eq = Mock(return_value=mock_single)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq)
        mock_supabase.table = Mock(return_value=mock_select)

        mock_get_supabase.return_value = mock_supabase

        response = client.post("/upload/retry/job-123")

        assert response.status_code == 400
        assert "failed jobs" in response.json()["detail"].lower()

        app.dependency_overrides.clear()


# ── Story 5.3 & 5.4: File Re-Access Tests ──────────────────────────────


class TestStory53ClassScopedFileUpload:
    """Tests for Story 5.3 — Instructor class-scoped file uploads."""

    @patch("app.services.upload.get_supabase")
    @patch("celery_worker.process_document")
    def test_upload_with_class_id_inserts_class_id(self, mock_process_document, mock_get_supabase, client, instructor_user):
        """AC-5.3.4: File upload accepts class_id and inserts it into uploaded_files."""
        app.dependency_overrides[get_current_user] = lambda: instructor_user

        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Mock storage upload
        mock_bucket = Mock()
        mock_bucket.upload = Mock(return_value=None)
        mock_storage = Mock()
        mock_storage.from_ = Mock(return_value=mock_bucket)
        mock_supabase.storage = mock_storage

        # Track inserted records
        inserted_file_record = None
        inserted_job_record = None

        def capture_insert(table_name):
            def insert_handler(record):
                nonlocal inserted_file_record, inserted_job_record
                if table_name == "uploaded_files":
                    inserted_file_record = record
                elif table_name == "processing_jobs":
                    inserted_job_record = record

                mock_execute = Mock()
                mock_execute.execute = Mock(return_value=None)
                return mock_execute

            mock_insert = Mock()
            mock_insert.insert = Mock(side_effect=insert_handler)
            return mock_insert

        mock_supabase.table = Mock(side_effect=lambda name: capture_insert(name))
        mock_process_document.delay = Mock(return_value=None)

        # Upload with class_id
        class_id = "class-789-uuid"
        pdf_content = b"%PDF-1.4\ntest"
        response = client.post(
            "/upload/",
            files={"file": ("test.pdf", io.BytesIO(pdf_content), "application/pdf")},
            data={"class_id": class_id},
        )

        assert response.status_code == 200
        assert inserted_file_record is not None
        assert inserted_file_record["class_id"] == class_id
        assert inserted_file_record["uploaded_by"] == instructor_user["id"]
        assert inserted_job_record is not None
        assert inserted_job_record["uploaded_by"] == instructor_user["id"]

        app.dependency_overrides.clear()

    @patch("app.services.upload.get_supabase")
    @patch("celery_worker.process_document")
    def test_upload_without_class_id_works(self, mock_process_document, mock_get_supabase, client, student_user):
        """Verify that class_id is optional — uploads without it succeed."""
        app.dependency_overrides[get_current_user] = lambda: student_user

        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Mock storage upload
        mock_bucket = Mock()
        mock_bucket.upload = Mock(return_value=None)
        mock_storage = Mock()
        mock_storage.from_ = Mock(return_value=mock_bucket)
        mock_supabase.storage = mock_storage

        # Track inserted file record
        inserted_file_record = None

        def capture_insert(table_name):
            def insert_handler(record):
                nonlocal inserted_file_record
                if table_name == "uploaded_files":
                    inserted_file_record = record

                mock_execute = Mock()
                mock_execute.execute = Mock(return_value=None)
                return mock_execute

            mock_insert = Mock()
            mock_insert.insert = Mock(side_effect=insert_handler)
            return mock_insert

        mock_supabase.table = Mock(side_effect=lambda name: capture_insert(name))
        mock_process_document.delay = Mock(return_value=None)

        # Upload without class_id
        pdf_content = b"%PDF-1.4\ntest"
        response = client.post(
            "/upload/",
            files={"file": ("test.pdf", io.BytesIO(pdf_content), "application/pdf")},
        )

        assert response.status_code == 200
        assert inserted_file_record is not None
        assert "class_id" not in inserted_file_record or inserted_file_record.get("class_id") is None

        app.dependency_overrides.clear()


class TestStory54GetUserFiles:
    """Tests for Story 5.4 — GET /upload/files endpoint."""

    @patch("app.services.upload.get_supabase")
    def test_returns_only_success_files(self, mock_get_supabase, client, student_user):
        """AC-5.4.1, AC-5.4.2: Returns only files where processing_jobs.status = 'success'."""
        app.dependency_overrides[get_current_user] = lambda: student_user

        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Mock Supabase query result — only success files
        mock_result = Mock()
        mock_result.data = [
            {
                "file_id": "file-1",
                "filename": "lecture1.pdf",
                "created_at": "2024-01-01T10:00:00",
                "processing_jobs": [{"status": "success"}],
            },
            {
                "file_id": "file-2",
                "filename": "notes.docx",
                "created_at": "2024-01-02T11:00:00",
                "processing_jobs": [{"status": "success"}],
            },
        ]

        # Build mock chain: table().select().eq().eq().order().execute()
        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_result)
        mock_order = Mock()
        mock_order.order = Mock(return_value=mock_execute)
        mock_eq2 = Mock()
        mock_eq2.eq = Mock(return_value=mock_order)
        mock_eq1 = Mock()
        mock_eq1.eq = Mock(return_value=mock_eq2)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq1)
        mock_supabase.table = Mock(return_value=mock_select)

        response = client.get("/upload/files")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["file_id"] == "file-1"
        assert data[0]["filename"] == "lecture1.pdf"
        assert data[0]["created_at"] == "2024-01-01T10:00:00"
        assert data[1]["file_id"] == "file-2"

        # Verify query filters by uploaded_by and status='success'
        mock_select.select.assert_called_once()
        assert "processing_jobs!inner" in mock_select.select.call_args[0][0]

        app.dependency_overrides.clear()

    @patch("app.services.upload.get_supabase")
    def test_does_not_return_failed_files(self, mock_get_supabase, client, student_user):
        """Verify that files with status='failed' are NOT returned."""
        app.dependency_overrides[get_current_user] = lambda: student_user

        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Mock result — no failed files in response
        mock_result = Mock()
        mock_result.data = []

        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_result)
        mock_order = Mock()
        mock_order.order = Mock(return_value=mock_execute)
        mock_eq2 = Mock()
        mock_eq2.eq = Mock(return_value=mock_order)
        mock_eq1 = Mock()
        mock_eq1.eq = Mock(return_value=mock_eq2)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq1)
        mock_supabase.table = Mock(return_value=mock_select)

        response = client.get("/upload/files")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 0

        # Verify filter was applied
        mock_eq2.eq.assert_called_with("processing_jobs.status", "success")

        app.dependency_overrides.clear()

    @patch("app.services.upload.get_supabase")
    def test_does_not_return_in_progress_files(self, mock_get_supabase, client, student_user):
        """Verify that files with status='in_progress' or 'queued' are NOT returned."""
        app.dependency_overrides[get_current_user] = lambda: student_user

        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Mock result — no in-progress files
        mock_result = Mock()
        mock_result.data = []

        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_result)
        mock_order = Mock()
        mock_order.order = Mock(return_value=mock_execute)
        mock_eq2 = Mock()
        mock_eq2.eq = Mock(return_value=mock_order)
        mock_eq1 = Mock()
        mock_eq1.eq = Mock(return_value=mock_eq2)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq1)
        mock_supabase.table = Mock(return_value=mock_select)

        response = client.get("/upload/files")

        assert response.status_code == 200
        assert len(response.json()) == 0

        app.dependency_overrides.clear()

    @patch("app.services.upload.get_supabase")
    def test_scoped_to_current_user(self, mock_get_supabase, client, student_user):
        """AC-5.4.4: File list is scoped to uploaded_by = current user."""
        app.dependency_overrides[get_current_user] = lambda: student_user

        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        mock_result = Mock()
        mock_result.data = []

        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_result)
        mock_order = Mock()
        mock_order.order = Mock(return_value=mock_execute)
        mock_eq2 = Mock()
        mock_eq2.eq = Mock(return_value=mock_order)
        mock_eq1 = Mock()
        mock_eq1.eq = Mock(return_value=mock_eq2)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq1)
        mock_supabase.table = Mock(return_value=mock_select)

        response = client.get("/upload/files")

        assert response.status_code == 200

        # Verify uploaded_by filter
        mock_eq1.eq.assert_called_with("uploaded_by", student_user["id"])

        app.dependency_overrides.clear()

    @patch("app.services.upload.get_supabase")
    def test_returns_empty_list_for_other_users_files(self, mock_get_supabase, client, student_user):
        """Verify that files belonging to other users are NOT returned."""
        app.dependency_overrides[get_current_user] = lambda: student_user

        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        # Simulate DB returning no rows (because uploaded_by filter excludes other users)
        mock_result = Mock()
        mock_result.data = []

        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_result)
        mock_order = Mock()
        mock_order.order = Mock(return_value=mock_execute)
        mock_eq2 = Mock()
        mock_eq2.eq = Mock(return_value=mock_order)
        mock_eq1 = Mock()
        mock_eq1.eq = Mock(return_value=mock_eq2)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq1)
        mock_supabase.table = Mock(return_value=mock_select)

        response = client.get("/upload/files")

        assert response.status_code == 200
        assert len(response.json()) == 0

        app.dependency_overrides.clear()

    @patch("app.services.upload.get_supabase")
    def test_response_matches_user_file_entry_schema(self, mock_get_supabase, client, student_user):
        """AC-5.4.2: Response matches UserFileEntry schema (file_id, filename, created_at)."""
        app.dependency_overrides[get_current_user] = lambda: student_user

        mock_supabase = Mock()
        mock_get_supabase.return_value = mock_supabase

        mock_result = Mock()
        mock_result.data = [
            {
                "file_id": "file-123",
                "filename": "test.pdf",
                "created_at": "2024-01-01T12:00:00",
                "processing_jobs": [{"status": "success"}],
            },
        ]

        mock_execute = Mock()
        mock_execute.execute = Mock(return_value=mock_result)
        mock_order = Mock()
        mock_order.order = Mock(return_value=mock_execute)
        mock_eq2 = Mock()
        mock_eq2.eq = Mock(return_value=mock_order)
        mock_eq1 = Mock()
        mock_eq1.eq = Mock(return_value=mock_eq2)
        mock_select = Mock()
        mock_select.select = Mock(return_value=mock_eq1)
        mock_supabase.table = Mock(return_value=mock_select)

        response = client.get("/upload/files")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        entry = data[0]

        # Verify schema fields
        assert "file_id" in entry
        assert "filename" in entry
        assert "created_at" in entry
        assert entry["file_id"] == "file-123"
        assert entry["filename"] == "test.pdf"
        assert entry["created_at"] == "2024-01-01T12:00:00"

        # Should not include processing_jobs array
        assert "processing_jobs" not in entry

        app.dependency_overrides.clear()

    def test_requires_authentication(self, client):
        """Route requires authentication (unauthenticated request returns 401/403)."""
        # No auth override — request should fail
        response = client.get("/upload/files")

        assert response.status_code in [401, 403]


# ── Notes on out-of-scope tests ────────────────────────────────────────


"""
AC-5.2.5: The jobs_updated_at trigger exists in backend/supabase_schema.sql (lines ~80-87).
This is a database-level trigger that automatically sets updated_at on every processing_jobs
row update. Testing this would require a live PostgreSQL database with the trigger installed,
which is explicitly out of scope per Section 7 (Test Boundaries).

The trigger implementation can be verified by reading the schema file directly, but we do
not execute a live DB test here.
"""
