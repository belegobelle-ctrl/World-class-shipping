// adminscript.js - Supports Photo, Video, or No Media
import { shipmentService } from './firebase.js';
import { collection, query, orderBy, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { db } from './firebase.js';

console.log('>>> adminscript.js loaded at', new Date().toISOString());

// ==========================================
// CLOUDINARY CONFIG
// ==========================================
const CLOUDINARY_CLOUD_NAME = 'dfncwkf37';
const CLOUDINARY_UPLOAD_PRESET = 'woldclass_uploads';

// State
let shipments = [];
let selectedMediaFile = null;
let currentMediaType = 'none';
let isInitialized = false;

// ==========================================
// DEBUG PANEL LOGGING
// ==========================================
function debugLog(msg, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = `[${timestamp}]`;
  console.log(prefix, msg);

  const debugContent = document.getElementById('debugContent');
  if (debugContent) {
    const div = document.createElement('div');
    div.className = 'debug-log debug-' + type;
    div.textContent = prefix + ' ' + msg;
    debugContent.appendChild(div);
    debugContent.scrollTop = debugContent.scrollHeight;
  }
}

function debugError(msg, err) {
  debugLog('ERROR: ' + msg + (err ? ' | ' + err.message : ''), 'error');
  console.error(msg, err);
}

// ==========================================
// LOGGING HELPERS
// ==========================================
function log(msg, type = 'info') {
  console.log(`[${type}]`, msg);
}

function showErr(msg, details = '') {
  console.error(msg, details);
  const box = document.getElementById('errorBox');
  if (box) {
    box.innerHTML = '❌ ' + msg + (details ? '<br><small style="opacity:0.8;">' + details + '</small>' : '');
    box.style.display = 'block';
    setTimeout(() => box.style.display = 'none', 10000);
  }
}

function showOk(msg) {
  console.log(msg);
  const box = document.getElementById('statusBox');
  if (box) {
    box.textContent = '✅ ' + msg;
    box.style.display = 'block';
    setTimeout(() => box.style.display = 'none', 4000);
  }
}

// ==========================================
// INITIALIZATION
// ==========================================
function initAdmin() {
  try {
    if (isInitialized) {
      debugLog('initAdmin() already ran, skipping');
      return;
    }

    debugLog('=== INIT ADMIN STARTING ===');
    debugLog('document.readyState = ' + document.readyState);
    debugLog('document.body exists = ' + !!document.body);

    const adminSection = document.getElementById('adminSection');
    debugLog('adminSection element = ' + adminSection);
    debugLog('adminSection visible = ' + (adminSection ? adminSection.classList.contains('visible') : 'N/A'));

    const trackingInput = document.getElementById("tracking");
    const trackingDisplay = document.getElementById("trackingDisplay");

    debugLog('trackingInput element = ' + trackingInput);
    debugLog('trackingDisplay element = ' + trackingDisplay);

    if (!trackingInput || !trackingDisplay) {
      debugError('CRITICAL: Required form elements not found!', null);
      debugLog('Available IDs in DOM: ' + Array.from(document.querySelectorAll('[id]')).map(el => el.id).join(', '));
      showErr('Required form elements not found! Check debug panel (🐛 button bottom-right).');
      return;
    }

    generateNewTracking();
    setupMediaHandlers();
    loadShipments();
    setMediaType('none');

    isInitialized = true;
    debugLog('=== INIT ADMIN COMPLETE ===');
    showOk('Admin panel ready!');

  } catch (err) {
    debugError('Init error:', err);
    showErr('Failed to initialize: ' + err.message);
  }
}

// CRITICAL FIX: Listen for pattern unlock event
debugLog('Setting up adminUnlocked listener...');
window.addEventListener('adminUnlocked', () => {
  debugLog('adminUnlocked event received!');
  initAdmin();
});

// Fallback: if no pattern lock (direct access), init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    debugLog('DOMContentLoaded fired');
    const overlay = document.getElementById('patternOverlay');
    if (!overlay || overlay.classList.contains('hidden')) {
      debugLog('No pattern lock detected, auto-init');
      initAdmin();
    } else {
      debugLog('Pattern lock active, waiting for unlock...');
    }
  });
} else {
  debugLog('DOM already loaded, checking pattern lock...');
  const overlay = document.getElementById('patternOverlay');
  if (!overlay || overlay.classList.contains('hidden')) {
    debugLog('No pattern lock detected, auto-init');
    initAdmin();
  } else {
    debugLog('Pattern lock active, waiting for unlock...');
  }
}

