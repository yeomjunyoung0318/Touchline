'use strict';

const fs = require('node:fs');
const path = require('node:path');
const D = require('../src/career-development.js');

const codes = ['default', 'explosive-start', 'meteoric-peak', 'consistent-performer', 'complete-technician', 'late-bloomer'];
const playerId = value => /^[1-9]\d{0,14}$/.test(String(value ?? '')) ? 'fcradar-fc27-' + value : null;

function readFile(file) {
  try {
    if (fs.statSync(file).size > 8 * 1024 * 1024) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    return data?.game === 'FC27' && data.version === 1 ? data : null;
  } catch {
    return null;
  }
}

function loadGrowthProfiles(directory) {
  const result = new Map();
  const roster = readFile(path.join(directory, 'fc27-growth-profiles.json'));
  if (roster?.provider === 'ea-base') {
    codes.forEach((type, index) => {
      const ids = roster.groups?.[index + 1];
      if (!Array.isArray(ids)) return;
      const reference = Object.freeze({ type, source: 'ea-base' });
      for (const id of ids) {
        const key = playerId(id);
        if (key) result.set(key, reference);
      }
    });
  }
  // An approved CMTracker export can add coverage or supersede the base-roster value by EA player ID.
  const exportData = readFile(path.join(directory, 'cmtracker-growth-profiles.json'));
  if (exportData?.provider === 'cmtracker' && Array.isArray(exportData.players)) {
    for (const row of exportData.players) {
      const key = playerId(row?.playerId);
      const reference = D.reference({ type: row?.growthProfile, source: 'cmtracker', url: row?.url, snapshot: row?.snapshot ?? exportData.snapshot });
      if (!key || !reference) continue;
      if (reference.url && new URL(reference.url).pathname.match(/\/players\/\d{8}\/(\d+)/)?.[1] !== String(row.playerId)) delete reference.url;
      result.set(key, Object.freeze(reference));
    }
  }
  return result;
}

module.exports = { loadGrowthProfiles };
