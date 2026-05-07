// indexscript.js - Firebase CDN version
import { shipmentService } from './firebase.js';

async function trackShipment() {
  const input = document.getElementById("trackingNumber");
  const resultBox = document.getElementById("trackingResult");
  const trackingNumber = input.value.trim();

  resultBox.innerHTML = "";

  if (!trackingNumber) {
    resultBox.innerHTML = "<p style='color:#ff5555'>Please enter a tracking number.</p>";
    return;
  }

  try {
    resultBox.innerHTML = "<p style='color:#888'>Searching...</p>";

    const shipment = await shipmentService.getByTrackingNumber(trackingNumber);

    if (!shipment) {
      resultBox.innerHTML = "<p style='color:#ff5555'>Tracking number not found.</p>";
      return;
    }

    window.location.href = `track.html?tn=${trackingNumber.toUpperCase()}`;

  } catch (err) {
    console.error("Error:", err);
    resultBox.innerHTML = "<p style='color:#ff5555'>Error searching. Please try again.</p>";
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById("trackingNumber");
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        trackShipment();
      }
    });
  }
});

window.trackShipment = trackShipment;
