---
name: Daymark preview routing
description: Why the Flask task manager needs a root-routed web artifact for Replit preview.
---

The Replit artifact router does not route the root preview to a standalone Flask workflow just because that workflow is running. Without a registered web artifact at `/`, the preview responds with a platform 404 before Flask receives the request.

**Why:** The project uses artifact-based path routing, so preview availability depends on the registered artifact route, not only on the server listening on a port.

**How to apply:** Keep the Daymark web artifact's root route connected to the Flask server and verify the artifact preview, rather than relying on a standalone workflow or `.replit` port mapping.
