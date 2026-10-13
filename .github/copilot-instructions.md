# Workspace guidance

- This is a Next.js 15 / TypeScript frontend plus a FastAPI / Python API.
- Keep tenant boundaries explicit in every persistence query and API authorization check.
- Never commit `.env` files, API keys, JWT secrets, customer payloads, or real test credentials.
- Validate imports and AI-generated data before use; never execute generated requests against untrusted targets.
- Run frontend type checks/build and backend tests after changes. See README.md for local setup and security limitations.
