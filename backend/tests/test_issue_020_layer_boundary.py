"""
Red-phase tests for Issue #20 — DESIGN.md §0 layer boundary violation.

Blockers pinned:

B1/B2 (CRITICAL): backend/app/api/routes/classes.py imports get_supabase from
       app.core.supabase (Layer 3) and calls it in every route handler.
       Per DESIGN.md §0: "No direct DB or OpenAI calls" in Layer 1.
       Fix: remove the import and all get_supabase() calls from classes.py.

B3 (CRITICAL): backend/app/services/class_service.py accepts `supabase: Client`
       as the first parameter of every public function, enabling the Layer 1 → Layer 3
       bypass. Service functions must acquire the Supabase client internally.
       Fix: remove supabase parameter from all public service functions; call
       get_supabase() inside each function body.
"""

import ast
from pathlib import Path

BACKEND_DIR = Path(__file__).parent.parent
ROUTES_CLASSES = BACKEND_DIR / "app" / "api" / "routes" / "classes.py"
SERVICE_CLASSES = BACKEND_DIR / "app" / "services" / "class_service.py"
ROUTES_QUIZ    = BACKEND_DIR / "app" / "api" / "routes" / "quiz.py"
ROUTES_NOTES   = BACKEND_DIR / "app" / "api" / "routes" / "notes.py"


