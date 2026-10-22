const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { store, PROFILES_DIR, EXTENSIONS_DIR, BACKUPS_DIR } = require('./store.cjs');

const EXCLUDE_DIRS = new Set([
  'cache',
  'cache_data',
  'code cache',
  'dawncache',
  'gpucache',
  'grshadercache',
  'shadercache',
  'blob_storage',
  'crashpad',
  'optimization_guide_hint_cache_store',
  'optimization_guide_model_store',
  'component_crx_cache',
  'wasmttsengine',
  'safe browsing',
  'cachestorage',
  'scriptcache',
  '_profile_core_ext',
  'certificate revocation',
  'recovery',
  'subresource filter',
  'media foundation widevine cdm',
]);

const EXCLUDE_FILES = new Set([
  'lockfile',
  'singletonlock',
  'singletoncookie',
  'singletonsocket',
]);

function shouldExclude(name, isDirectory) {
  const lower = name.toLowerCase();
  if (isDirectory) {
    if (EXCLUDE_DIRS.has(lower)) return true;
    if (lower.startsWith('cache_')) return true;
  } else {
    if (EXCLUDE_FILES.has(lower)) return true;
    if (
      lower.endsWith('.tmp') ||
      lower.endsWith('.dmp') ||
      lower.endsWith('.lock') ||
      lower.endsWith('.tflite') ||
      lower.endsWith('.wasm')
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively add directory files into AdmZip archive with path filtering
 */
function addDirectoryFilesToZip(zip, baseDiskDir, zipPrefix) {
  if (!fs.existsSync(baseDiskDir)) return;

  function traverse(currentDir, currentZipPrefix) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const ent of entries) {
      if (shouldExclude(ent.name, ent.isDirectory())) {
        continue;
      }
      const fullPath = path.join(currentDir, ent.name);
      const zipPath = currentZipPrefix ? `${currentZipPrefix}/${ent.name}` : ent.name;

      if (ent.isDirectory()) {
        traverse(fullPath, zipPath);
      } else if (ent.isFile()) {
        try {
          const content = fs.readFileSync(fullPath);
          zip.addFile(zipPath.replace(/\\/g, '/'), content);
        } catch (e) {
          // File may be locked by another process or unreadable, ignore gracefully
        }
      }
    }
  }

  traverse(baseDiskDir, zipPrefix);
}

/**
 * Create a full or custom backup ZIP archive
 */
async function createBackup(options = {}) {
  const state = store.getState();
  const {
    profileIds = null, // null/empty means all
    includeProfileSettings = true,
    includeProfileData = true,
    includeProxies = true,
    includeExtensions = true,
    includeExtensionFiles = true,
    includeBookmarks = true,
    includeFoldersAndTags = true,
    includeSettings = true,
    targetFilePath = null,
    saveAsSnapshot = false,
    snapshotNote = '',
  } = options;

  const zip = new AdmZip();
  const timestamp = new Date().toISOString();

  // Filter profiles
  let selectedProfiles = state.profiles || [];
  if (Array.isArray(profileIds) && profileIds.length > 0) {
    const idSet = new Set(profileIds);
    selectedProfiles = selectedProfiles.filter((p) => idSet.has(p.id));
  }

  const partialDb = {
    profiles: includeProfileSettings ? selectedProfiles : [],
    proxies: includeProxies ? state.proxies || [] : [],
    extensions: includeExtensions ? state.extensions || [] : [],
    bookmarks: includeBookmarks ? state.bookmarks || [] : [],
    folders: includeFoldersAndTags ? state.folders || [] : [],
    statuses: includeFoldersAndTags ? state.statuses || [] : [],
    tags: includeFoldersAndTags ? state.tags || [] : [],
    settings: includeSettings ? state.settings || {} : null,
  };

  const profilesSummary = [];
  let profileDataCount = 0;

  // Add Profile Browser Data if requested
  if (includeProfileData) {
    for (const prof of selectedProfiles) {
      const profDir = path.join(PROFILES_DIR, prof.id);
      let hasData = false;
      if (fs.existsSync(profDir)) {
        hasData = true;
        profileDataCount++;
        addDirectoryFilesToZip(zip, profDir, `profiles/${prof.id}`);
      }
      profilesSummary.push({
        id: prof.id,
        serialNumber: prof.serialNumber,
        name: prof.name,
        hasData,
      });
    }
  } else {
    for (const prof of selectedProfiles) {
      profilesSummary.push({
        id: prof.id,
        serialNumber: prof.serialNumber,
        name: prof.name,
        hasData: false,
      });
    }
  }

  // Add Extensions files if requested
  let extFilesCount = 0;
  if (includeExtensions && includeExtensionFiles) {
    for (const ext of state.extensions || []) {
      if (ext.path && fs.existsSync(ext.path)) {
        extFilesCount++;
        addDirectoryFilesToZip(zip, ext.path, `extensions/${ext.id}`);
      }
    }
  }

  // Build manifest
  const manifest = {
    version: 1,
    app: 'ChameleonX',
    createdAt: timestamp,
    note: snapshotNote || (saveAsSnapshot ? '本機快照備份' : '自訂備份'),
    options: {
      includeProfileSettings,
      includeProfileData,
      includeProxies,
      includeExtensions,
      includeExtensionFiles,
      includeBookmarks,
      includeFoldersAndTags,
      includeSettings,
    },
    counts: {
      profiles: partialDb.profiles.length,
      profileData: profileDataCount,
      proxies: partialDb.proxies.length,
      extensions: partialDb.extensions.length,
      extensionFiles: extFilesCount,
      bookmarks: partialDb.bookmarks.length,
      folders: partialDb.folders.length,
      statuses: partialDb.statuses.length,
      tags: partialDb.tags.length,
      hasSettings: Boolean(includeSettings && partialDb.settings),
    },
    profilesSummary,
  };

  // Add manifest and partial DB to zip
  zip.addFile('backup_manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
  zip.addFile('data/db_partial.json', Buffer.from(JSON.stringify(partialDb, null, 2), 'utf8'));

  const dateStr = timestamp.replace(/[-:]/g, '').slice(0, 15).replace('T', '_');
  const filename = `ChameleonX_Backup_${dateStr}.zip`;

  let finalPath = targetFilePath;
  if (saveAsSnapshot) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    finalPath = path.join(BACKUPS_DIR, filename);
  }

  let zipBuffer = null;
  if (finalPath) {
    fs.mkdirSync(path.dirname(finalPath), { recursive: true });
    zip.writeZip(finalPath);
    const stats = fs.statSync(finalPath);
    return {
      success: true,
      filename,
      filePath: finalPath,
      size: stats.size,
      manifest,
    };
  } else {
    zipBuffer = zip.toBuffer();
    return {
      success: true,
      filename,
      filePath: null,
      size: zipBuffer.length,
      manifest,
      zipBuffer,
    };
  }
}

/**
 * Inspect a backup ZIP file or Buffer and return its manifest and contained details
 */
function inspectBackup(filePathOrBuffer) {
  let zip;
  try {
    zip = new AdmZip(filePathOrBuffer);
  } catch (err) {
    throw new Error('無法讀取 ZIP 壓縮檔，檔案可能已損壞或格式不符：' + err.message);
  }

  const manifestEntry = zip.getEntry('backup_manifest.json');
  if (!manifestEntry) {
    throw new Error('此 ZIP 檔案中缺少 backup_manifest.json，不是有效的 ChameleonX 備份檔。');
  }

  let manifest;
  try {
    manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  } catch (e) {
    throw new Error('解析備份資訊 (backup_manifest.json) 失敗');
  }

  let partialDb = null;
  const dbEntry = zip.getEntry('data/db_partial.json');
  if (dbEntry) {
    try {
      partialDb = JSON.parse(dbEntry.getData().toString('utf8'));
    } catch (e) {}
  }

  return {
    valid: true,
    manifest,
    preview: {
      profiles: partialDb?.profiles || [],
      proxies: partialDb?.proxies || [],
      extensions: partialDb?.extensions || [],
      bookmarks: partialDb?.bookmarks || [],
      folders: partialDb?.folders || [],
      statuses: partialDb?.statuses || [],
      tags: partialDb?.tags || [],
      settings: partialDb?.settings || null,
    },
  };
}

/**
 * Restore data from a backup ZIP file or Buffer
 */
async function restoreBackup(filePathOrBuffer, restoreOptions = {}, stopProfileFn = null) {
  const {
    selectedProfileIds = null, // null means all in backup
    restoreProfileSettings = true,
    restoreProfileData = true,
    restoreProxies = true,
    restoreExtensions = true,
    restoreBookmarks = true,
    restoreFoldersAndTags = true,
    restoreSettings = false,
    conflictStrategy = 'merge_overwrite', // 'merge_overwrite' | 'merge_skip' | 'clean_restore'
  } = restoreOptions;

  const inspected = inspectBackup(filePathOrBuffer);
  const { manifest, preview } = inspected;
  const zip = new AdmZip(filePathOrBuffer);

  const state = store.getState();
  const restoredResult = {
    profilesCount: 0,
    profileDataCount: 0,
    proxiesCount: 0,
    extensionsCount: 0,
    bookmarksCount: 0,
    foldersCount: 0,
    statusesCount: 0,
    tagsCount: 0,
    settingsRestored: false,
  };

  // Determine which profiles to restore
  let profilesToRestore = preview.profiles || [];
  if (Array.isArray(selectedProfileIds) && selectedProfileIds.length > 0) {
    const idSet = new Set(selectedProfileIds);
    profilesToRestore = profilesToRestore.filter((p) => idSet.has(p.id));
  }

  // Stop any currently running profiles that will be modified
  if (typeof stopProfileFn === 'function') {
    for (const p of profilesToRestore) {
      try {
        await stopProfileFn(p.id);
      } catch (e) {}
    }
  }

  // 1. Clean restore preparation if requested
  if (conflictStrategy === 'clean_restore') {
    if (restoreProfileSettings) state.profiles = [];
    if (restoreProxies) state.proxies = [];
    if (restoreExtensions) state.extensions = [];
    if (restoreBookmarks) state.bookmarks = [];
    if (restoreFoldersAndTags) {
      state.folders = [];
      state.statuses = [];
      state.tags = [];
    }
  }

  // 2. Extract profile browser data files
  if (restoreProfileData) {
    const targetProfileIds = new Set(profilesToRestore.map((p) => p.id));
    const entries = zip.getEntries();

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryName = entry.entryName.replace(/\\/g, '/');

      // Check if entry starts with profiles/<id>/
      const match = entryName.match(/^profiles\/([^\/]+)\/(.*)$/);
      if (match) {
        const profId = match[1];
        const relativeFilePath = match[2];

        if (targetProfileIds.has(profId)) {
          const destDir = path.join(PROFILES_DIR, profId);
          const destFile = path.resolve(destDir, relativeFilePath);
          if (destFile.startsWith(path.resolve(destDir))) {
            fs.mkdirSync(path.dirname(destFile), { recursive: true });
            fs.writeFileSync(destFile, entry.getData());
          }
        }
      }
    }
    restoredResult.profileDataCount = targetProfileIds.size;
  }

  // 3. Extract extensions files and update paths
  const extractedExtDirMap = new Map(); // extId -> local dir
  if (restoreExtensions) {
    const entries = zip.getEntries();
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryName = entry.entryName.replace(/\\/g, '/');

      const match = entryName.match(/^extensions\/([^\/]+)\/(.*)$/);
      if (match) {
        const extId = match[1];
        const relativeFilePath = match[2];
        const destDir = path.join(EXTENSIONS_DIR, extId);
        const destFile = path.resolve(destDir, relativeFilePath);
        if (destFile.startsWith(path.resolve(destDir))) {
          fs.mkdirSync(path.dirname(destFile), { recursive: true });
          fs.writeFileSync(destFile, entry.getData());
          extractedExtDirMap.set(extId, destDir);
        }
      }
    }
  }

  // 4. Restore Profiles metadata
  if (restoreProfileSettings && profilesToRestore.length > 0) {
    let currentProfiles = state.profiles || [];
    let nextSerial = store.getNextSerialNumber();

    for (const prof of profilesToRestore) {
      const existingIdx = currentProfiles.findIndex((p) => p.id === prof.id);

      if (existingIdx !== -1) {
        if (conflictStrategy === 'merge_skip') {
          continue;
        } else {
          // merge_overwrite
          currentProfiles[existingIdx] = { ...prof };
          restoredResult.profilesCount++;
        }
      } else {
        // New profile
        const profToAdd = { ...prof };
        // Ensure serial number does not collide
        if (!profToAdd.serialNumber || currentProfiles.some((p) => p.serialNumber === profToAdd.serialNumber)) {
          profToAdd.serialNumber = nextSerial++;
        }
        currentProfiles.push(profToAdd);
        restoredResult.profilesCount++;
      }
    }
    state.profiles = currentProfiles;
  }

  // 5. Restore Proxies
  if (restoreProxies && Array.isArray(preview.proxies)) {
    let currentProxies = state.proxies || [];
    for (const px of preview.proxies) {
      const idx = currentProxies.findIndex((p) => p.id === px.id);
      if (idx !== -1) {
        if (conflictStrategy === 'merge_skip') continue;
        currentProxies[idx] = { ...px };
        restoredResult.proxiesCount++;
      } else {
        currentProxies.push({ ...px });
        restoredResult.proxiesCount++;
      }
    }
    state.proxies = currentProxies;
  }

  // 6. Restore Extensions metadata
  if (restoreExtensions && Array.isArray(preview.extensions)) {
    let currentExtensions = state.extensions || [];
    for (const ext of preview.extensions) {
      const updatedExt = { ...ext };
      // If extension files were extracted into EXTENSIONS_DIR, point to local path
      if (extractedExtDirMap.has(ext.id)) {
        updatedExt.path = extractedExtDirMap.get(ext.id);
      }
      const idx = currentExtensions.findIndex((e) => e.id === ext.id);
      if (idx !== -1) {
        if (conflictStrategy === 'merge_skip') continue;
        currentExtensions[idx] = updatedExt;
        restoredResult.extensionsCount++;
      } else {
        currentExtensions.push(updatedExt);
        restoredResult.extensionsCount++;
      }
    }
    state.extensions = currentExtensions;
  }

  // 7. Restore Bookmarks
  if (restoreBookmarks && Array.isArray(preview.bookmarks)) {
    let currentBookmarks = state.bookmarks || [];
    for (const bm of preview.bookmarks) {
      const idx = currentBookmarks.findIndex((b) => b.id === bm.id);
      if (idx !== -1) {
        if (conflictStrategy === 'merge_skip') continue;
        currentBookmarks[idx] = { ...bm };
        restoredResult.bookmarksCount++;
      } else {
        currentBookmarks.push({ ...bm });
        restoredResult.bookmarksCount++;
      }
    }
    state.bookmarks = currentBookmarks;
  }

  // 8. Restore Folders, Statuses & Tags
  if (restoreFoldersAndTags) {
    if (Array.isArray(preview.folders)) {
      let currentFolders = state.folders || [];
      for (const f of preview.folders) {
        if (!currentFolders.some((x) => x.id === f.id)) {
          currentFolders.push({ ...f });
          restoredResult.foldersCount++;
        }
      }
      state.folders = currentFolders;
    }

    if (Array.isArray(preview.statuses)) {
      let currentStatuses = state.statuses || [];
      for (const s of preview.statuses) {
        if (!currentStatuses.some((x) => x.id === s.id)) {
          currentStatuses.push({ ...s });
          restoredResult.statusesCount++;
        }
      }
      state.statuses = currentStatuses;
    }

    if (Array.isArray(preview.tags)) {
      const tagSet = new Set(state.tags || []);
      let added = 0;
      for (const t of preview.tags) {
        if (!tagSet.has(t)) {
          tagSet.add(t);
          added++;
        }
      }
      state.tags = Array.from(tagSet);
      restoredResult.tagsCount = added;
    }
  }

  // 9. Restore Settings
  if (restoreSettings && preview.settings) {
    state.settings = { ...state.settings, ...preview.settings };
    restoredResult.settingsRestored = true;
  }

  // Save the modified database
  store.save();

  return {
    success: true,
    manifest,
    restored: restoredResult,
  };
}

