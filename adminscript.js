// adminscript.js - Supports Photo, Video, or No Media
import { shipmentService } from './firebase.js';
import { collection, query, orderBy, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { db } from './firebase.js';

console.log('>>> adminscript.js imports loaded successfully');

// ==========================================
// CLOUDINARY CONFIG
// ==========================================
const CLOUDINARY_CLOUD_NAME = 'dfncwkf37';
const CLOUDINARY_UPLOAD_PRESET = 'woldclass_uploads';

// State
let shipments = [];
let selectedMediaFile = null;
let currentMediaType = 'none';

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
    log('Admin panel initializing...');
    console.log('>>> DEBUG: document.readyState =', document.readyState);
    console.log('>>> DEBUG: document.body exists?', !!document.body);
    console.log('>>> DEBUG: Full HTML at init:', document.body ? document.body.innerHTML.substring(0, 500) + '...' : 'NO BODY');

    const trackingInput = document.getElementById("tracking");
    const trackingDisplay = document.getElementById("trackingDisplay");

    console.log('>>> DEBUG: trackingInput element =', trackingInput);
    console.log('>>> DEBUG: trackingDisplay element =', trackingDisplay);

    if (!trackingInput || !trackingDisplay) {
      console.error('>>> DEBUG: FAILED - Required form elements not found!');
      console.error('>>> DEBUG: Available IDs in DOM:', Array.from(document.querySelectorAll('[id]')).map(el => el.id));
      showErr('Required form elements not found!');
      return;
    }

    console.log('>>> DEBUG: Elements found, generating tracking...');
    const generatedTracking = generateNewTracking();
    console.log('>>> DEBUG: generateNewTracking() returned:', generatedTracking);

    console.log('>>> DEBUG: Setting up media handlers...');
    setupMediaHandlers();

    console.log('>>> DEBUG: Loading shipments...');
    loadShipments();

    console.log('>>> DEBUG: Setting media type to none...');
    setMediaType('none');

    log('Admin initialized successfully');
  } catch (err) {
    console.error('>>> DEBUG: Init error:', err);
    console.error('>>> DEBUG: Init error stack:', err.stack);
    showErr('Failed to initialize: ' + err.message);
  }
}

// Run init when DOM is ready
console.log('>>> DEBUG: Script executing, readyState =', document.readyState);
try {
  if (document.readyState === 'loading') {
    console.log('>>> DEBUG: Attaching DOMContentLoaded listener...');
    document.addEventListener('DOMContentLoaded', () => {
      console.log('>>> DEBUG: DOMContentLoaded fired!');
      initAdmin();
    });
  } else {
    console.log('>>> DEBUG: DOM already loaded (readyState = ' + document.readyState + '), running init immediately...');
    initAdmin();
  }
} catch (e) {
  console.error('>>> DEBUG: Failed to attach init:', e);
  console.error('>>> DEBUG: Trying direct init as fallback...');
  try { initAdmin(); } catch (e2) { console.error('>>> DEBUG: Direct init also failed:', e2); }
}

