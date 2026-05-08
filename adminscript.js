// adminscript.js - Supports Photo, Video, or No Media
import { shipmentService } from './firebase.js';
import { collection, query, orderBy, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { db } from './firebase.js';

// ==========================================
// CLOUDINARY CONFIG
// ==========================================
const CLOUDINARY_CLOUD_NAME = 'dfncwkf37';
const CLOUDINARY_UPLOAD_PRESET = 'woldclass_uploads';

console.log('Cloudinary Config:', {
  cloudName: CLOUDINARY_CLOUD_NAME,
  uploadPreset: CLOUDINARY_UPLOAD_PRESET
});

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
document.addEventListener("DOMContentLoaded", function () {
  log('Admin panel loaded');

  const trackingInput = document.getElementById("tracking");
  const trackingDisplay = document.getElementById("trackingDisplay");

  if (!trackingInput || !trackingDisplay) {
    showErr('Required form elements not found!');
    return;
  }

  generateNewTracking();
  setupMediaHandlers();
  loadShipments();

  // Default to no media
  setMediaType('none');

  log('Admin ready');
});

// ==========================================
// TRACKING NUMBER
// ==========================================
function generateNewTracking() {
  const tracking = "EC-" + Math.random().toString(36).substring(2, 10).toUpperCase();
  document.getElementById("tracking").value = tracking;
  const display = document.getElementById("trackingDisplay");
  if (display) display.textContent = tracking;
  return tracking;
}

// ==========================================
// MEDIA TYPE SELECTOR
// ==========================================
window.setMediaType = function(type) {
  currentMediaType = type;

  // Update buttons
  document.querySelectorAll('.media-type-btn').forEach(btn => btn.classList.remove('active'));
  const btnMap = { none: 'btnNone', photo: 'btnPhoto', video: 'btnVideo' };
  const activeBtn = document.getElementById(btnMap[type]);
  if (activeBtn) activeBtn.classList.add('active');

  // Update hidden input
  const typeInput = document.getElementById('mediaType');
  if (typeInput) typeInput.value = type;

  // Show/hide controls
  const controls = document.getElementById('mediaControls');
  if (controls) {
    if (type === 'none') {
      controls.classList.add('hidden');
    } else {
      controls.classList.remove('hidden');
    }
  }

  // Reset file input accept
  const mediaInput = document.getElementById('mediaInput');
  if (mediaInput) {
    mediaInput.value = '';
    if (type === 'photo') {
      mediaInput.accept = 'image/*';
    } else if (type === 'video') {
      mediaInput.accept = 'video/*';
    } else {
      mediaInput.accept = '';
    }
  }

  // Clear any existing preview when switching types
  if (type === 'none') {
    clearMedia();
  }

  log('Media type set to: ' + type);
};

// ==========================================
// MEDIA HANDLERS
// ==========================================
function setupMediaHandlers() {
  const mediaInput = document.getElementById('mediaInput');
  const uploadBtn = document.getElementById('uploadMediaBtn');

  if (mediaInput) {
    mediaInput.addEventListener('change', function(e) {
      const file = e.target.files[0];
      if (!file) return;

      console.log('File selected:', {
        name: file.name,
        type: file.type,
        size: (file.size / 1024 / 1024).toFixed(2) + ' MB'
      });

      // Validate file type based on selected media type
      const type = currentMediaType;
      if (type === 'photo' && !file.type.startsWith('image/')) {
        showErr('Please select a valid image file (JPG, PNG, etc.)');
        return;
      }
      if (type === 'video' && !file.type.startsWith('video/')) {
        showErr('Please select a valid video file (MP4, MOV, etc.)');
        return;
      }

      // Validate file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        showErr('File too large. Maximum size is 100MB.', 'Your file: ' + (file.size/1024/1024).toFixed(1) + 'MB');
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
}

function showMediaPreview(url, isUploaded) {
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

  console.log('Starting upload to:', uploadUrl);
  console.log('Resource type:', resourceType);

  try {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && progressFill) {
        const percent = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = percent + '%';
        console.log('Upload progress: ' + percent + '%');
      }
    });

    xhr.addEventListener('load', () => {
      console.log('Upload complete. Status:', xhr.status);

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

            showOk(typeLabel + ' uploaded successfully!');
            log(typeLabel + ' uploaded: ' + mediaUrl);

            setTimeout(() => {
              if (progressBar) progressBar.classList.remove('show');
              if (progressFill) progressFill.style.width = '0%';
            }, 1000);
          } else {
            showErr('Upload failed: No URL in response', JSON.stringify(response));
            if (uploadBtn) uploadBtn.disabled = false;
          }
        } catch (parseErr) {
          showErr('Failed to parse upload response', xhr.responseText.substring(0, 100));
          if (uploadBtn) uploadBtn.disabled = false;
        }
      } else {
        let errorMsg = 'Upload failed';
        let errorDetails = 'Status: ' + xhr.status;

        try {
          const errorResponse = JSON.parse(xhr.responseText);
          errorMsg = errorResponse.error?.message || errorMsg;
          errorDetails = 'Code: ' + (errorResponse.error?.code || 'unknown');
          console.error('Cloudinary error:', errorResponse);
        } catch (e) {
          errorDetails = 'Status ' + xhr.status + ': ' + xhr.statusText;
        }

        showErr(errorMsg, errorDetails);
        if (uploadBtn) uploadBtn.disabled = false;
      }
    });

    xhr.addEventListener('error', (e) => {
      console.error('Network error:', e);
      showErr(
        'Network error - Cannot connect to Cloudinary',
        'Check: 1) Internet connection, 2) Upload preset exists and is UNSIGNED, 3) Cloud name is correct'
      );
      if (uploadBtn) uploadBtn.disabled = false;
      if (progressBar) progressBar.classList.remove('show');
    });

    xhr.addEventListener('abort', () => {
      showErr('Upload was cancelled');
      if (uploadBtn) uploadBtn.disabled = false;
    });

    xhr.addEventListener('timeout', () => {
      showErr('Upload timed out. File may be too large or connection too slow.');
      if (uploadBtn) uploadBtn.disabled = false;
    });

    xhr.open('POST', uploadUrl, true);
    xhr.send(formData);

  } catch (err) {
    console.error('Upload exception:', err);
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

  if (preview) {
    preview.innerHTML = '';
    preview.style.display = 'none';
  }
  if (placeholder) placeholder.style.display = 'block';

  if (mediaInput) mediaInput.value = '';

  log('Media cleared');
};

