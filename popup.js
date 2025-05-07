document.addEventListener('DOMContentLoaded', function() {
    const enableToggle = document.getElementById('enableToggle');
    const statusText = document.getElementById('statusText');
    const delaySlider = document.getElementById('delaySlider');
    const delayValue = document.getElementById('delayValue');
    const newSite = document.getElementById('newSite');
    const addSite = document.getElementById('addSite');
    const sitesList = document.getElementById('sitesList');
    const currentSite = document.getElementById('currentSite');
    
    // Get current tab URL to display
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        const url = new URL(tabs[0].url);
        currentSite.textContent = `Current site: ${url.hostname}`;
      }
    });
    
    // Load saved settings
    chrome.storage.local.get(['slowSites', 'isEnabled', 'delay'], function(result) {
      // Set toggle state
      enableToggle.checked = result.isEnabled !== false;
      statusText.textContent = enableToggle.checked ? 'Extension is enabled' : 'Extension is disabled';
      
      // Set delay slider
      const delay = result.delay || 5000;
      delaySlider.value = delay;
      delayValue.textContent = (delay / 1000).toFixed(1);
      
      // Load sites list
      const sites = result.slowSites || [];
      renderSiteList(sites);
    });
    
    // Toggle enable/disable
    enableToggle.addEventListener('change', function() {
      const isEnabled = enableToggle.checked;
      statusText.textContent = isEnabled ? 'Extension is enabled' : 'Extension is disabled';
      chrome.storage.local.set({ isEnabled });
    });
    
    // Update delay value
    delaySlider.addEventListener('input', function() {
      const delay = parseInt(delaySlider.value);
      delayValue.textContent = (delay / 1000).toFixed(1);
      chrome.storage.local.set({ delay });
    });
    
    // Add new site
    addSite.addEventListener('click', function() {
      addNewSite();
    });
    
    newSite.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        addNewSite();
      }
    });
    
    function addNewSite() {
      let site = newSite.value.trim();
      if (!site) return;
      
      // Add protocol if missing
      if (!/^https?:\/\//i.test(site) && !/^[\w-]+\.\w+/.test(site)) {
        site = 'www.' + site;
      }
      
      // Extract domain
      try {
        // If it's a full URL, extract the hostname
        if (site.includes('://')) {
          site = new URL(site).hostname;
        } 
        // If no protocol but has www or similar, just use as is
        else if (site.includes('.')) {
          site = site;
        }
      } catch (e) {
        // If URL parsing fails, just use the input as is
        console.log('Could not parse URL, using as is:', site);
      }
      
      // Save to storage
      chrome.storage.local.get('slowSites', function(result) {
        const sites = result.slowSites || [];
        
        // Check if site already exists
        if (sites.includes(site)) {
          alert('This site is already in the list.');
          return;
        }
        
        sites.push(site);
        chrome.storage.local.set({ slowSites: sites }, function() {
          renderSiteList(sites);
          newSite.value = '';
        });
      });
    }
    
    function renderSiteList(sites) {
      sitesList.innerHTML = '';
      
      if (sites.length === 0) {
        sitesList.innerHTML = 'No sites added yet';
        return;
      }
      
      sites.forEach(function(site) {
        const item = document.createElement('div');
        item.className = 'site-item';
        
        const siteText = document.createElement('span');
        siteText.textContent = site;
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-site';
        removeBtn.textContent = 'Remove';
        removeBtn.onclick = function() {
          removeSite(site);
        };
        
        item.appendChild(siteText);
        item.appendChild(removeBtn);
        sitesList.appendChild(item);
      });
    }
    
    function removeSite(site) {
      chrome.storage.local.get('slowSites', function(result) {
        const sites = result.slowSites || [];
        const index = sites.indexOf(site);
        
        if (index !== -1) {
          sites.splice(index, 1);
          chrome.storage.local.set({ slowSites: sites }, function() {
            renderSiteList(sites);
          });
        }
      });
    }
  });