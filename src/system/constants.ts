/** How much of a log to read per step when searching it from the end. */
export const TAIL_CHUNK_BYTES = 262_144

/** Lists every process with its parent and command line, on Linux and macOS alike. */
export const PS_ARGV = ['ps', '-A', '-o', 'pid=,ppid=,args=']

/** modelmark's folder under the user's state and cache folders. */
export const STATE_FOLDER = 'modelmark'