// ==========================================
// TRACKING NUMBER
// ==========================================
function generateNewTracking() {
  try {
    debugLog('generateNewTracking() called');
    const tracking = "EC-" + Math.random().toString(36).substring(2, 10).toUpperCase();

    const input = document.getElementById("tracking");
    const display = document.getElementById("trackingDisplay");

    if (input) {
      input.value = tracking;
      debugLog('Set #tracking.value = ' + tracking);
    } else {
      debugError('#tracking input not found!', null);
    }

    if (display) {
      display.textContent = tracking;
      debugLog('Set #trackingDisplay.textContent = ' + tracking);
    } else {
      debugError('#trackingDisplay not found!', null);
    }

    return tracking;
  } catch (err) {
    debugError('Generate tracking error:', err);
    const display = document.getElementById('trackingDisplay');
    if (display) display.textContent = 'EC-ERROR';
    return null;
  }
}

// ==========================================
// MEDIA TYPE SELECTOR
// ==========================================
window.setMediaType = function(type) {
  try {
    currentMediaType = type;

    document.querySelectorAll('.media-type-btn').forEach(btn => btn.classList.remove('active'));
    const btnMap = { none: 'btnNone', photo: 'btnPhoto', video: 'btnVideo' };
    const activeBtn = document.getElementById(btnMap[type]);
    if (activeBtn) activeBtn.classList.add('active');

    const typeInput = document.getElementById('mediaType');
    if (typeInput) typeInput.value = type;

    const controls = document.getElementById('mediaControls');
    if (controls) {
      if (type === 'none') {
        controls.classList.add('hidden');
      } else {
        controls.classList.remove('hidden');
      }
    }

    const mediaInput = document.getElementById('mediaInput');
    if (mediaInput) {
      mediaInput.value = '';
      if (type === 'photo') mediaInput.accept = 'image/*';
      else if (type === 'video') mediaInput.accept = 'video/*';
      else mediaInput.accept = '';
    }

    if (type === 'none') clearMedia();

    log('Media type: ' + type);
  } catch (err) {
    console.error('setMediaType error:', err);
  }
};

// ==========================================
// MEDIA HANDLERS
// ==========================================
function setupMediaHandlers() {
  try {
    const mediaInput = document.getElementById('mediaInput');
    const uploadBtn = document.getElementById('uploadMediaBtn');

    if (mediaInput) {
      mediaInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const type = currentMediaType;
        if (type === 'photo' && !file.type.startsWith('image/')) {
          showErr('Please select a valid image file (JPG, PNG, etc.)');
          return;
        }
        if (type === 'video' && !file.type.startsWith('video/')) {
          showErr('Please select a valid video file (MP4, MOV, etc.)');
          return;
        }

        if (file.size > 100 * 1024 * 1024) {
          showErr('File too large. Max 100MB.', 'Your file: ' + (file.size/1024/1024).toFixed(1) + 'MB');
          return;
        }

        selectedMediaFile = file;

        const fileNameEl = document.getElementById('mediaFileName');
        if (fileNameEl) {
          fileNameEl.textContent = 'Selected: ' + file.name + ' (' + (file.size / 1024 / 1024).toFixed(2) + ' MB)';
        }

        if (uploadBtn) uploadBtn.disabled = false;
        showMediaPreview(URL.createObjectURL(file), false);
        log('Media selected: ' + file.name);
      });
    }
  } catch (err) {
    console.error('setupMediaHandlers error:', err);
  }
}

function showMediaPreview(url, isUploaded) {
  try {
    const placeholder = document.getElementById('mediaPlaceholder');
    const preview = document.getElementById('mediaPreview');
    const clearBtn = document.getElementById('clearMediaBtn');

    if (!preview) return;

    if (placeholder) placeholder.style.display = 'none';
    preview.style.display = 'block';

    if (currentMediaType === 'photo') {
      preview.innerHTML = '<img src="' + url + '" alt="Shipment photo" style="' + (isUploaded ? '' : 'opacity:0.7;') + '" />';
    } else if (currentMediaType === 'video') {
      preview.innerHTML = '<video controls style="max-height: 400px; width: 100%;' + (isUploaded ? '' : ' opacity:0.7;') + '"><source src="' + url + '" type="video/mp4">Your browser does not support the video tag.</video>';
    }

    if (clearBtn) clearBtn.style.display = 'inline-flex';
  } catch (err) {
    console.error('showMediaPreview error:', err);
  }
}

