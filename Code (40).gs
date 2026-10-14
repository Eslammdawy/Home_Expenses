/**
 * Home Budget Tracker - Google Apps Script backend
 *
 * Setup:
 *  1. Open your Google Sheet > Extensions > Apps Script, paste this file as Code.gs.
 *  2. Run setup() once (creates missing tabs + headers, formats columns).
 *  3. (Recommended) Project Settings > Script properties > add API_TOKEN = a long random string.
 *  4. Deploy > New deployment > type "Web app"
 *       Execute as: Me
 *       Who has access: Anyone
 *     Copy the Web app URL (ends with /exec) into your React app's env file.
 *  5. After changing code, use Deploy > Manage deployments > Edit > New version.
 *
 * Read:   GET  <URL>?action=transactions&month=2026-10&token=...
 *         GET  <URL>?action=categories | settings | all
 * Write:  POST <URL>  body (JSON as text/plain): { "token": "...", "action": "addTransaction", "data": {...} }
 *         actions: addTransaction, updateTransaction, deleteTransaction,
 *                  addCategory, updateCategory, deleteCategory, setSetting
 */

var TAB = { TX: 'Transactions', CAT: 'Categories', SET: 'Settings' };
var TX_HEADERS = ['id', 'date', 'type', 'category', 'description', 'amount', 'payment_method', 'notes', 'month', 'created_at'];
var CAT_HEADERS = ['name', 'type', 'monthly_budget', 'color', 'icon'];
var SET_HEADERS = ['key', 'value'];
var TZ = Session.getScriptTimeZone();

/* ---------- One-time setup ---------- */

function setup() {
  ensureTab_(TAB.TX, TX_HEADERS);
  ensureTab_(TAB.CAT, CAT_HEADERS);
  ensureTab_(TAB.SET, SET_HEADERS);

  // Keep date-like columns as plain text so Sheets never reformats them.
  var tx = sheet_(TAB.TX);
  [2, 9, 10].forEach(function (col) {
    tx.getRange(2, col, tx.getMaxRows() - 1, 1).setNumberFormat('@');
  });
}

function ensureTab_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

/* ---------- Cache helpers ---------- */

function getCacheVer_() {
  try {
    var c = CacheService.getScriptCache();
    return c.get('hbt_ver') || '1';
  } catch (e) {
    return '1';
  }
}

function invalidateCache_() {
  try {
    var c = CacheService.getScriptCache();
    var cur = Number(c.get('hbt_ver') || '1');
    c.put('hbt_ver', String(cur + 1), 21600);
  } catch (e) {}
}

function getCachedJson_(key) {
  try {
    var c = CacheService.getScriptCache();
    var ver = getCacheVer_();
    return c.get('hbt_' + ver + '_' + key);
  } catch (e) {
    return null;
  }
}

function putCachedJson_(key, jsonStr) {
  if (!jsonStr || jsonStr.length >= 95000) return;
  try {
    var c = CacheService.getScriptCache();
    var ver = getCacheVer_();
    c.put('hbt_' + ver + '_' + key, jsonStr, 1800);
  } catch (e) {}
}

/* ---------- HTTP entry points ---------- */

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    checkToken_(p.token);
    var action = p.action || 'all';

    var cacheKey = action + (p.month ? '_' + p.month : '');
    var cached = getCachedJson_(cacheKey);
    if (cached) {
      return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
    }

    var resultData;
    if (action === 'transactions') resultData = getTransactions_(p.month);
    else if (action === 'categories') resultData = readTable_(TAB.CAT, 'name');
    else if (action === 'settings') resultData = getSettings_();
    else if (action === 'all') {
      resultData = {
        transactions: getTransactions_(p.month),
        categories: readTable_(TAB.CAT, 'name'),
        settings: getSettings_()
      };
    } else {
      throw new Error('Unknown action: ' + action);
    }

    var jsonStr = JSON.stringify({ ok: true, data: resultData });
    putCachedJson_(cacheKey, jsonStr);
    return ContentService.createTextOutput(jsonStr).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    checkToken_(body.token);
    var d = body.data || {};

    var res;
    switch (body.action) {
      case 'addTransaction':    res = addTransaction_(d); break;
      case 'updateTransaction': res = updateTransaction_(d); break;
      case 'deleteTransaction': res = deleteByKey_(TAB.TX, 'id', d.id); break;
      case 'addCategory':       res = addCategory_(d); break;
      case 'updateCategory':    res = updateCategory_(d); break;
      case 'deleteCategory':    res = deleteByKey_(TAB.CAT, 'name', d.name); break;
      case 'setSetting':        res = setSetting_(d); break;
      default: throw new Error('Unknown action: ' + body.action);
    }

    invalidateCache_();
    return json_({ ok: true, data: res });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ---------- Transactions ---------- */

function getTransactions_(month) {
  var rows = readTable_(TAB.TX, 'id');
  if (month) rows = rows.filter(function (r) { return r.month === month; });
  return rows.map(stripMeta_);
}

function validateTransaction_(d) {
  if (['Income', 'Expense'].indexOf(d.type) === -1) throw new Error('type must be Income or Expense');
  var amount = Number(d.amount);
  if (!isFinite(amount) || amount <= 0) throw new Error('amount must be a positive number');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date))) throw new Error('date must be YYYY-MM-DD');
  var cats = readTable_(TAB.CAT, 'name');
  var exists = cats.some(function (c) { return c.name === d.category; });
  if (!exists) throw new Error('Unknown category: ' + d.category);
  return amount;
}

