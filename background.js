const DEFAULT_DELAY = 5000; // 5 seconds delay

// Initialize storage with default values
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['slowSites', 'isEnabled', 'delay'], (result) => {
    if (!result.slowSites) {
      chrome.storage.local.set({ 
        slowSites: [],
        isEnabled: true,
        delay: DEFAULT_DELAY
      });
    }
  });
});

// Listen for navigation events
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  handleNavigation(details);
});

chrome.webNavigation.onCompleted.addListener((details) => {
  handleNavigation(details);
});

// Handle navigation to check if we need to slow down the page
function handleNavigation(details) {
  // Check if main frame (not iframes)
  if (details.frameId !== 0) return;
  
  const url = new URL(details.url);
  const hostname = url.hostname;
  
  chrome.storage.local.get(['slowSites', 'isEnabled', 'delay'], (result) => {
    if (!result.isEnabled) return;
    
    // Check if current site is in the slow list
    const matchingSite = result.slowSites.find(site => 
      hostname.includes(site) || site.includes(hostname)
    );
    
    if (matchingSite) {
      // Execute content script to slow down the page
      chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        function: slowDownPage,
        args: [result.delay]
      });
    }
  });
}

// This function will be injected into the page
function slowDownPage(delay) {
  // Only run once per navigation
  if (window.__slowScrollActive) return;
  window.__slowScrollActive = true;
  
  console.log(`SlowScroll: Slowing down page for ${delay}ms`);
  
  // Save current content
  const originalContent = document.documentElement.innerHTML;
  
  // Create loading overlay
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
  overlay.style.zIndex = '9999';
  overlay.style.display = 'flex';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.style.flexDirection = 'column';
  
  const spinner = document.createElement('div');
  spinner.style.border = '5px solid #f3f3f3';
  spinner.style.borderTop = '5px solid #3498db';
  spinner.style.borderRadius = '50%';
  spinner.style.width = '50px';
  spinner.style.height = '50px';
  spinner.style.animation = 'spin 2s linear infinite';
  
  const message = document.createElement('p');
  message.textContent = 'Slowing Scroll...';
  message.style.marginTop = '20px';
  message.style.fontFamily = 'Arial, sans-serif';
  
  // Add the style for the spinner animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  
  document.head.appendChild(style);
  overlay.appendChild(spinner);
  overlay.appendChild(message);
  document.body.appendChild(overlay);
  
  // Remove the overlay after the delay
  setTimeout(() => {
    overlay.remove();
    window.__slowScrollActive = false;
  }, delay);
}