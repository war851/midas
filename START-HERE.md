# Start here

025 is a sealed container that runs an AI coding agent and records everything it does into one SQLite
database. This file is the map: what each folder holds, and where to go for what you want.

## Go to what you want

- **The pitch, in one read:** [README.md](README.md)
- **See in action** (two readable walkthroughs of the real run): [two agents talking](docs/live-run/two-agents-talking.html) · [an agent thinking](docs/live-run/an-agent-thinking.html)
- **How it works** (the gate, the 7 channels, the spine): [ARCHITECTURE.md](ARCHITECTURE.md) and [docs/explanation/](docs/explanation/)
- **The exact facts** (channels, tools, hooks, schema), generated from the code: [docs/reference/](docs/reference/)
- **Run it yourself:** [docs/how-to/run-on-a-real-workload.md](docs/how-to/run-on-a-real-workload.md)
- **See a real run, captured:** [docs/live-run/](docs/live-run/) (start with the two walkthroughs)
- **The proof it is real:** [evidence/](evidence/) and [judge/](judge/)
- **The journey, and who could build on it:** [docs/explanation/authors-note.md](docs/explanation/authors-note.md)

## The folders

| Path | What it is |
|---|---|
| `README.md` | the pitch, the quickstart, the scope |
| `ARCHITECTURE.md` · `architecture.png` | how the system is built: the gate, the 7 channels, the spine |
| `src/` | the capture core: `spine/` (the SQLite and the capture), `otel/` (the breadth receiver), `disclosure/` (the honesty engine), `coverage/` (the denominator and grading) |
| `tests/` | the agent-free test suite |
| `scripts/` | `gen-reference.mjs` generates the reference docs from the code; `system-check.mjs` is the preflight |
| `infra/managed-settings.json` | the OTel lock that makes the breadth channel un-bypassable |
| `Dockerfile` · `docker-compose.yml` | the sealed, version-pinned container |
| `docs/explanation/` | the why: thesis, gate, capture-vs-trigger, honesty engine, pinned stack, denominator, author's note, disclaimer |
| `docs/reference/` | the facts, generated from the code: channels, tools, hooks, schema |
| `docs/how-to/` | running it on a real workload |
| `docs/live-run/` | a real run captured: the PRD, the site the agent built, the anonymized spine, two readable walkthroughs |
| `evidence/` | the parity proof: manifest, report, contract, verdict |
| `judge/` | the blind judge runner and the graded artifact |
| `LICENSE` | MIT |
