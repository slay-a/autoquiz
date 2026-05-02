"""
Red-phase tests for Issue #22 — DESIGN.md §3.1.1 error envelope compliance.

Blockers pinned:

B1 (MAJOR): classes.py:120 — create_class_route raises HTTPException(400) with
     bare {"detail"} envelope when class name is empty.
     Fix: replace with JSONResponse using the standard error envelope.

B2 (MAJOR): classes.py:222-229 — get_class_detail_route raises HTTPException(404)
     and HTTPException(403) with bare {"detail"} envelope.
     Fix: replace with JSONResponse using the standard error envelope.

B3 (MAJOR): classes.py:436,438 — _require_instructor raises HTTPException(404) and
     HTTPException(403) with bare {"detail"} envelope. Propagates to 9 routes.
     Fix: replace with JSONResponse / _EnvelopeException pattern.

B4 (MAJOR): retrieve.py:13 — retrieve_chunks raises HTTPException(400, "Topic cannot
     be empty") with bare {"detail"} envelope.
     Fix: replace with JSONResponse using the standard error envelope.

B5 (MAJOR): main.py — no HTTPException handler registered. FastAPI default
     {"detail"} envelope is still reachable for any stray HTTPException.
     Also: no RequestValidationError handler for 422s (DESIGN.md §3.1.1 permits the
     Pydantic 422 detail array, but the HTTPException default is not permitted).
     Fix: register app.exception_handler(HTTPException) in main.py that wraps
     detail in the standard envelope; register RequestValidationError handler that
     wraps the detail array in the standard envelope.
"""

import ast
from pathlib import Path

BACKEND_DIR = Path(__file__).parent.parent
ROUTES_CLASSES = BACKEND_DIR / "app" / "api" / "routes" / "classes.py"
ROUTES_RETRIEVE = BACKEND_DIR / "app" / "api" / "routes" / "retrieve.py"
MAIN_PY = BACKEND_DIR / "main.py"


def _source(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _tree(path: Path) -> ast.Module:
    return ast.parse(_source(path))


def _collect_raise_http_exception_lines(path: Path) -> list[tuple[int, str]]:
    """
    Walk the AST and collect every Raise node that raises an HTTPException directly.
    Returns list of (line_number, reconstructed_source_line) tuples.
    """
    tree = _tree(path)
    results = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Raise) and node.exc is not None:
            exc = node.exc
            # Direct: raise HTTPException(...)
            if isinstance(exc, ast.Call):
                func = exc.func
                name = None
                if isinstance(func, ast.Name):
                    name = func.id
                elif isinstance(func, ast.Attribute):
                    name = func.attr
                if name == "HTTPException":
                    results.append((node.lineno, ast.unparse(node)))
    return results


# ── B1: create_class_route must not raise HTTPException ──────────────────────


class TestCreateClassRouteNoRawHTTPException:
    """
    MAJOR (DESIGN.md §3.1.1):
    create_class_route in classes.py must not raise a bare HTTPException.
    The empty-name check at line 120 currently raises HTTPException(400)
    which returns {"detail": "..."} instead of the standard envelope.
    """

    def test_classes_py_create_class_no_raw_http_exception(self):
        """
        classes.py must not contain 'raise HTTPException(...)' inside create_class_route.
        """
        source = _source(ROUTES_CLASSES)
        tree = _tree(ROUTES_CLASSES)

        # Find create_class_route function body line range
        create_fn = None
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name == "create_class_route":
                    create_fn = node
                    break

        assert create_fn is not None, "create_class_route not found in classes.py"

        fn_lines = set(range(create_fn.lineno, create_fn.end_lineno + 1))
        violations = [
            (ln, src) for ln, src in _collect_raise_http_exception_lines(ROUTES_CLASSES)
            if ln in fn_lines
        ]

        assert violations == [], (
            f"MAJOR §3.1.1: create_class_route raises HTTPException directly at: {violations}. "
            "Must return JSONResponse with the standard error envelope "
            '{"error": {"code": ..., "message": ..., "request_id": ...}} instead.'
        )


