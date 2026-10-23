/** How much of a log to read per step when searching it from the end. */
export const TAIL_CHUNK_BYTES = 262_144

/**
 * Lists every process with its parent and name. The name comes last, so it
 * keeps its spaces: macOS gives the path the process was launched by, Linux
 * the name the process gives itself. `-ww` stops `ps` cutting lines to the
 * terminal's width.
 */
export const PS_NAMES_ARGV = ['ps', '-A', '-ww', '-o', 'pid=,ppid=,comm=']

/** Lists every process with its command line, whose words `ps` joins with spaces. */
export const PS_ARGS_ARGV = ['ps', '-A', '-ww', '-o', 'pid=,args=']

/** modelmark's folder under the user's state and cache folders. */
export const STATE_FOLDER = 'modelmark'