// ==========================================
// MEDIA UPLOAD
// ==========================================
window.uploadMedia = async function() {
  if (!selectedMediaFile) {
    showErr('Please select a file first');
    return;
  }

  const uploadBtn = document.getElementById('uploadMediaBtn');
  const progressBar = document.getElementById('progressBar');
  const progressFill = document.getElementById('progressFill');

  if (uploadBtn) uploadBtn.disabled = true;
  if (progressBar) progressBar.classList.add('show');

  const formData = new FormData();
  formData.append('file', selectedMediaFile);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const resourceType = currentMediaType === 'photo' ? 'image' : 'video';
  const uploadUrl = 'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD_NAME + '/' + resourceType + '/upload';

  log('Uploading to: ' + uploadUrl);

  try {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && progressFill) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = percent + '%';
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        try {
          const response = JSON.parse(xhr.responseText);

          if (response.secure_url) {
            const mediaUrl = response.secure_url;

            const mediaUrlInput = document.getElementById('mediaUrl');
            if (mediaUrlInput) mediaUrlInput.value = mediaUrl;

            showMediaPreview(mediaUrl, true);

            const fileNameEl = document.getElementById('mediaFileName');
            const typeLabel = currentMediaType === 'photo' ? 'Photo' : 'Video';
            if (fileNameEl) {
              fileNameEl.innerHTML = '✅ ' + typeLabel + ' uploaded! <a href="' + mediaUrl + '" target="_blank" style="color: #3498db; font-size: 12px;">View ' + typeLabel + '</a>';
            }

            showOk(typeLabel + ' uploaded!');
            log('Uploaded: ' + mediaUrl);

            setTimeout(() => {
              if (progressBar) progressBar.classList.remove('show');
              if (progressFill) progressFill.style.width = '0%';
            }, 1000);
          } else {
            showErr('Upload failed: No URL', JSON.stringify(response));
            if (uploadBtn) uploadBtn.disabled = false;
          }
        } catch (parseErr) {
          showErr('Parse error', xhr.responseText.substring(0, 100));
          if (uploadBtn) uploadBtn.disabled = false;
        }
      } else {
        let errorMsg = 'Upload failed';
        let errorDetails = 'Status: ' + xhr.status;
        try {
          const err = JSON.parse(xhr.responseText);
          errorMsg = err.error?.message || errorMsg;
        } catch (e) {}
        showErr(errorMsg, errorDetails);
        if (uploadBtn) uploadBtn.disabled = false;
      }
    });

    xhr.addEventListener('error', () => {
      showErr('Network error - Cannot connect to Cloudinary');
      if (uploadBtn) uploadBtn.disabled = false;
      if (progressBar) progressBar.classList.remove('show');
    });

    xhr.addEventListener('abort', () => {
      showErr('Upload cancelled');
      if (uploadBtn) uploadBtn.disabled = false;
    });

    xhr.open('POST', uploadUrl, true);
    xhr.send(formData);

  } catch (err) {
    showErr('Upload error: ' + err.message);
    if (uploadBtn) uploadBtn.disabled = false;
  }
};

window.clearMedia = function() {
  selectedMediaFile = null;

  const mediaUrlInput = document.getElementById('mediaUrl');
  const fileNameEl = document.getElementById('mediaFileName');
  const uploadBtn = document.getElementById('uploadMediaBtn');
  const clearBtn = document.getElementById('clearMediaBtn');
  const placeholder = document.getElementById('mediaPlaceholder');
  const preview = document.getElementById('mediaPreview');
  const mediaInput = document.getElementById('mediaInput');

  if (mediaUrlInput) mediaUrlInput.value = '';
  if (fileNameEl) fileNameEl.textContent = '';
  if (uploadBtn) uploadBtn.disabled = true;
  if (clearBtn) clearBtn.style.display = 'none';
  if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
  if (placeholder) placeholder.style.display = 'block';
  if (mediaInput) mediaInput.value = '';

  log('Media cleared');
};

