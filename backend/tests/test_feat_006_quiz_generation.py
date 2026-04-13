"""
Tests for FEAT-006 Quiz Generation.

Tests cover:
- Story 6.1: Generate a quiz from uploaded material
- Story 6.2: Select difficulty level
- Story 6.3: Generate a quiz using general knowledge

Test strategy:
- Integration tests for POST /quiz/generate route with mocked Supabase, retrieval, and OpenAI
- Unit tests for quiz_gen.py difficulty descriptor lookup
- Unit tests for retrieval.py hybrid_search top_k parameter
- Access control tests (role-based, file ownership)
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient
from contextlib import contextmanager
import uuid
import json

from main import app
from app.models.schemas import QuizRequest, QuizResponse, QuizQuestion, QuizOption
from app.api.dependencies import get_current_user
from app.services.quiz_gen import DIFFICULTY_DESCRIPTORS, generate_quiz
from app.services.retrieval import hybrid_search


# ── Helpers ───────────────────────────────────────────────────────────


@contextmanager
def override_user(user):
    """Context manager to override get_current_user dependency."""
    app.dependency_overrides[get_current_user] = lambda: user
    try:
        yield
    finally:
        app.dependency_overrides.clear()


# ── Fixtures ──────────────────────────────────────────────────────────


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
def other_student_user():
    """Fixture for a different student user (for access control tests)."""
    return {
        "id": "student-789-uuid",
        "email": "otherstudent@example.com",
        "role": "student",
    }


@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def mock_chunks():
    """Mock chunk results from hybrid_search."""
    return [
        {
            "chunk_id": f"chunk-{i}",
            "file_id": "test-file-uuid",
            "text": f"This is chunk {i} about machine learning and neural networks.",
            "section_title": f"Section {i}",
            "page_numbers": [i, i+1],
            "score": 0.9 - (i * 0.05),
        }
        for i in range(12)
    ]


@pytest.fixture
def mock_gpt4o_response():
    """Mock GPT-4o response for quiz generation."""
    return {
        "questions": [
            {
                "type": "mcq",
                "question": "What is a neural network?",
                "options": [
                    {"label": "A", "text": "A type of machine learning model"},
                    {"label": "B", "text": "A database system"},
                    {"label": "C", "text": "A sorting algorithm"},
                    {"label": "D", "text": "A compression technique"},
                ],
                "answer": "A",
                "explanation": "Neural networks are a class of machine learning models inspired by biological neurons.",
            },
            {
                "type": "true_false",
                "question": "Machine learning requires labeled data.",
                "answer": "False",
                "explanation": "Unsupervised learning is a type of machine learning that does not require labeled data.",
            },
            {
                "type": "short_answer",
                "question": "What is the purpose of backpropagation?",
                "answer": "To update weights in a neural network by computing gradients.",
                "explanation": "Backpropagation is an algorithm for calculating gradients efficiently in neural networks.",
            },
        ]
    }


@pytest.fixture
def mock_gpt4o_outside_sources_response():
    """Mock GPT-4o response with outside sources."""
    return {
        "questions": [
            {
                "type": "mcq",
                "question": "What is a neural network?",
                "options": [
                    {"label": "A", "text": "A type of machine learning model"},
                    {"label": "B", "text": "A database system"},
                ],
                "answer": "A",
                "explanation": "[Outside Source] Neural networks are computational models inspired by biological neurons.",
            },
            {
                "type": "short_answer",
                "question": "Who invented the perceptron?",
                "answer": "Frank Rosenblatt",
                "explanation": "[Outside Source] Frank Rosenblatt invented the perceptron in 1958.",
            },
        ]
    }


# ── Story 6.1 — Generate a quiz from uploaded material ────────────────


def test_generate_quiz_empty_topic_returns_400(client, student_user):
    """AC-6.1.1: Empty topic returns HTTP 400."""
    with override_user(student_user):
        response = client.post(
            "/quiz/generate",
            json={"topic": ""},
        )
        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()


def test_generate_quiz_whitespace_topic_returns_400(client, student_user):
    """AC-6.1.1: Whitespace-only topic returns HTTP 400."""
    with override_user(student_user):
        response = client.post(
            "/quiz/generate",
            json={"topic": "   \n\t  "},
        )
        assert response.status_code == 400
        assert "empty" in response.json()["detail"].lower()


def test_generate_quiz_with_file_id_calls_hybrid_search(
    client, student_user, mock_chunks, mock_gpt4o_response
):
    """AC-6.1.2: When file_id is provided, hybrid_search is called with top_k=12 and correct file_id."""
    file_id = str(uuid.uuid4())

    with override_user(student_user), \
         patch("app.api.routes.quiz.get_supabase") as mock_supabase, \
         patch("app.api.routes.quiz.hybrid_search", return_value=mock_chunks) as mock_search, \
         patch("app.services.quiz_gen._openai") as mock_openai:

        # Mock Supabase file ownership check
        mock_table = Mock()
        mock_table.select.return_value.eq.return_value.execute.return_value = Mock(
            data=[{"uploaded_by": student_user["id"]}]
        )
        mock_supabase.return_value.table.return_value = mock_table

        # Mock OpenAI response
        mock_completion = Mock()
        mock_completion.choices = [Mock(message=Mock(content=json.dumps(mock_gpt4o_response)))]
        mock_openai.chat.completions.create.return_value = mock_completion

        response = client.post(
            "/quiz/generate",
            json={
                "topic": "machine learning",
                "file_id": file_id,
            },
        )

        assert response.status_code == 200
        mock_search.assert_called_once_with(
            topic="machine learning",
            file_id=file_id,
            top_k=12,
        )


def test_generate_quiz_no_chunks_without_outside_sources_returns_404(
    client, student_user
):
    """AC-6.1.3: When file_id is provided but no chunks returned and outside_sources=False, return HTTP 404."""
    file_id = str(uuid.uuid4())

    with override_user(student_user), \
         patch("app.api.routes.quiz.get_supabase") as mock_supabase, \
         patch("app.api.routes.quiz.hybrid_search", return_value=[]):

        # Mock Supabase file ownership check
        mock_table = Mock()
        mock_table.select.return_value.eq.return_value.execute.return_value = Mock(
            data=[{"uploaded_by": student_user["id"]}]
        )
        mock_supabase.return_value.table.return_value = mock_table

        response = client.post(
            "/quiz/generate",
            json={
                "topic": "quantum physics",
                "file_id": file_id,
                "outside_sources": False,
            },
        )

        assert response.status_code == 404
        assert "could not find content" in response.json()["detail"].lower()


def test_generate_quiz_response_structure(
    client, student_user, mock_chunks, mock_gpt4o_response
):
    """AC-6.1.4: Response contains questions array with correct fields."""
    file_id = str(uuid.uuid4())

    with override_user(student_user), \
         patch("app.api.routes.quiz.get_supabase") as mock_supabase, \
         patch("app.api.routes.quiz.hybrid_search", return_value=mock_chunks), \
         patch("app.services.quiz_gen._openai") as mock_openai:

        # Mock Supabase file ownership check
        mock_table = Mock()
        mock_table.select.return_value.eq.return_value.execute.return_value = Mock(
            data=[{"uploaded_by": student_user["id"]}]
        )
        mock_supabase.return_value.table.return_value = mock_table

        # Mock OpenAI response
        mock_completion = Mock()
        mock_completion.choices = [Mock(message=Mock(content=json.dumps(mock_gpt4o_response)))]
        mock_openai.chat.completions.create.return_value = mock_completion

        response = client.post(
            "/quiz/generate",
            json={
                "topic": "machine learning",
                "file_id": file_id,
            },
        )

        assert response.status_code == 200
        data = response.json()

        # Verify top-level structure
        assert "questions" in data
        assert isinstance(data["questions"], list)
        assert len(data["questions"]) > 0

        # Verify each question has required fields
        for question in data["questions"]:
            assert "question_id" in question
            assert "type" in question
            assert "question" in question
            assert "answer" in question
            assert "explanation" in question
            assert "source_chunk_ids" in question
            assert "page_numbers" in question

            # Verify MCQ questions have options
            if question["type"] == "mcq":
                assert "options" in question
                assert isinstance(question["options"], list)
                assert len(question["options"]) > 0
                for option in question["options"]:
                    assert "label" in option
                    assert "text" in option


def test_generate_quiz_num_questions_parameter(
    client, student_user, mock_chunks, mock_gpt4o_response
):
    """AC-6.1.5: num_questions parameter is propagated to response."""
    file_id = str(uuid.uuid4())

    with override_user(student_user), \
         patch("app.api.routes.quiz.get_supabase") as mock_supabase, \
         patch("app.api.routes.quiz.hybrid_search", return_value=mock_chunks), \
         patch("app.services.quiz_gen._openai") as mock_openai:

        # Mock Supabase file ownership check
        mock_table = Mock()
        mock_table.select.return_value.eq.return_value.execute.return_value = Mock(
            data=[{"uploaded_by": student_user["id"]}]
        )
        mock_supabase.return_value.table.return_value = mock_table

        # Mock OpenAI response
        mock_completion = Mock()
        mock_completion.choices = [Mock(message=Mock(content=json.dumps(mock_gpt4o_response)))]
        mock_openai.chat.completions.create.return_value = mock_completion

        response = client.post(
            "/quiz/generate",
            json={
                "topic": "machine learning",
                "file_id": file_id,
                "num_questions": 10,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["num_questions"] == 10


def test_generate_quiz_default_num_questions(
    client, student_user, mock_chunks, mock_gpt4o_response
):
    """AC-6.1.5: Default num_questions is 5."""
    file_id = str(uuid.uuid4())

    with override_user(student_user), \
         patch("app.api.routes.quiz.get_supabase") as mock_supabase, \
         patch("app.api.routes.quiz.hybrid_search", return_value=mock_chunks), \
         patch("app.services.quiz_gen._openai") as mock_openai:

        # Mock Supabase file ownership check
        mock_table = Mock()
        mock_table.select.return_value.eq.return_value.execute.return_value = Mock(
            data=[{"uploaded_by": student_user["id"]}]
        )
        mock_supabase.return_value.table.return_value = mock_table

        # Mock OpenAI response
        mock_completion = Mock()
        mock_completion.choices = [Mock(message=Mock(content=json.dumps(mock_gpt4o_response)))]
        mock_openai.chat.completions.create.return_value = mock_completion

        response = client.post(
            "/quiz/generate",
            json={
                "topic": "machine learning",
                "file_id": file_id,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["num_questions"] == 5


# ── Story 6.2 — Select difficulty level ───────────────────────────────


def test_generate_quiz_invalid_difficulty_returns_422(client, student_user):
    """AC-6.2.1: Invalid difficulty returns HTTP 422."""
    with override_user(student_user):
        response = client.post(
            "/quiz/generate",
            json={
                "topic": "machine learning",
                "difficulty": "impossible",
            },
        )
        assert response.status_code == 422


def test_generate_quiz_default_difficulty(
    client, student_user, mock_chunks, mock_gpt4o_response
):
    """AC-6.2.2: Difficulty defaults to 'medium' when omitted."""
    file_id = str(uuid.uuid4())

    with override_user(student_user), \
         patch("app.api.routes.quiz.get_supabase") as mock_supabase, \
         patch("app.api.routes.quiz.hybrid_search", return_value=mock_chunks), \
         patch("app.services.quiz_gen._openai") as mock_openai:

        # Mock Supabase file ownership check
        mock_table = Mock()
        mock_table.select.return_value.eq.return_value.execute.return_value = Mock(
            data=[{"uploaded_by": student_user["id"]}]
        )
        mock_supabase.return_value.table.return_value = mock_table

        # Mock OpenAI response
        mock_completion = Mock()
        mock_completion.choices = [Mock(message=Mock(content=json.dumps(mock_gpt4o_response)))]
        mock_openai.chat.completions.create.return_value = mock_completion

        response = client.post(
            "/quiz/generate",
            json={
                "topic": "machine learning",
                "file_id": file_id,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["difficulty"] == "medium"


def test_generate_quiz_difficulty_in_prompt(
    client, student_user, mock_chunks, mock_gpt4o_response
):
    """AC-6.2.3: Difficulty descriptor appears in prompt sent to GPT-4o."""
    file_id = str(uuid.uuid4())

    with override_user(student_user), \
         patch("app.api.routes.quiz.get_supabase") as mock_supabase, \
         patch("app.api.routes.quiz.hybrid_search", return_value=mock_chunks), \
         patch("app.services.quiz_gen._openai") as mock_openai:

        # Mock Supabase file ownership check
        mock_table = Mock()
        mock_table.select.return_value.eq.return_value.execute.return_value = Mock(
            data=[{"uploaded_by": student_user["id"]}]
        )
        mock_supabase.return_value.table.return_value = mock_table

        # Mock OpenAI response
        mock_completion = Mock()
        mock_completion.choices = [Mock(message=Mock(content=json.dumps(mock_gpt4o_response)))]
        mock_openai.chat.completions.create.return_value = mock_completion

        response = client.post(
            "/quiz/generate",
            json={
                "topic": "machine learning",
                "file_id": file_id,
                "difficulty": "hard",
            },
        )

        assert response.status_code == 200

        # Verify that the OpenAI call included the difficulty descriptor
        mock_openai.chat.completions.create.assert_called_once()
        call_kwargs = mock_openai.chat.completions.create.call_args[1]
        user_message = call_kwargs["messages"][1]["content"]

        # Check that the descriptor from DIFFICULTY_DESCRIPTORS is in the prompt
        assert DIFFICULTY_DESCRIPTORS["hard"] in user_message
        # Ensure it's not just the raw word "hard"
        assert "challenging questions requiring analysis" in user_message


def test_generate_quiz_difficulty_in_response(
    client, student_user, mock_chunks, mock_gpt4o_response
):
    """AC-6.2.4: Difficulty value is included in QuizResponse body."""
    file_id = str(uuid.uuid4())

    with override_user(student_user), \
         patch("app.api.routes.quiz.get_supabase") as mock_supabase, \
         patch("app.api.routes.quiz.hybrid_search", return_value=mock_chunks), \
         patch("app.services.quiz_gen._openai") as mock_openai:

        # Mock Supabase file ownership check
        mock_table = Mock()
        mock_table.select.return_value.eq.return_value.execute.return_value = Mock(
            data=[{"uploaded_by": student_user["id"]}]
        )
        mock_supabase.return_value.table.return_value = mock_table

        # Mock OpenAI response
        mock_completion = Mock()
        mock_completion.choices = [Mock(message=Mock(content=json.dumps(mock_gpt4o_response)))]
        mock_openai.chat.completions.create.return_value = mock_completion

        response = client.post(
            "/quiz/generate",
            json={
                "topic": "machine learning",
                "file_id": file_id,
                "difficulty": "easy",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "difficulty" in data
        assert data["difficulty"] == "easy"


# ── Story 6.3 — Generate a quiz using general knowledge ───────────────


def test_generate_quiz_outside_sources_no_file_id(
    client, student_user, mock_gpt4o_response
):
    """AC-6.3.1: outside_sources=True with no file_id generates general knowledge quiz."""
    with override_user(student_user), \
         patch("app.api.routes.quiz.hybrid_search") as mock_search, \
         patch("app.services.quiz_gen._openai") as mock_openai:

        # Mock OpenAI response
        mock_completion = Mock()
        mock_completion.choices = [Mock(message=Mock(content=json.dumps(mock_gpt4o_response)))]
        mock_openai.chat.completions.create.return_value = mock_completion

        response = client.post(
            "/quiz/generate",
            json={
                "topic": "quantum mechanics",
                "outside_sources": True,
            },
        )

        assert response.status_code == 200
        # Verify hybrid_search was NOT called
        mock_search.assert_not_called()


def test_generate_quiz_outside_sources_with_file_id_uses_both(
    client, student_user, mock_chunks, mock_gpt4o_outside_sources_response
):
    """AC-6.3.2: outside_sources=True with file_id uses both chunks and general knowledge."""
    file_id = str(uuid.uuid4())

    with override_user(student_user), \
         patch("app.api.routes.quiz.get_supabase") as mock_supabase, \
         patch("app.api.routes.quiz.hybrid_search", return_value=mock_chunks), \
         patch("app.services.quiz_gen._openai") as mock_openai:

        # Mock Supabase file ownership check
        mock_table = Mock()
        mock_table.select.return_value.eq.return_value.execute.return_value = Mock(
            data=[{"uploaded_by": student_user["id"]}]
        )
        mock_supabase.return_value.table.return_value = mock_table

        # Mock OpenAI response
        mock_completion = Mock()
        mock_completion.choices = [Mock(message=Mock(content=json.dumps(mock_gpt4o_outside_sources_response)))]
        mock_openai.chat.completions.create.return_value = mock_completion

        response = client.post(
            "/quiz/generate",
            json={
                "topic": "machine learning",
                "file_id": file_id,
                "outside_sources": True,
            },
        )

        assert response.status_code == 200

        # Verify the system prompt includes outside sources instruction
        mock_openai.chat.completions.create.assert_called_once()
        call_kwargs = mock_openai.chat.completions.create.call_args[1]
        system_message = call_kwargs["messages"][0]["content"]

        assert "outside" in system_message.lower() or "broader knowledge" in system_message.lower()


def test_generate_quiz_no_file_id_outside_sources_false_general_knowledge(
    client, student_user, mock_gpt4o_response
):
    """AC-6.3.3: No file_id + outside_sources=False generates general knowledge (no 404)."""
    with override_user(student_user), \
         patch("app.api.routes.quiz.hybrid_search") as mock_search, \
         patch("app.services.quiz_gen._openai") as mock_openai:

        # Mock OpenAI response
        mock_completion = Mock()
        mock_completion.choices = [Mock(message=Mock(content=json.dumps(mock_gpt4o_response)))]
        mock_openai.chat.completions.create.return_value = mock_completion

        response = client.post(
            "/quiz/generate",
            json={
                "topic": "world history",
                "outside_sources": False,
            },
        )

        # Should succeed with general knowledge, not return 404
        assert response.status_code == 200
        # Verify hybrid_search was NOT called (no file_id)
        mock_search.assert_not_called()


# ── Access Control Tests ──────────────────────────────────────────────


def test_generate_quiz_unauthenticated_returns_401(client):
    """Unauthenticated request returns HTTP 401."""
    response = client.post(
        "/quiz/generate",
        json={"topic": "machine learning"},
    )
    assert response.status_code == 401


def test_generate_quiz_instructor_role_returns_403(client, instructor_user):
    """Instructor role returns HTTP 403."""
    with override_user(instructor_user):
        response = client.post(
            "/quiz/generate",
            json={"topic": "machine learning"},
        )
        assert response.status_code == 403
        assert "instructor" in response.json()["detail"].lower()


def test_generate_quiz_other_user_file_returns_403(
    client, student_user, other_student_user
):
    """Student using another user's file_id returns HTTP 403."""
    file_id = str(uuid.uuid4())

    with override_user(student_user), \
         patch("app.api.routes.quiz.get_supabase") as mock_supabase:

        # Mock Supabase file ownership check - file belongs to other_student_user
        mock_table = Mock()
        mock_table.select.return_value.eq.return_value.execute.return_value = Mock(
            data=[{"uploaded_by": other_student_user["id"]}]
        )
        mock_supabase.return_value.table.return_value = mock_table

        response = client.post(
            "/quiz/generate",
            json={
                "topic": "machine learning",
                "file_id": file_id,
            },
        )

        assert response.status_code == 403
        assert "access" in response.json()["detail"].lower()


