## AGENTS.md — Agent Implementation Rules

This repository is still under active development. Follow the rules below strictly.

### 1. Character Encoding / Console

* Use **UTF-8** for all console output and file operations.
* Set the PowerShell console encoding to **UTF-8** as well.
* Do not introduce files encoded in anything other than UTF-8.
* Follow the repository’s default line ending settings, and **do not perform unrelated bulk conversions**.
* Do not use emoji (✅/⚠️/❌/❓, etc.) in code. If the UI needs them, use icons instead.

### 2. Do Not Change Requirements

* Do **not add new requirements or features** that are not written in the spec.
* Do **not remove or simplify** requirements that are in the spec.
* If the spec is ambiguous, do not guess. Ask questions and confirm.

### 3. Safety: Data and Security

* Do not log secrets, tokens, or personal data.
* If you touch authentication/session/token-related parts, write the security impact in the PR notes.
* Pay attention to GameState “redaction” (masking): **do not leak private information** in payloads intended for players/spectators.

### 4. Build / Test

* Before marking work complete, run and pass the repository’s **main checks** as much as possible (primarily build, and lint/typecheck/test if needed).
* If lint/typecheck/test are not set up, introduce/configure them as necessary.

### 5. Database / Prisma

* If you change the Prisma schema, **create a migration**.
* If it’s just for checking data, it’s okay to inspect directly using the `mysql` command.

### 6. Data Structures (payload / shared types / DB-derived shapes)

* If you change a data structure, **keep server/client/shared types aligned in the same change**.
* **If the data structure changes, do not maintain backward compatibility with the old structure.**

  * In principle, do not add conversions/fallbacks/branches to accept old formats (e.g., interpreting legacy fields, supporting both v1/v2, etc.).
