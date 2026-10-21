/** What `modelmark --help` shows below the commands. */
export const PROGRAM_HELP = `
Examples:
  modelmark install               add the hook to this repository
  modelmark doctor                check that commits here will be marked
  modelmark summary               count the marks on this branch
  modelmark summary HEAD~5..HEAD  count the marks on the last five commits
  modelmark prices opus           show what the Opus models cost

To leave one commit unmarked: MODELMARK_DISABLE=1 git commit
Installed globally, it also runs as git modelmark.
More: https://github.com/superbuilders/modelmark#readme`

/** What `modelmark doctor --help` shows below the options. */
export const DOCTOR_HELP = `
Exits 1 when a check fails. A warning alone doesn't fail it.`

/** What `modelmark summary --help` shows below the options. */
export const SUMMARY_HELP = `
Formats:
  text      a line per mark, to read here
  json      the counts, for scripts
  markdown  a table, for a pull request
  badges    image badges, for a pull request

Examples:
  modelmark summary
  modelmark summary HEAD~5..HEAD
  modelmark summary origin/main..HEAD --format markdown`

/** What `modelmark prices --help` shows below the options. */
export const PRICES_HELP = `
Formats:
  text      a table, to read here
  json      the prices, for scripts
  markdown  a table, for a pull request or a doc

Examples:
  modelmark prices         the models this repository's commits use
  modelmark prices opus    every model with opus in its name
  modelmark prices --all   every model`