def test_generate_quiz_file_not_found_returns_404(client, student_user):
    """file_id not found in DB returns HTTP 404."""
    file_id = str(uuid.uuid4())

    with override_user(student_user), \
         patch("app.api.routes.quiz.get_supabase") as mock_supabase:

        # Mock Supabase file ownership check - no file found
        mock_table = Mock()
        mock_table.select.return_value.eq.return_value.execute.return_value = Mock(
            data=[]
        )
        mock_supabase.return_value.table.return_value = mock_table

        response = client.post(
            "/quiz/generate",
            json={
                "topic": "machine learning",
                "file_id": file_id,
            },
        )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


# ── Unit Tests — quiz_gen.py ──────────────────────────────────────────


def test_difficulty_descriptors_contains_required_keys():
    """DIFFICULTY_DESCRIPTORS dict contains exactly 'easy', 'medium', 'hard'."""
    assert set(DIFFICULTY_DESCRIPTORS.keys()) == {"easy", "medium", "hard"}


def test_difficulty_descriptors_values_are_strings():
    """All DIFFICULTY_DESCRIPTORS values are non-empty strings."""
    for key, value in DIFFICULTY_DESCRIPTORS.items():
        assert isinstance(value, str)
        assert len(value) > 0


def test_generate_quiz_uses_difficulty_descriptor(mock_chunks, mock_gpt4o_response):
    """generate_quiz uses DIFFICULTY_DESCRIPTORS[difficulty] in prompt, not raw difficulty."""
    with patch("app.services.quiz_gen._openai") as mock_openai:
        # Mock OpenAI response
        mock_completion = Mock()
        mock_completion.choices = [Mock(message=Mock(content=json.dumps(mock_gpt4o_response)))]
        mock_openai.chat.completions.create.return_value = mock_completion

        questions = generate_quiz(
            topic="neural networks",
            chunks=mock_chunks,
            num_questions=3,
            difficulty="hard",
            question_types=["mcq", "short_answer"],
            outside_sources=False,
        )

        # Verify OpenAI was called
        mock_openai.chat.completions.create.assert_called_once()
        call_kwargs = mock_openai.chat.completions.create.call_args[1]
        user_message = call_kwargs["messages"][1]["content"]

        # Verify the descriptor is used, not the raw word "hard"
        assert DIFFICULTY_DESCRIPTORS["hard"] in user_message
        assert "challenging questions requiring analysis" in user_message