// ==========================================
// LOAD SHIPMENTS
// ==========================================
function loadShipments() {
  try {
    debugLog('loadShipments() called');

    if (!db) {
      debugError('Firebase db is undefined! Check firebase.js export.', null);
      const tbody = document.getElementById('shipmentTable');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#e74c3c;">❌ Firebase db not loaded. Check firebase.js exports and console.</td></tr>';
      }
      return;
    }

    if (!collection || !query || !orderBy || !onSnapshot) {
      debugError('Firebase Firestore imports missing', null);
      debugLog('collection=' + !!collection + ' query=' + !!query + ' orderBy=' + !!orderBy + ' onSnapshot=' + !!onSnapshot);
      const tbody = document.getElementById('shipmentTable');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#e74c3c;">❌ Firebase imports missing. Check module loading.</td></tr>';
      }
      return;
    }

    if (!shipmentService) {
      debugError('shipmentService is undefined! Check firebase.js export.', null);
      const tbody = document.getElementById('shipmentTable');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#e74c3c;">❌ shipmentService not available. Check firebase.js exports.</td></tr>';
      }
      return;
    }

    debugLog('Firebase checks passed, building query...');
    const q = query(collection(db, 'shipments'), orderBy('createdAt', 'desc'));
    debugLog('Query built, attaching onSnapshot listener...');

    onSnapshot(q, (snapshot) => {
      debugLog('onSnapshot callback fired! Docs count: ' + snapshot.size);
      if (snapshot.empty) {
        debugLog('Snapshot is empty - no documents in shipments collection');
      } else {
        debugLog('Snapshot docs: ' + snapshot.docs.map(d => d.id).join(', '));
      }
      shipments = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
      debugLog('Shipments array populated: ' + shipments.length + ' items');
      renderTable();
    }, (err) => {
      debugError('Firebase onSnapshot error:', err);
      showErr('Firebase error: ' + err.message);
      const tbody = document.getElementById('shipmentTable');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#e74c3c;">❌ Error: ' + err.message + '</td></tr>';
      }
    });

    debugLog('onSnapshot listener attached successfully');
  } catch (err) {
    debugError('loadShipments error:', err);
    const tbody = document.getElementById('shipmentTable');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#e74c3c;">❌ ' + err.message + '</td></tr>';
    }
  }
}

// ==========================================
// RENDER TABLE
// ==========================================
function renderTable() {
  try {
    debugLog('renderTable() called, shipments count: ' + shipments.length);
    const tbody = document.getElementById('shipmentTable');

    if (!tbody) {
      debugError('shipmentTable element not found!', null);
      return;
    }

    if (!shipments.length) {
      debugLog('No shipments to render');
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#7f8c8d;">No shipments yet. Create one above!</td></tr>';
      return;
    }

    debugLog('Rendering ' + shipments.length + ' shipments...');
    tbody.innerHTML = shipments.map(s => {
      const hasMedia = s.mediaUrl && s.mediaUrl.trim() !== '';
      const legacyVideo = s.videoUrl && s.videoUrl.trim() !== '';
      const mediaLabel = s.mediaType === 'photo' ? '📷 View' : '📹 View';
      const mediaLink = hasMedia ? s.mediaUrl : (legacyVideo ? s.videoUrl : '');

      const trackingNum = s.trackingNumber || 'N/A';
      const recipient = s.recipient || 'N/A';
      const status = s.status || '-';
      const lastUpdate = s.lastUpdate || '-';

      // CRITICAL FIX: Use &quot; for proper HTML quote escaping
      return '<tr>' +
        '<td style="font-family: monospace; font-weight: 600;">' + trackingNum + '</td>' +
        '<td>' + recipient + '</td>' +
        '<td><span style="display:inline-block; padding:4px 12px; border-radius:12px; font-size:12px; font-weight:600; background:' + getStatusColor(status) + '; color:white;">' + status + '</span></td>' +
        '<td>' + lastUpdate + '</td>' +
        '<td>' + (mediaLink ? '<a href="' + mediaLink + '" target="_blank" class="video-link">' + mediaLabel + '</a>' : '-') + '</td>' +
        '<td><div class="table-actions"><button class="btn-edit" onclick="editShipment(&quot;' + trackingNum + '&quot;)">Edit</button><button class="btn-delete-table" onclick="removeShipment(&quot;' + trackingNum + '&quot;)">Delete</button></div></td>' +
      '</tr>';
    }).join('');

    debugLog('Table rendered successfully with ' + shipments.length + ' rows');
  } catch (err) {
    debugError('renderTable error:', err);
  }
}

function getStatusColor(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('delivered')) return '#27ae60';
  if (s.includes('transit')) return '#3498db';
  if (s.includes('picked')) return '#f39c12';
  if (s.includes('received')) return '#9b59b6';
  return '#95a5a6';
}