// ==========================================
// TRACKING NUMBER
// ==========================================
function generateNewTracking() {
  try {
    console.log('>>> DEBUG: generateNewTracking() called');
    const tracking = "EC-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    console.log('>>> DEBUG: Generated tracking string:', tracking);

    const input = document.getElementById("tracking");
    const display = document.getElementById("trackingDisplay");

    console.log('>>> DEBUG: Input element inside generateNewTracking:', input);
    console.log('>>> DEBUG: Display element inside generateNewTracking:', display);

    if (input) {
      input.value = tracking;
      console.log('>>> DEBUG: Set input.value successfully');
    } else {
      console.error('>>> DEBUG: CRITICAL - input element #tracking not found in generateNewTracking!');
    }

    if (display) {
      display.textContent = tracking;
      console.log('>>> DEBUG: Set display.textContent successfully');
    } else {
      console.error('>>> DEBUG: CRITICAL - display element #trackingDisplay not found in generateNewTracking!');
    }

    log('Tracking generated: ' + tracking);
    return tracking;
  } catch (err) {
    console.error('>>> DEBUG: Generate tracking error:', err);
    console.error('>>> DEBUG: Error stack:', err.stack);
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
    log('Loading shipments...');
    console.log('>>> DEBUG: loadShipments() called');
    console.log('>>> DEBUG: db object =', db);
    console.log('>>> DEBUG: collection function =', collection);
    console.log('>>> DEBUG: query function =', query);
    console.log('>>> DEBUG: orderBy function =', orderBy);
    console.log('>>> DEBUG: onSnapshot function =', onSnapshot);
    console.log('>>> DEBUG: shipmentService =', shipmentService);

    if (!db || !collection || !query || !orderBy || !onSnapshot) {
      console.error('>>> DEBUG: FAILED - Firebase imports missing!');
      console.error('>>> DEBUG: Missing details:', {
        db: !!db, 
        collection: !!collection, 
        query: !!query, 
        orderBy: !!orderBy, 
        onSnapshot: !!onSnapshot
      });
      const tbody = document.getElementById('shipmentTable');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#e74c3c;">❌ Firebase not loaded properly. Check console.</td></tr>';
      }
      return;
    }

    if (!shipmentService) {
      console.error('>>> DEBUG: FAILED - shipmentService is undefined! Check firebase.js export.');
      const tbody = document.getElementById('shipmentTable');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#e74c3c;">❌ Shipment service not available. Check firebase.js exports.</td></tr>';
      }
      return;
    }

    console.log('>>> DEBUG: Firebase imports OK, building query...');
    const q = query(collection(db, 'shipments'), orderBy('createdAt', 'desc'));
    console.log('>>> DEBUG: Query built:', q);

    console.log('>>> DEBUG: Attaching onSnapshot listener...');
    onSnapshot(q, (snapshot) => {
      console.log('>>> DEBUG: onSnapshot callback fired!');
      console.log('>>> DEBUG: Snapshot size:', snapshot.size);
      console.log('>>> DEBUG: Snapshot empty?', snapshot.empty);
      console.log('>>> DEBUG: Snapshot docs:', snapshot.docs.map(d => ({id: d.id, ...d.data()})));

      shipments = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
      log('Loaded ' + shipments.length + ' shipments');
      console.log('>>> DEBUG: Shipments array populated:', shipments);
      renderTable();
    }, (err) => {
      console.error('>>> DEBUG: onSnapshot ERROR callback:', err);
      console.error('>>> DEBUG: Error code:', err.code);
      console.error('>>> DEBUG: Error message:', err.message);
      showErr('Firebase error: ' + err.message);
      console.error('Firebase error:', err);

      const tbody = document.getElementById('shipmentTable');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#e74c3c;">❌ Error loading shipments: ' + err.message + '</td></tr>';
      }
    });

    console.log('>>> DEBUG: onSnapshot listener attached successfully');
  } catch (err) {
    console.error('>>> DEBUG: loadShipments outer error:', err);
    console.error('>>> DEBUG: Error stack:', err.stack);
    showErr('Failed to load shipments: ' + err.message);
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
    console.log('>>> DEBUG: renderTable() called, shipments count:', shipments.length);
    const tbody = document.getElementById('shipmentTable');
    console.log('>>> DEBUG: shipmentTable element:', tbody);

    if (!tbody) {
      console.error('>>> DEBUG: CRITICAL - shipmentTable element not found!');
      return;
    }

    if (!shipments.length) {
      console.log('>>> DEBUG: No shipments to render');
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#7f8c8d;">No shipments yet. Create one above!</td></tr>';
      return;
    }

    console.log('>>> DEBUG: Rendering', shipments.length, 'shipments...');
    tbody.innerHTML = shipments.map(s => {
      const hasMedia = s.mediaUrl && s.mediaUrl.trim() !== '';
      const legacyVideo = s.videoUrl && s.videoUrl.trim() !== '';
      const mediaLabel = s.mediaType === 'photo' ? '📷 View' : '📹 View';
      const mediaLink = hasMedia ? s.mediaUrl : (legacyVideo ? s.videoUrl : '');

      return '<tr>' +
        '<td style="font-family: monospace; font-weight: 600;">' + (s.trackingNumber || 'N/A') + '</td>' +
        '<td>' + (s.recipient || 'N/A') + '</td>' +
        '<td><span style="display:inline-block; padding:4px 12px; border-radius:12px; font-size:12px; font-weight:600; background:' + getStatusColor(s.status) + '; color:white;">' + (s.status || '-') + '</span></td>' +
        '<td>' + (s.lastUpdate || '-') + '</td>' +
        '<td>' + (mediaLink ? '<a href="' + mediaLink + '" target="_blank" class="video-link">' + mediaLabel + '</a>' : '-') + '</td>' +
        '<td><div class="table-actions"><button class="btn-edit" onclick="editShipment(\'' + s.trackingNumber + '\')">Edit</button><button class="btn-delete-table" onclick="removeShipment(\'' + s.trackingNumber + '\')">Delete</button></div></td>' +
      '</tr>';
    }).join('');

    console.log('>>> DEBUG: Table rendered successfully');
  } catch (err) {
    console.error('>>> DEBUG: renderTable error:', err);
    console.error('>>> DEBUG: Error stack:', err.stack);
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
    const fileNameEl = document.getElementById("mediaFileName');

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
