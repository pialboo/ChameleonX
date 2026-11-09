const crypto = require('crypto');

/**
 * Coherent Real-World Hardware Archetypes (真实硬體整機模板庫)
 * Bundles GPU + CPU Cores + DeviceMemory (W3C max = 8) + Screen Resolutions together
 * so we never generate impossible combinations like RTX 3070 + 4GB RAM + 1366x768.
 */
const HARDWARE_ARCHETYPES = {
  windows: [
    // Tier 1: High-end Gaming / Creator Desktop
    {
      tier: '高階電競桌機',
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpuOptions: [12, 16],
      memoryOptions: [8],
      resolutions: ['2560x1440', '1920x1080'],
    },
    {
      tier: '高階電競桌機',
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpuOptions: [8, 12, 16],
      memoryOptions: [8],
      resolutions: ['2560x1440', '1920x1080'],
    },
    {
      tier: '高階電競桌機',
      vendor: 'Google Inc. (AMD)',
      renderer: 'ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpuOptions: [12, 16],
      memoryOptions: [8],
      resolutions: ['2560x1440', '1920x1080'],
    },
    // Tier 2: Mainstream Gaming Desktop / Laptop
    {
      tier: '主流獨立顯卡主機',
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpuOptions: [8, 12, 16],
      memoryOptions: [8],
      resolutions: ['1920x1080', '2560x1440'],
    },
    {
      tier: '主流獨立顯卡主機',
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 2060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpuOptions: [8, 12],
      memoryOptions: [8],
      resolutions: ['1920x1080'],
    },
    {
      tier: '主流獨立顯卡主機',
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpuOptions: [6, 8, 12],
      memoryOptions: [8],
      resolutions: ['1920x1080'],
    },
    {
      tier: '主流獨立顯卡主機',
      vendor: 'Google Inc. (AMD)',
      renderer: 'ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpuOptions: [8, 12],
      memoryOptions: [8],
      resolutions: ['1920x1080'],
    },
    // Tier 3: Modern Business / Ultrabook Laptop (Intel Iris Xe / UHD 770)
    {
      tier: '現代商務筆電',
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpuOptions: [8, 12],
      memoryOptions: [8],
      resolutions: ['1920x1080', '1536x864'],
    },
    {
      tier: '現代商用桌機',
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpuOptions: [8, 12],
      memoryOptions: [8],
      resolutions: ['1920x1080'],
    },
    // Tier 4: Entry-level Office Laptop (only tier where 4GB or 1366x768 is realistic)
    {
      tier: '入門文書筆電',
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      cpuOptions: [4, 8],
      memoryOptions: [4, 8],
      resolutions: ['1920x1080', '1536x864', '1366x768'],
    },
  ],
  macos: [
    {
      tier: 'MacBook Air M2',
      vendor: 'Google Inc. (Apple)',
      renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
      cpuOptions: [8],
      memoryOptions: [8],
      resolutions: ['1440x900', '1680x1050'],
    },
    {
      tier: 'MacBook Air M1',
      vendor: 'Google Inc. (Apple)',
      renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
      cpuOptions: [8],
      memoryOptions: [8],
      resolutions: ['1440x900', '1680x1050'],
    },
    {
      tier: 'MacBook Pro 14/16 M3 Pro',
      vendor: 'Google Inc. (Apple)',
      renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)',
      cpuOptions: [12],
      memoryOptions: [8],
      resolutions: ['1512x982', '1728x1117'],
    },
    {
      tier: 'MacBook Pro 14/16 M2 Pro',
      vendor: 'Google Inc. (Apple)',
      renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)',
      cpuOptions: [10, 12],
      memoryOptions: [8],
      resolutions: ['1512x982', '1728x1117'],
    },
    {
      tier: 'Mac Studio / Pro M2 Max',
      vendor: 'Google Inc. (Apple)',
      renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Max, Unspecified Version)',
      cpuOptions: [12],
      memoryOptions: [8],
      resolutions: ['2560x1440', '1728x1117'],
    },
  ],
  linux: [
    {
      tier: 'Linux 開發工作站',
      vendor: 'Google Inc. (NVIDIA Corporation)',
      renderer: 'ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3060/PCIe/SSE2, OpenGL 4.6.0)',
      cpuOptions: [8, 12, 16],
      memoryOptions: [8],
      resolutions: ['1920x1080', '2560x1440'],
    },
    {
      tier: 'Linux 商務筆電',
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)',
      cpuOptions: [8],
      memoryOptions: [8],
      resolutions: ['1920x1080'],
    },
    {
      tier: 'Linux AMD 工作站',
      vendor: 'Google Inc. (AMD)',
      renderer: 'ANGLE (AMD, AMD Radeon RX 6600 (navi23, LLVM 15.0.7, DRM 3.49), OpenGL 4.6)',
      cpuOptions: [8, 12],
      memoryOptions: [8],
      resolutions: ['1920x1080', '2560x1440'],
    },
  ],
};