// ==========================================
// SAVE SHIPMENT
// ==========================================
window.saveShipment = async function() {
  try {
    const recipientEl = document.getElementById("recipient");

    if (!recipientEl || !recipientEl.value.trim()) {
      showErr('Please enter a receiver name');
      if (recipientEl) recipientEl.focus();
      return;
    }

    const mediaType = document.getElementById('mediaType')?.value || 'none';
    const mediaUrl = document.getElementById('mediaUrl')?.value?.trim() || '';

    const data = {
      trackingNumber: document.getElementById("tracking").value.toUpperCase().trim(),
      sender: document.getElementById("sender")?.value?.trim() || '',
      recipient: recipientEl.value.trim(),
      origin: document.getElementById("origin")?.value?.trim() || '',
      destination: document.getElementById("destination")?.value?.trim() || '',
      weight: document.getElementById("weight")?.value?.trim() || '',
      status: document.getElementById("status")?.value?.trim() || 'Package Received',
      lastUpdate: document.getElementById("lastUpdate")?.value?.trim() || new Date().toLocaleString(),
      estDelivery: document.getElementById("estDelivery")?.value?.trim() || '',
      mediaType: mediaType,
      mediaUrl: mediaUrl,
      updatedAt: new Date().toISOString()
    };

    const exists = shipments.find(s => 
      s.trackingNumber && s.trackingNumber.toUpperCase() === data.trackingNumber.toUpperCase()
    );

    if (exists) {
      await shipmentService.update(data.trackingNumber, data);
      showOk('Shipment updated!');
    } else {
      data.createdAt = new Date().toISOString();
      await shipmentService.create(data);
      showOk('Shipment created! Tracking: ' + data.trackingNumber);
    }

    resetForm();

  } catch(err) {
    showErr('Save failed: ' + err.message);
    console.error('Save error:', err);
  }
};

// ==========================================
// DELETE SHIPMENT
// ==========================================
window.removeShipment = async function(tn) {
  if (!confirm('Delete shipment ' + tn + '? This cannot be undone.')) return;

  try {
    await shipmentService.delete(tn);
    showOk('Shipment deleted');
  } catch(e) {
    showErr('Delete failed: ' + e.message);
  }
};

// ==========================================
// EDIT SHIPMENT
// ==========================================
window.editShipment = function(tn) {
  try {
    const s = shipments.find(x => x.trackingNumber === tn);
    if (!s) {
      showErr('Shipment not found: ' + tn);
      return;
    }

    document.getElementById("tracking").value = s.trackingNumber;
    const display = document.getElementById("trackingDisplay");
    if (display) display.textContent = s.trackingNumber;

    document.getElementById("sender").value = s.sender || '';
    document.getElementById("recipient").value = s.recipient || '';
    document.getElementById("origin").value = s.origin || '';
    document.getElementById("destination").value = s.destination || '';
    document.getElementById("weight").value = s.weight || '';
    document.getElementById("status").value = s.status || '';
    document.getElementById("lastUpdate").value = s.lastUpdate || '';
    document.getElementById("estDelivery").value = s.estDelivery || '';

    const mediaUrlEl = document.getElementById("mediaUrl");
    const fileNameEl = document.getElementById("mediaFileName");

    const savedType = s.mediaType || (s.videoUrl ? 'video' : 'none');
    setMediaType(savedType);

    if (s.mediaUrl && s.mediaUrl.trim()) {
      if (mediaUrlEl) mediaUrlEl.value = s.mediaUrl;
      showMediaPreview(s.mediaUrl, true);
      if (fileNameEl) {
        const typeLabel = savedType === 'photo' ? 'Photo' : 'Video';
        fileNameEl.innerHTML = 'Current: <a href="' + s.mediaUrl + '" target="_blank" style="color: #3498db;">View ' + typeLabel + '</a>';
      }
    } else if (s.videoUrl && s.videoUrl.trim()) {
      if (mediaUrlEl) mediaUrlEl.value = s.videoUrl;
      setMediaType('video');
      showMediaPreview(s.videoUrl, true);
      if (fileNameEl) {
        fileNameEl.innerHTML = 'Current: <a href="' + s.videoUrl + '" target="_blank" style="color: #3498db;">View Video</a>';
      }
    } else {
      clearMedia();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    showOk('Editing: ' + tn);

  } catch (err) {
    console.error('editShipment error:', err);
    showErr('Error loading shipment: ' + err.message);
  }
};

// ==========================================
// RESET FORM
// ==========================================
window.resetForm = function() {
  try {
    generateNewTracking();

    ["sender", "recipient", "origin", "destination", "weight", "lastUpdate", "estDelivery"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const statusEl = document.getElementById("status");
    if (statusEl) statusEl.value = '';

    setMediaType('none');
    clearMedia();

    showOk('Form reset');
  } catch (err) {
    console.error('resetForm error:', err);
  }
};
