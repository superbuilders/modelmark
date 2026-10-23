# modelmark Usage Log

A file format that lets any AI agent tell modelmark what its model replies
used, so modelmark can put a cost and a token count on the agent's commits.
modelmark reads Claude Code's, Codex's and Pi's own records; every other agent
writes one of these.

## Versions

| Version | Status | Spec             | Schema                             | Changes       |
| ------- | ------ | ---------------- | ---------------------------------- | ------------- |
| 1       | Draft  | [v1.md](./v1.md) | [v1.schema.json](./v1.schema.json) | First version |

A version is a draft until a modelmark release reads it. After that it is
stable: it only gains OPTIONAL members, and anything else gets a new version
(v1.md, section 8).

## What's here

- `v<n>.md`: the spec, the source of truth.
- `v<n>.schema.json`: a JSON Schema for one line of the file. Its `$defs`
  hold the header and the reply.
- `conformance/`: example files and `cases.json`, which says what a reader
  must get from each one. `accepted/` files are read, some with broken lines
  a reader skips. `rejected/` files aren't read at all. `providers/` holds
  real usage from each provider's API beside the reply line a writer makes
  from it (v1.md, appendix A).
- `v<n>.test.ts`: checks that the schema, the cases and appendix A's
  conversions agree. A change to the
  spec changes the schema and the cases with it.