# ── B2: get_class_detail_route must not raise HTTPException ──────────────────


class TestGetClassDetailRouteNoRawHTTPException:
    """
    MAJOR (DESIGN.md §3.1.1):
    get_class_detail_route in classes.py raises HTTPException(404) and HTTPException(403)
    at lines ~222-229. These return {"detail": "..."} instead of the standard envelope.
    """

    def test_classes_py_get_class_detail_no_raw_http_exception(self):
        """
        get_class_detail_route must not raise HTTPException directly.
        """
        tree = _tree(ROUTES_CLASSES)

        get_detail_fn = None
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name == "get_class_detail_route":
                    get_detail_fn = node
                    break

        assert get_detail_fn is not None, "get_class_detail_route not found in classes.py"

        fn_lines = set(range(get_detail_fn.lineno, get_detail_fn.end_lineno + 1))
        violations = [
            (ln, src) for ln, src in _collect_raise_http_exception_lines(ROUTES_CLASSES)
            if ln in fn_lines
        ]

        assert violations == [], (
            f"MAJOR §3.1.1: get_class_detail_route raises HTTPException directly at: {violations}. "
            "Must use JSONResponse with the standard error envelope instead."
        )


# ── B3: _require_instructor must not raise HTTPException ─────────────────────


class TestRequireInstructorNoRawHTTPException:
    """
    MAJOR (DESIGN.md §3.1.1):
    _require_instructor in classes.py raises HTTPException(404) at line ~436
    and HTTPException(403) at line ~438. This helper propagates the bare
    {"detail"} envelope to all 9 routes that call it.
    """

    def test_classes_py_require_instructor_no_raw_http_exception(self):
        """
        _require_instructor must not raise HTTPException directly.
        """
        tree = _tree(ROUTES_CLASSES)

        require_fn = None
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name == "_require_instructor":
                    require_fn = node
                    break

        assert require_fn is not None, "_require_instructor not found in classes.py"

        fn_lines = set(range(require_fn.lineno, require_fn.end_lineno + 1))
        violations = [
            (ln, src) for ln, src in _collect_raise_http_exception_lines(ROUTES_CLASSES)
            if ln in fn_lines
        ]

        assert violations == [], (
            f"MAJOR §3.1.1: _require_instructor raises HTTPException directly at: {violations}. "
            "Must raise _EnvelopeException (carrying a JSONResponse) or return a JSONResponse "
            "so the standard error envelope is always emitted."
        )


# ── B3 supplemental: no file-level bare HTTPException raises at all ───────────


class TestClassesNoFileWideBareHTTPException:
    """
    Comprehensive guard: after B1-B3 are fixed, classes.py must contain zero
    bare 'raise HTTPException(...)' statements anywhere in the file.
    All 5 previously flagged sites (lines 120, 223, 227, 436, 438) must be gone.
    """

    def test_classes_py_zero_raise_http_exception(self):
        """
        classes.py must contain no 'raise HTTPException(...)' statements.
        Every error path must return a JSONResponse with the standard envelope.
        """
        violations = _collect_raise_http_exception_lines(ROUTES_CLASSES)
        assert violations == [], (
            f"MAJOR §3.1.1: classes.py still contains {len(violations)} bare "
            f"'raise HTTPException(...)' statement(s): {violations}. "
            "All error responses must use the standard envelope."
        )


# ── B4: retrieve.py must not raise bare HTTPException ────────────────────────


