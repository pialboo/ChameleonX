const { spawn } = require('child_process');
const path = require('path');

const electronBin = path.join(
  __dirname,
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron'
);

const child = spawn(electronBin, ['.'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
