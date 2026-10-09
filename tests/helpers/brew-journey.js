function confirmPreparation(window) {
  const doc = window.document;
  doc.getElementById('btnSetupReady').click();
  doc.getElementById('btnWaterReady').click();
}

module.exports = { confirmPreparation };
