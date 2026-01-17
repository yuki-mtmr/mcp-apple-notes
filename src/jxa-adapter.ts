import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Executes a JXA (JavaScript for Automation) script and returns the result.
 *
 * To ensure safe argument passing and return value handling:
 * 1. The script should be defined as a function.
 * 2. Arguments are passed as a JSON string and parsed within the JXA environment.
 * 3. The result is JSON stringified in JXA and parsed back in Node.js.
 *
 * @param scriptBody - The JXA script body
 * @param args - Arguments to pass to the script
 * @param timeout - Timeout in milliseconds (default: 10000)
 */
export async function runJxa<T>(scriptBody: string, args: any[] = [], timeout: number = 10000): Promise<T> {
    // Wrap the script to handle JSON I/O
    // standard 'run' function in JXA can take arguments if called from command line with -l JavaScript
    // But passing complex objects via command line arguments is tricky.
    // Best approach: Inject the arguments as a JSON variable at the top of the script.

    const serializedArgs = JSON.stringify(args);

    // We explicitly use JSON.stringify in JXA to return the value formatted safely
    const wrapper = `
    const args = JSON.parse('${serializedArgs.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}');

    function run(argv) {
      ${scriptBody}
    }

    // Execute and return JSON
    // We catch errors to return them as JSON objects
    try {
      const result = run(args);
      console.log(JSON.stringify({ status: 'success', data: result }));
    } catch (e) {
      console.log(JSON.stringify({ status: 'error', message: e.message || String(e) }));
    }
  `;

    try {
        // Using stdin for the script source to avoid shell escaping issues with the script code itself.
        const child = execAsync('osascript -l JavaScript');
        const process = child.child;

        if (!process.stdin) {
            throw new Error('Could not open stdin for osascript');
        }

        process.stdin.write(wrapper);
        process.stdin.end();

        // Add timeout to prevent hanging
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`JXA execution timeout after ${timeout}ms`)), timeout);
        });

        const { stdout, stderr } = await Promise.race([child, timeoutPromise]);

        // console.log in JXA outputs to stderr, not stdout
        // Try stderr first, then stdout
        let outputText = '';
        if (stderr && stderr.trim()) {
            outputText = stderr.trim();
        } else if (stdout && stdout.trim()) {
            outputText = stdout.trim();
        }

        if (!outputText) {
            return null as T;
        }

        const output = JSON.parse(outputText);
        if (output.status === 'error') {
            throw new Error(`JXA Error: ${output.message}`);
        }

        return output.data as T;

    } catch (error: any) {
        throw new Error(`Failed to execute JXA: ${error.message}`);
    }
}
