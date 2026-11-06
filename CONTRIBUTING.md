# Contributing to Usage Cabaret

1. Fork this repository and branch from `main`.
2. Make your change and run `bash scripts/check.sh` with Node.js 22 or newer. The check uses sample quota data and needs no Claude or Codex account.
3. If you change the stage or meters, run `node server.mjs` and check the dashboard at desktop and phone widths. Confirm the pause button and reduced-motion setting still work.
4. Open a pull request with what changed and how you checked it. Use sample data in screenshots or bug reports.

`server.mjs` serves the dashboard and reads quota. `claude-statusline.mjs` collects Claude Code quota snapshots. `public/stage.svg` contains the artwork, and `public/style.css` controls the choreography. Contributions are licensed under the project's [MIT License](LICENSE).
