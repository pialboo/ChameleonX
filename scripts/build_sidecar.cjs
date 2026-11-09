const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('[Sidecar Builder] Starting ChameleonX Sidecar binary build...');

const projectRoot = path.resolve(__dirname, '..');
const distBackend = path.join(projectRoot, 'dist-backend');
const tauriBinariesDir = path.join(projectRoot, 'src-tauri', 'binaries');
const tauriResourcesDir = path.join(projectRoot, 'src-tauri', 'resources');

// Ensure output directories exist
fs.mkdirSync(distBackend, { recursive: true });
fs.mkdirSync(tauriBinariesDir, { recursive: true });
fs.mkdirSync(tauriResourcesDir, { recursive: true });

// Step 1: Copy bringToTop.ps1 to resources
const bringToTopSrc = path.join(projectRoot, 'backend', 'bringToTop.ps1');
if (fs.existsSync(bringToTopSrc)) {
  fs.copyFileSync(bringToTopSrc, path.join(tauriResourcesDir, 'bringToTop.ps1'));
  fs.copyFileSync(bringToTopSrc, path.join(distBackend, 'bringToTop.ps1'));
  console.log('[Sidecar Builder] Copied bringToTop.ps1 to resources and dist-backend.');
}

// Step 2: Bundle backend JavaScript into single file
console.log('[Sidecar Builder] Bundling backend with esbuild...');
const bundleOut = path.join(distBackend, 'bundle.cjs');
const entryPoint = path.join(projectRoot, 'backend', 'standalone.cjs');

execSync(
  `npx esbuild "${entryPoint}" --bundle --platform=node --target=node22 --outfile="${bundleOut}"`,
  { cwd: projectRoot, stdio: 'inherit' }
);

// Step 3: Write sea-config.json
const seaConfigPath = path.join(distBackend, 'sea-config.json');
const seaBlobPath = path.join(distBackend, 'sea-prep.blob');
fs.writeFileSync(
  seaConfigPath,
  JSON.stringify(
    {
      main: bundleOut,
      output: seaBlobPath,
      disableExperimentalSEAWarning: true,
    },
    null,
    2
  )
);

// Step 4: Generate SEA prep blob
console.log('[Sidecar Builder] Generating SEA preparation blob...');
execSync(`node --experimental-sea-config "${seaConfigPath}"`, {
  cwd: projectRoot,
  stdio: 'inherit',
});

// Step 5: Copy host node.exe to target binary
const targetTriple = 'x86_64-pc-windows-msvc';
const targetExeName = `chameleon-backend-${targetTriple}.exe`;
const targetExePath = path.join(tauriBinariesDir, targetExeName);
const localExePath = path.join(distBackend, 'chameleon-backend.exe');

console.log(`[Sidecar Builder] Copying host node executable to ${targetExeName}...`);
fs.copyFileSync(process.execPath, targetExePath);

// Step 6: Inject SEA blob into targetExePath using postject
console.log('[Sidecar Builder] Injecting SEA blob via postject...');
execSync(
  `npx postject "${targetExePath}" NODE_SEA_BLOB "${seaBlobPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`,
  { cwd: projectRoot, stdio: 'inherit' }
);

// Also copy to localExePath for standalone testing
fs.copyFileSync(targetExePath, localExePath);

console.log('[Sidecar Builder] Successfully created standalone sidecar binary:');
console.log(`  -> ${targetExePath}`);
console.log(`  -> ${localExePath}`);