// ==========================================
// LOAD SHIPMENTS
// ==========================================
function loadShipments() {
  const q = query(collection(db, 'shipments'), orderBy('createdAt', 'desc'));

  onSnapshot(q, (snapshot) => {
    shipments = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
    log('Loaded ' + shipments.length + ' shipments');
    renderTable();
  }, (err) => {
    showErr('Firebase error: ' + err.message);
    log('Firebase error: ' + err.message, 'error');
  });
}

// ==========================================
// RENDER TABLE
// ==========================================
function renderTable() {
  const tbody = document.getElementById('shipmentTable');
  if (!tbody) return;

  if (!shipments.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px; color:#7f8c8d;">No shipments yet. Create one above!</td></tr>';
    return;
  }

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
      '<td><div class="table-actions"><button class="btn-edit" onclick="editShipment('' + s.trackingNumber + '')">Edit</button><button class="btn-delete-table" onclick="removeShipment('' + s.trackingNumber + '')">Delete</button></div></td>' +
    '</tr>';
  }).join('');
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

  try {
    if (exists) {
      await shipmentService.update(data.trackingNumber, data);
      showOk('Shipment updated successfully!');
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

  const mediaTypeEl = document.getElementById("mediaType");
  const mediaUrlEl = document.getElementById("mediaUrl");
  const fileNameEl = document.getElementById("mediaFileName");

  // Set media type
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
    // Legacy support: old shipments with videoUrl
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

  showOk('Editing shipment: ' + tn);
  log('Loaded for edit: ' + tn);
};

// ==========================================
// RESET FORM
// ==========================================
window.resetForm = function() {
  generateNewTracking();

  ["sender", "recipient", "origin", "destination", "weight", "lastUpdate", "estDelivery"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.value = '';

  setMediaType('none');
  clearMedia();

  showOk('Form reset - Ready for new shipment');
  log('Form reset');
};
