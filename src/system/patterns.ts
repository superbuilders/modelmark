/**
 * An absolute path (or one from the home folder, `~/`) inside text, starting
 * where the text breaks: a space, a quote, `=` or a bracket. Captures the path.
 */
export const ABSOLUTE_PATH = /(?:^|[\s"'`=(])((?:~(?=\/))?\/[^\s"'`;|&<>(){}$,\\]+)/g
