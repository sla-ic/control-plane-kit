# Slack custom app — headless search for the runtime

**Why:** the mcpgw Slack connector is **bot-token only**. Its granted scopes are all bot
scopes; `search.messages` needs a **user-token** scope (`search:read`) that mcpgw's app
never requests, so re-consenting can never surface it (proven: `missing_scope`,
`needed: search:read.public`). A custom Slack app you own mints a **user token (`xoxp-`)**
with `search:read`. Once it's on disk, the runtime calls Slack's Web API directly — no
mcpgw, fully headless. Code is already wired (`mcp-dispatch.slackSearch` +
`cross-system-audit.js`); it activates the moment the token file exists.

Per IT's own runbook ("How To Request A New Slack Integration",
https://acme.atlassian.net/wiki/spaces/IT/pages/1447100635) this is the self-serve
path: an app created by a workspace member is approved by IT or, for sensitive access,
escalated to Security. Approvals batch weekly (Wed); email helpdesk@example.com to expedite.

## Steps (the parts that need your Slack login — I can't OAuth as you)

1. Go to https://api.slack.com/apps → **Create New App** → **From an app manifest**.
2. Pick the **Acme** workspace.
3. Paste the contents of [`slack-custom-app.manifest.paste.json`](slack-custom-app.manifest.paste.json)
   (comment-free — Slack's manifest creator rejects unknown keys; the annotated original is
   `slack-custom-app.manifest.json`) → Next → Create.
   - If the workspace requires admin approval, it'll say "pending" — that's the IT/Security
     review. Ping helpdesk with the app name to expedite.
4. Once approved: **OAuth & Permissions** → **Install to Workspace** → Allow.
5. Copy the **User OAuth Token** (starts with `xoxp-`). Then:

   ```sh
   mkdir -p ~/.config/amp
   printf '%s' 'xoxp-PASTE-HERE' > ~/.config/amp/slack-user.token
   chmod 600 ~/.config/amp/slack-user.token
   ```

6. Verify (no restart needed):

   ```sh
   cd ~/.local/share/amp-tasks
   node -e 'require("./mcp-dispatch").slackSearch("InstallCo Canada launch",{count:3}).then(r=>console.log(r.ok, r.total, r.text.slice(0,300)))'
   ```

   `true <N> [#channel …]` → live. Then `node cross-system-audit.js --refresh` re-runs the
   audit with real Slack signal on every thread.

## Notes
- **Token = credential.** It lives only in `~/.config/amp/slack-user.token` (0600), never in
  git, never echoed. `$SLACK_USER_TOKEN` env var overrides the file if set.
- Scope is **read + search only** (see manifest). No send scope beyond `chat:write` on the
  bot side, and the floor still hard-denies Slack sends outside the whitelist regardless.
- This does **not** touch the mcpgw connector — gmail/calendar/etc. keep working unchanged.
- Until the token exists, the runtime falls back to the local `slack_signal` cache (harness
  enrichment) and stays conservative — nothing breaks.
