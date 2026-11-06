import { homedir } from 'node:os';
import { join } from 'node:path';

export const claudeWindows = { five_hour: 300, seven_day: 10080 };
export const readingsDir = process.env.CABARET_STATE_DIR || join(homedir(), '.usage-cabaret');
export const readingPath = key => join(readingsDir, `${key}.json`);
