# Reference material — read-only

`LP_Tool_How_It_Works.md` documents an existing internal tool that inspired LP Platform.

Use it for **mechanics**: step order, algorithms, thresholds, Shopify rules and limits.
Do **not** copy its architecture (stdlib HTTP server, JSON files as primary store, in-memory jobs
and OAuth state, data-URI-inlined pages, no app auth, single replica). Each of those is reversed
in this project — see CLAUDE.md §3 and docs/DECISIONS.md D3, D8, D9, D10.

If this document and docs/BUILD_SPEC.md disagree, BUILD_SPEC.md wins.
Never edit this file.
