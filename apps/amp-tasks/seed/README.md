# `seed/`

Drop-in JSON files that bulk-import real content into the task DB — planners, project maps,
vocabulary, and enrichment payloads consumed by importers like `import-planners.js`,
`build-vocab.js`, and the enrichment scripts.

This directory ships **empty on purpose**: the example data lives in
[`../seed-tasks.js`](../seed-tasks.js), which is enough to make the dashboard render on first run.
Add your own JSON here once you're importing real planners or a vocabulary, and point the relevant
importer at it. Keep anything confidential out of version control.