/**
 * List all saved snapshots in BACKUPS_DIR
 */
function listSnapshots() {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const files = fs.readdirSync(BACKUPS_DIR);
  const snapshots = [];

  for (const file of files) {
    if (!file.toLowerCase().endsWith('.zip')) continue;
    const fullPath = path.join(BACKUPS_DIR, file);
    try {
      const stat = fs.statSync(fullPath);
      const zip = new AdmZip(fullPath);
      const manifestEntry = zip.getEntry('backup_manifest.json');
      let manifest = null;
      if (manifestEntry) {
        manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
      }
      snapshots.push({
        filename: file,
        filePath: fullPath,
        size: stat.size,
        createdAt: manifest?.createdAt || stat.birthtime.toISOString(),
        manifest: manifest || null,
      });
    } catch (e) {
      // Invalid zip or corrupt, continue
    }
  }

  // Sort by date descending
  snapshots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return snapshots;
}

/**
 * Delete a snapshot from BACKUPS_DIR
 */
function deleteSnapshot(filename) {
  // Sanitize filename
  const safeName = path.basename(filename);
  const fullPath = path.join(BACKUPS_DIR, safeName);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    return true;
  }
  return false;
}

module.exports = {
  createBackup,
  inspectBackup,
  restoreBackup,
  listSnapshots,
  deleteSnapshot,
  BACKUPS_DIR,
};