function addTransaction_(d) {
  var amount = validateTransaction_(d);
  var row = {
    id: Utilities.getUuid(),
    date: d.date,
    type: d.type,
    category: d.category,
    description: d.description || '',
    amount: amount,
    payment_method: d.payment_method || '',
    notes: d.notes || '',
    month: String(d.date).slice(0, 7),
    created_at: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss")
  };
  sheet_(TAB.TX).appendRow(TX_HEADERS.map(function (h) { return row[h]; }));
  return row;
}

function updateTransaction_(d) {
  if (!d.id) throw new Error('id is required');
  var existing = findRow_(TAB.TX, 'id', d.id);
  if (!existing) throw new Error('Transaction not found');
  var merged = {};
  TX_HEADERS.forEach(function (h) { merged[h] = d[h] !== undefined ? d[h] : existing.obj[h]; });
  merged.amount = validateTransaction_(merged);
  merged.month = String(merged.date).slice(0, 7);
  sheet_(TAB.TX)
    .getRange(existing.row, 1, 1, TX_HEADERS.length)
    .setValues([TX_HEADERS.map(function (h) { return merged[h]; })]);
  return merged;
}

/* ---------- Categories ---------- */

function validateCategory_(d) {
  if (!d.name) throw new Error('name is required');
  if (['Income', 'Expense'].indexOf(d.type) === -1) throw new Error('type must be Income or Expense');
  var budget = Number(d.monthly_budget || 0);
  if (!isFinite(budget) || budget < 0) throw new Error('monthly_budget must be >= 0');
  return budget;
}

function addCategory_(d) {
  var budget = validateCategory_(d);
  if (findRow_(TAB.CAT, 'name', d.name)) throw new Error('Category already exists');
  var row = { name: d.name, type: d.type, monthly_budget: budget, color: d.color || '#6b7280', icon: d.icon || '📦' };
  sheet_(TAB.CAT).appendRow(CAT_HEADERS.map(function (h) { return row[h]; }));
  return row;
}

function updateCategory_(d) {
  var existing = findRow_(TAB.CAT, 'name', d.name);
  if (!existing) throw new Error('Category not found');
  var merged = {};
  CAT_HEADERS.forEach(function (h) { merged[h] = d[h] !== undefined ? d[h] : existing.obj[h]; });
  merged.monthly_budget = validateCategory_(merged);
  sheet_(TAB.CAT)
    .getRange(existing.row, 1, 1, CAT_HEADERS.length)
    .setValues([CAT_HEADERS.map(function (h) { return merged[h]; })]);
  return merged;
}

/* ---------- Settings ---------- */

function getSettings_() {
  var out = {};
  readTable_(TAB.SET, 'key').forEach(function (r) { out[r.key] = r.value; });
  return out;
}

function setSetting_(d) {
  if (!d.key) throw new Error('key is required');
  var existing = findRow_(TAB.SET, 'key', d.key);
  if (existing) {
    sheet_(TAB.SET).getRange(existing.row, 2).setValue(d.value);
  } else {
    sheet_(TAB.SET).appendRow([d.key, d.value]);
  }
  return { key: d.key, value: d.value };
}

/* ---------- Generic helpers ---------- */

var _activeSs = null;
function getSs_() {
  if (!_activeSs) _activeSs = SpreadsheetApp.getActiveSpreadsheet();
  return _activeSs;
}

function sheet_(name) {
  var sh = getSs_().getSheetByName(name);
  if (!sh) throw new Error('Missing tab "' + name + '". Run setup() first.');
  return sh;
}

// Returns an array of objects (with _row), skipping rows whose key column is empty.
function readTable_(name, keyCol) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return [];
  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var o = { _row: i + 1 };
    for (var j = 0; j < headers.length; j++) {
      var h = headers[j];
      if (h) o[h] = normalize_(h, r[j]);
    }
    if (o[keyCol] !== '' && o[keyCol] !== null && o[keyCol] !== undefined) {
      out.push(o);
    }
  }
  return out;
}

function normalize_(header, v) {
  if (v instanceof Date) {
    if (header === 'month') return Utilities.formatDate(v, TZ, 'yyyy-MM');
    if (header === 'created_at') return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss");
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  }
  if (header === 'amount' || header === 'monthly_budget') return Number(v) || 0;
  return v;
}

function findRow_(name, keyCol, keyVal) {
  var rows = readTable_(name, keyCol);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][keyCol]) === String(keyVal)) return { row: rows[i]._row, obj: rows[i] };
  }
  return null;
}

function deleteByKey_(name, keyCol, keyVal) {
  if (!keyVal) throw new Error(keyCol + ' is required');
  var found = findRow_(name, keyCol, keyVal);
  if (!found) throw new Error('Not found');
  sheet_(name).deleteRow(found.row);
  return { deleted: keyVal };
}

function stripMeta_(o) {
  var c = {};
  Object.keys(o).forEach(function (k) { if (k !== '_row') c[k] = o[k]; });
  return c;
}

function checkToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (expected && token !== expected) throw new Error('Unauthorized');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
