const { spawn } = require('child_process');
const path = require('path');

const serverPath = path.resolve(__dirname, '../dist/index.js');
const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
});

const start = Date.now();

server.stderr.on('data', (data) => {
    // console.log(`Stderr: ${data}`);
});

let buffer = '';
server.stdout.on('data', (data) => {
    buffer += data.toString();
    if (buffer.includes('"id":1')) {
        const end = Date.now();
        console.log(`Response received in ${end - start}ms`);
        // console.log(buffer);
        process.exit(0);
    }
});

const request = {
    method: "tools/call",
    params: {
        name: "list_notes",
        arguments: {
            limit: 381,
            includePreview: true
        }
    },
    jsonrpc: "2.0",
    id: 1
};

server.stdin.write(JSON.stringify(request) + '\n');
