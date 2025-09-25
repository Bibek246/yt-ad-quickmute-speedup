document.addEventListener('DOMContentLoaded', () => {
  const adSpeedInput = document.getElementById('adSpeed');
  const autoSkipInput = document.getElementById('autoSkip');
  const useMaxInput = document.getElementById('useMaxAdSpeed');
  const status = document.getElementById('status');
  const saveBtn = document.getElementById('saveBtn');

  function load() {
    if (!chrome || !chrome.storage || !chrome.storage.sync) return;
    chrome.storage.sync.get(['adSpeed', 'autoSkip', 'useMaxAdSpeed'], (res) => {
      adSpeedInput.value = (res.adSpeed ?? 4.0);
      autoSkipInput.checked = (typeof res.autoSkip === 'boolean') ? res.autoSkip : true;
      useMaxInput.checked = (typeof res.useMaxAdSpeed === 'boolean') ? res.useMaxAdSpeed : true;
    });
  }

  saveBtn.addEventListener('click', () => {
    const v = parseFloat(adSpeedInput.value);
    const adSpeed = (!Number.isNaN(v) && v > 0) ? v : 4.0;
    const autoSkip = !!autoSkipInput.checked;
    const useMaxAdSpeed = !!useMaxInput.checked;

    chrome.storage.sync.set({ adSpeed, autoSkip, useMaxAdSpeed }, () => {
      status.textContent = 'Saved!';
      setTimeout(() => status.textContent = '', 1500);
    });
  });

  load();
});