def test_generate_quiz_prompt_contains_descriptor_not_raw_difficulty(
    mock_chunks, mock_gpt4o_response
):
    """Prompt contains descriptor text, not bare word 'easy'/'medium'/'hard'."""
    with patch("app.services.quiz_gen._openai") as mock_openai:
        # Mock OpenAI response
        mock_completion = Mock()
        mock_completion.choices = [Mock(message=Mock(content=json.dumps(mock_gpt4o_response)))]
        mock_openai.chat.completions.create.return_value = mock_completion

        questions = generate_quiz(
            topic="quantum physics",
            chunks=mock_chunks,
            num_questions=5,
            difficulty="easy",
            question_types=["mcq"],
            outside_sources=False,
        )

        call_kwargs = mock_openai.chat.completions.create.call_args[1]
        user_message = call_kwargs["messages"][1]["content"]

        # The descriptor should be present
        assert DIFFICULTY_DESCRIPTORS["easy"] in user_message
        assert "straightforward recall" in user_message


# ── Unit Tests — retrieval.py ─────────────────────────────────────────


def test_hybrid_search_called_with_top_k_12():
    """hybrid_search is called with top_k=12 when invoked from quiz generation."""
    file_id = str(uuid.uuid4())

    with patch("app.services.retrieval.get_supabase") as mock_supabase, \
         patch("app.services.retrieval.embed_query", return_value=[0.1] * 1536):

        # Mock Supabase RPC response
        mock_rpc = Mock()
        mock_rpc.execute.return_value = Mock(data=[
            {
                "chunk_id": f"chunk-{i}",
                "file_id": file_id,
                "text": f"Sample text {i}",
                "page_numbers": [i],
                "similarity": 0.9 - (i * 0.05),
            }
            for i in range(12)
        ])
        mock_supabase.return_value.rpc.return_value = mock_rpc

        results = hybrid_search(topic="test topic", file_id=file_id, top_k=12)

        # Verify the RPC was called with match_count=12
        mock_supabase.return_value.rpc.assert_called_once()
        call_args = mock_supabase.return_value.rpc.call_args[0]

        assert call_args[0] == "match_chunks"
        # Second argument is a dict with params
        assert call_args[1]["match_count"] == 12
        assert call_args[1]["filter_file_id"] == file_id


def test_hybrid_search_filters_by_file_id():
    """hybrid_search passes correct file_id filter to match_chunks RPC."""
    file_id = str(uuid.uuid4())

    with patch("app.services.retrieval.get_supabase") as mock_supabase, \
         patch("app.services.retrieval.embed_query", return_value=[0.1] * 1536):

        # Mock Supabase RPC response
        mock_rpc = Mock()
        mock_rpc.execute.return_value = Mock(data=[])
        mock_supabase.return_value.rpc.return_value = mock_rpc

        results = hybrid_search(topic="test topic", file_id=file_id, top_k=12)

        # Verify file_id filter was passed
        call_args = mock_supabase.return_value.rpc.call_args[0]
        assert call_args[1]["filter_file_id"] == file_id