const CHROME_VERSIONS = [
  '134.0.6998.89',
  '133.0.6943.142',
  '132.0.6834.160',
  '131.0.6778.205',
];

function seededRandom(seed) {
  let s = Number(seed) || 12345678;
  return function () {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function generateSeed() {
  return String(Math.floor(100000000 + Math.random() * 900000000));
}

function buildUserAgent(os = 'windows', chromeVersion = '134.0.6998.89', brand = 'Chrome') {
  let osToken = 'Windows NT 10.0; Win64; x64';
  if (os === 'macos') {
    osToken = 'Macintosh; Intel Mac OS X 10_15_7';
  } else if (os === 'linux') {
    osToken = 'X11; Linux x86_64';
  }
  let suffix = '';
  if (brand === 'Edge') {
    suffix = ` Edg/${chromeVersion}`;
  } else if (brand === 'Opera') {
    suffix = ` OPR/116.0.0.0`;
  }
  return `Mozilla/5.0 (${osToken}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36${suffix}`;
}

function generateFingerprint(options = {}) {
  const os = ['windows', 'macos', 'linux'].includes(options.os) ? options.os : 'windows';
  const seed = options.seed || generateSeed();
  const brand = options.brand || 'Chrome';
  const rng = seededRandom(seed);

  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const chromeVersion = options.chromeVersion || pick(CHROME_VERSIONS);

  // Pick a coherent hardware archetype first!
  const archetypes = HARDWARE_ARCHETYPES[os] || HARDWARE_ARCHETYPES.windows;
  const archetype = pick(archetypes);

  const cpuCores = options.cpuCores || pick(archetype.cpuOptions);
  const memory = options.memory || pick(archetype.memoryOptions);
  const resolution = options.resolution || pick(archetype.resolutions);

  let platform = 'Win32';
  if (os === 'macos') platform = 'MacIntel';
  if (os === 'linux') platform = 'Linux x86_64';

  const macAddress = Array.from({ length: 6 }, () =>
    Math.floor(rng() * 256)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()
  ).join(':');

  const deviceName =
    os === 'windows'
      ? `DESKTOP-${crypto.createHash('md5').update(String(seed)).digest('hex').slice(0, 7).toUpperCase()}`
      : os === 'macos'
      ? `MacBook-Pro-${String(seed).slice(0, 4)}.local`
      : `ubuntu-node-${String(seed).slice(0, 4)}`;

  return {
    seed: String(seed),
    os,
    platform,
    brand,
    chromeVersion,
    userAgent: options.userAgent || buildUserAgent(os, chromeVersion, brand),
    webrtc: options.webrtc || 'altered',
    canvas: options.canvas || 'noise',
    webgl: options.webgl || 'noise',
    webglMetadata: options.webglMetadata || 'custom',
    webglVendor: options.webglVendor || archetype.vendor,
    webglRenderer: options.webglRenderer || archetype.renderer,
    audio: options.audio || 'noise',
    clientRects: options.clientRects || 'noise',
    timezoneMode: options.timezoneMode || 'auto',
    timezone: options.timezone || 'Asia/Taipei',
    localeMode: options.localeMode || 'auto',
    locale: options.locale || 'zh-TW',
    languages: options.languages || ['zh-TW', 'zh', 'en-US', 'en'],
    geolocationMode: options.geolocationMode || 'auto',
    latitude: options.latitude ?? 25.0330,
    longitude: options.longitude ?? 121.5654,
    cpuCores: Number(cpuCores),
    memory: Number(memory),
    resolution,
    fontsMode: options.fontsMode || 'noise',
    doNotTrack: options.doNotTrack ?? false,
    macAddress: options.macAddress || macAddress,
    deviceName: options.deviceName || deviceName,
    portScanProtection: options.portScanProtection ?? true,
  };
}

module.exports = {
  generateSeed,
  generateFingerprint,
  buildUserAgent,
  HARDWARE_ARCHETYPES,
  CHROME_VERSIONS,
};
