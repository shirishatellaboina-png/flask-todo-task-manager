---
name: Daymark preview routing
description: Why the Flask task manager needs a root-routed web artifact for Replit preview.
---

The Replit artifact router does not route the root preview to a standalone Flask workflow just because that workflow is running. Without a registered web artifact at `/`, the preview responds with a platform 404 before Flask receives the request.

Artifact production build commands run from the workspace root, unlike the development service command, which is artifact-relative. A root-level Flask entry point should therefore use `main.py` in production build/run args; using `../../main.py` makes the publish build look outside the workspace.

**Why:** The project uses artifact-based path routing, and the publish log confirmed that production build arguments resolve from the workspace root.

**How to apply:** Keep the Daymark web artifact's root route connected to Flask; use workspace-root-relative production paths and artifact-relative development paths.