def _source(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _tree(path: Path) -> ast.Module:
    return ast.parse(_source(path))


# ── B1: classes.py must not import get_supabase ────────────────────────────────


class TestClassesRouteDoesNotImportGetSupabase:
    """
    CRITICAL (DESIGN.md §0):
    Layer 1 (routes) must not import or use infrastructure layer (Layer 3) clients.
    'from app.core.supabase import get_supabase' in a route file is a direct violation.
    """

    def test_classes_py_does_not_import_get_supabase(self):
        """
        backend/app/api/routes/classes.py must not contain
        'from app.core.supabase import get_supabase'.
        """
        tree = _tree(ROUTES_CLASSES)

        violations = []
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                if node.module and "supabase" in node.module:
                    names = [a.name for a in node.names]
                    if "get_supabase" in names:
                        violations.append(
                            f"line {node.lineno}: from {node.module} import {', '.join(names)}"
                        )

        assert violations == [], (
            "CRITICAL §0 violation: classes.py imports get_supabase from the infrastructure "
            "layer. Layer 1 (routes) must not import Layer 3 (core) directly. "
            f"Found: {violations}"
        )

    def test_classes_py_does_not_call_get_supabase(self):
        """
        backend/app/api/routes/classes.py must not contain any calls to get_supabase().
        All client acquisition must happen in the service layer (Layer 2).
        """
        tree = _tree(ROUTES_CLASSES)

        call_sites = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func = node.func
                if isinstance(func, ast.Name) and func.id == "get_supabase":
                    call_sites.append(f"line {node.lineno}")

        assert call_sites == [], (
            "CRITICAL §0 violation: classes.py calls get_supabase() in route handlers. "
            "Supabase client acquisition must happen inside service functions (Layer 2), "
            f"not in routes (Layer 1). Found calls at: {call_sites}"
        )


# ── B3: class_service.py functions must not accept supabase as a parameter ────


class TestClassServiceFunctionsDoNotAcceptSupabaseParam:
    """
    CRITICAL (DESIGN.md §0):
    Passing a Supabase client from a route into a service function is equivalent
    to the route touching Layer 3 directly — it just adds one indirection.
    Service functions must acquire the client internally via get_supabase().
    """

    def _get_public_functions(self) -> list[ast.FunctionDef]:
        """Return all top-level public function defs in class_service.py."""
        tree = _tree(SERVICE_CLASSES)
        return [
            node for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and not node.name.startswith("_")
            # Only top-level (not nested)
        ]

    def test_create_class_does_not_accept_supabase_param(self):
        """create_class() must not accept 'supabase' as a parameter."""
        fns = self._get_public_functions()
        create_fns = [f for f in fns if f.name == "create_class"]
        assert create_fns, "create_class function not found in class_service.py"
        fn = create_fns[0]
        param_names = [a.arg for a in fn.args.args]
        assert "supabase" not in param_names, (
            f"CRITICAL §0: create_class() in class_service.py must not accept "
            f"a 'supabase' parameter (the route would have to call get_supabase() to pass it, "
            f"violating the layer boundary). Found params: {param_names}"
        )

    def test_list_classes_does_not_accept_supabase_param(self):
        """list_classes() must not accept 'supabase' as a parameter."""
        fns = self._get_public_functions()
        target_fns = [f for f in fns if f.name == "list_classes"]
        assert target_fns, "list_classes function not found in class_service.py"
        fn = target_fns[0]
        param_names = [a.arg for a in fn.args.args]
        assert "supabase" not in param_names, (
            f"CRITICAL §0: list_classes() must not accept a 'supabase' parameter. "
            f"Found params: {param_names}"
        )

    def test_get_class_detail_does_not_accept_supabase_param(self):
        """get_class_detail() must not accept 'supabase' as a parameter."""
        fns = self._get_public_functions()
        target_fns = [f for f in fns if f.name == "get_class_detail"]
        assert target_fns, "get_class_detail function not found in class_service.py"
        fn = target_fns[0]
        param_names = [a.arg for a in fn.args.args]
        assert "supabase" not in param_names, (
            f"CRITICAL §0: get_class_detail() must not accept a 'supabase' parameter. "
            f"Found params: {param_names}"
        )

    def test_join_class_by_code_does_not_accept_supabase_param(self):
        """join_class_by_code() must not accept 'supabase' as a parameter."""
        fns = self._get_public_functions()
        target_fns = [f for f in fns if f.name == "join_class_by_code"]
        assert target_fns, "join_class_by_code function not found in class_service.py"
        fn = target_fns[0]
        param_names = [a.arg for a in fn.args.args]
        assert "supabase" not in param_names, (
            f"CRITICAL §0: join_class_by_code() must not accept a 'supabase' parameter. "
            f"Found params: {param_names}"
        )

    def test_get_student_classes_does_not_accept_supabase_param(self):
        """get_student_classes() must not accept 'supabase' as a parameter."""
        fns = self._get_public_functions()
        target_fns = [f for f in fns if f.name == "get_student_classes"]
        assert target_fns, "get_student_classes function not found in class_service.py"
        fn = target_fns[0]
        param_names = [a.arg for a in fn.args.args]
        assert "supabase" not in param_names, (
            f"CRITICAL §0: get_student_classes() must not accept a 'supabase' parameter. "
            f"Found params: {param_names}"
        )

    def test_get_student_content_does_not_accept_supabase_param(self):
        """get_student_content() must not accept 'supabase' as a parameter."""
        fns = self._get_public_functions()
        target_fns = [f for f in fns if f.name == "get_student_content"]
        assert target_fns, "get_student_content function not found in class_service.py"
        fn = target_fns[0]
        param_names = [a.arg for a in fn.args.args]
        assert "supabase" not in param_names, (
            f"CRITICAL §0: get_student_content() must not accept a 'supabase' parameter. "
            f"Found params: {param_names}"
        )

    def test_save_class_quiz_does_not_accept_supabase_param(self):
        """save_class_quiz() must not accept 'supabase' as a parameter."""
        fns = self._get_public_functions()
        target_fns = [f for f in fns if f.name == "save_class_quiz"]
        assert target_fns, "save_class_quiz function not found in class_service.py"
        fn = target_fns[0]
        param_names = [a.arg for a in fn.args.args]
        assert "supabase" not in param_names, (
            f"CRITICAL §0: save_class_quiz() must not accept a 'supabase' parameter. "
            f"Found params: {param_names}"
        )

    def test_get_class_quizzes_does_not_accept_supabase_param(self):
        """get_class_quizzes() must not accept 'supabase' as a parameter."""
        fns = self._get_public_functions()
        target_fns = [f for f in fns if f.name == "get_class_quizzes"]
        assert target_fns, "get_class_quizzes function not found in class_service.py"
        fn = target_fns[0]
        param_names = [a.arg for a in fn.args.args]
        assert "supabase" not in param_names, (
            f"CRITICAL §0: get_class_quizzes() must not accept a 'supabase' parameter. "
            f"Found params: {param_names}"
        )

    def test_toggle_quiz_share_does_not_accept_supabase_param(self):
        """toggle_quiz_share() must not accept 'supabase' as a parameter."""
        fns = self._get_public_functions()
        target_fns = [f for f in fns if f.name == "toggle_quiz_share"]
        assert target_fns, "toggle_quiz_share function not found in class_service.py"
        fn = target_fns[0]
        param_names = [a.arg for a in fn.args.args]
        assert "supabase" not in param_names, (
            f"CRITICAL §0: toggle_quiz_share() must not accept a 'supabase' parameter. "
            f"Found params: {param_names}"
        )

    def test_get_class_notes_does_not_accept_supabase_param(self):
        """get_class_notes() must not accept 'supabase' as a parameter."""
        fns = self._get_public_functions()
        target_fns = [f for f in fns if f.name == "get_class_notes"]
        assert target_fns, "get_class_notes function not found in class_service.py"
        fn = target_fns[0]
        param_names = [a.arg for a in fn.args.args]
        assert "supabase" not in param_names, (
            f"CRITICAL §0: get_class_notes() must not accept a 'supabase' parameter. "
            f"Found params: {param_names}"
        )


# ── AC-20.4: quiz.py and notes.py must stay clean ──────────────────────────────


class TestPreviouslyFixedRoutesRemainingClean:
    """
    AC-20.4: Regression guard — quiz.py and notes.py were already fixed.
    These must not have get_supabase re-introduced.
    """

    def _has_get_supabase_import(self, path: Path) -> list[str]:
        tree = _tree(path)
        violations = []
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                if node.module and "supabase" in node.module:
                    names = [a.name for a in node.names]
                    if "get_supabase" in names:
                        violations.append(f"line {node.lineno}")
        return violations

    def _has_get_supabase_call(self, path: Path) -> list[str]:
        tree = _tree(path)
        call_sites = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Call):
                func = node.func
                if isinstance(func, ast.Name) and func.id == "get_supabase":
                    call_sites.append(f"line {node.lineno}")
        return call_sites

    def test_quiz_py_has_no_get_supabase_import(self):
        """AC-20.4.1: quiz.py must not import get_supabase (already fixed — regression guard)."""
        violations = self._has_get_supabase_import(ROUTES_QUIZ)
        assert violations == [], (
            f"Regression: quiz.py re-introduced get_supabase import at {violations}"
        )

    def test_quiz_py_has_no_get_supabase_call(self):
        """AC-20.4.1: quiz.py must not call get_supabase() (already fixed — regression guard)."""
        calls = self._has_get_supabase_call(ROUTES_QUIZ)
        assert calls == [], (
            f"Regression: quiz.py re-introduced get_supabase() call at {calls}"
        )

    def test_notes_py_has_no_get_supabase_import(self):
        """AC-20.4.2: notes.py must not import get_supabase (already fixed — regression guard)."""
        violations = self._has_get_supabase_import(ROUTES_NOTES)
        assert violations == [], (
            f"Regression: notes.py re-introduced get_supabase import at {violations}"
        )

    def test_notes_py_has_no_get_supabase_call(self):
        """AC-20.4.2: notes.py must not call get_supabase() (already fixed — regression guard)."""
        calls = self._has_get_supabase_call(ROUTES_NOTES)
        assert calls == [], (
            f"Regression: notes.py re-introduced get_supabase() call at {calls}"
        )