class TestRetrieveNoRawHTTPException:
    """
    MAJOR (DESIGN.md §3.1.1):
    retrieve.py:13 raises HTTPException(400, "Topic cannot be empty") which
    returns {"detail": "Topic cannot be empty"} — not the standard envelope.
    """

    def test_retrieve_py_zero_raise_http_exception(self):
        """
        retrieve.py must contain no 'raise HTTPException(...)' statements.
        The empty-topic check must use JSONResponse with the standard envelope.
        """
        violations = _collect_raise_http_exception_lines(ROUTES_RETRIEVE)
        assert violations == [], (
            f"MAJOR §3.1.1: retrieve.py still contains {len(violations)} bare "
            f"'raise HTTPException(...)' statement(s): {violations}. "
            "Must use JSONResponse with the standard error envelope."
        )

    def test_retrieve_py_uses_empty_topic_error_code(self):
        """
        retrieve.py must import and use the EMPTY_TOPIC error code from error_codes.py
        (per DESIGN.md §3.1.2 — codes must come from the registry, not string literals).
        """
        source = _source(ROUTES_RETRIEVE)
        assert "EMPTY_TOPIC" in source, (
            "MAJOR §3.1.2: retrieve.py must use the EMPTY_TOPIC error code from "
            "app.core.error_codes instead of a string literal."
        )


# ── B5: main.py must register an HTTPException handler ───────────────────────


class TestMainRegistersHTTPExceptionHandler:
    """
    MAJOR (DESIGN.md §3.1.1):
    main.py registers handlers for _EnvelopeException and the generic Exception,
    but NOT for HTTPException. This means any route that raises HTTPException
    (including FastAPI's own 405 Method Not Allowed, 404 Not Found from routing,
    and any remaining stray raises) will still emit {"detail": "..."}.

    Fix: register app.exception_handler(HTTPException) that wraps detail in
    the standard envelope.
    """

    def _get_exception_handler_types(self) -> list[str]:
        """
        Parse main.py and return the list of exception types registered via
        @app.exception_handler(...) decorators.
        """
        tree = _tree(MAIN_PY)
        handler_types = []

        for node in ast.walk(tree):
            # Look for function defs with @app.exception_handler(...) decorator
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                for dec in node.decorator_list:
                    if isinstance(dec, ast.Call):
                        func = dec.func
                        # app.exception_handler(SomeType)
                        if (
                            isinstance(func, ast.Attribute)
                            and func.attr == "exception_handler"
                        ):
                            for arg in dec.args:
                                if isinstance(arg, ast.Name):
                                    handler_types.append(arg.id)
                                elif isinstance(arg, ast.Attribute):
                                    handler_types.append(arg.attr)

        return handler_types

    def test_main_registers_http_exception_handler(self):
        """
        main.py must register @app.exception_handler(HTTPException) so that
        FastAPI's default {"detail"} envelope is never reached.
        """
        handler_types = self._get_exception_handler_types()
        assert "HTTPException" in handler_types, (
            f"MAJOR §3.1.1: main.py does not register an HTTPException handler. "
            f"Currently registered handlers: {handler_types}. "
            "Add @app.exception_handler(HTTPException) that wraps detail in the "
            'standard envelope {"error": {"code": ..., "message": ..., "request_id": ...}}.'
        )

    def test_main_http_exception_handler_imports_http_exception(self):
        """
        main.py must import HTTPException (from fastapi or starlette) to register
        the handler.
        """
        source = _source(MAIN_PY)
        assert "HTTPException" in source, (
            "MAJOR §3.1.1: main.py does not import or reference HTTPException. "
            "Cannot register an HTTPException handler without importing the class."
        )

    def test_main_registers_request_validation_error_handler(self):
        """
        main.py must register @app.exception_handler(RequestValidationError)
        so that FastAPI's 422 validation responses also use the standard envelope.
        Per DESIGN.md §3.1.1: 'FastAPI's default 422 validation response is the one
        permitted exception — its detail array shape is preserved unchanged'.
        This test verifies the handler is registered (even if it passes through
        the detail array unchanged).
        """
        handler_types = self._get_exception_handler_types()
        assert "RequestValidationError" in handler_types, (
            f"MAJOR §3.1.1: main.py does not register a RequestValidationError handler. "
            f"Currently registered handlers: {handler_types}. "
            "Add @app.exception_handler(RequestValidationError) to control 422 responses."
        )
