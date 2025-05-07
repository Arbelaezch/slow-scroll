// Global settings
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

// Helper function to check if a URL should be delayed
function shouldDelayUrl(url) {
  return new Promise(resolve => {
    if (!url) {
      resolve(false);
      return;
    }
    
    try {
      const hostname = new URL(url).hostname;
      
      chrome.storage.local.get(['slowSites', 'isEnabled'], (result) => {
        if (!result.isEnabled) {
          resolve(false);
          return;
        }
        
        const slowSites = result.slowSites || [];
        const shouldDelay = slowSites.some(site => 
          hostname.includes(site) || site.includes(hostname)
        );
        
        resolve(shouldDelay);
      });
    } catch (e) {
      console.error('Error parsing URL:', e);
      resolve(false);
    }
  });
}

// Listen for tab updates - this catches both initial page load and subsequent navigations
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act when the page is starting to load
  if (changeInfo.status === 'loading') {
    const shouldDelay = await shouldDelayUrl(tab.url);
    
    if (shouldDelay) {
      // Get the configured delay time
      chrome.storage.local.get(['delay'], (result) => {
        const delay = result.delay || DEFAULT_DELAY;
        
        // Inject a script that will prevent the page from rendering content
        // until our delay completes
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          function: injectEarlyOverlay,
          args: [delay]
        });
      });
    }
  }
});

// Also catch history state updates (for SPAs like Facebook, Reddit)
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  // Only for main frame
  if (details.frameId !== 0) return;
  
  const shouldDelay = await shouldDelayUrl(details.url);
  
  if (shouldDelay) {
    chrome.storage.local.get(['delay'], (result) => {
      const delay = result.delay || DEFAULT_DELAY;
      
      chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        function: handleSpaNavigation,
        args: [delay]
      });
    });
  }
});

// This function will be injected into the page at the start of loading
function injectEarlyOverlay(delay) {
  // Only run once per real navigation
  if (window.__slowScrollActive) return;
  window.__slowScrollActive = true;
  
  console.log(`SlowScroll: Delaying page for ${delay}ms`);
  
  // Create our overlay immediately to block content
  const overlay = document.createElement('div');
  overlay.id = 'slowscroll-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
  overlay.style.zIndex = '2147483647'; // Maximum z-index value
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
  spinner.style.animation = 'slowscrollspin 2s linear infinite';
  
  const message = document.createElement('p');
  message.textContent = 'Loading...';
  message.style.marginTop = '20px';
  message.style.fontFamily = 'Arial, sans-serif';
  message.style.fontSize = '16px';
  
  // Add the style for the spinner animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slowscrollspin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  
  // We need to add this to the document as early as possible
  document.documentElement.style.display = 'none'; // Hide everything initially
  
  // Add elements to the DOM
  document.head.appendChild(style);
  overlay.appendChild(spinner);
  overlay.appendChild(message);
  document.body ? document.body.appendChild(overlay) : document.documentElement.appendChild(overlay);
  
  // Media handling - pause all media elements and store their state
  let mediaElements = [];
  
  // Function to pause all media elements
  function pauseAllMedia() {
    // Clear previous media elements data
    mediaElements = [];
    
    // Handle videos
    document.querySelectorAll('video').forEach(video => {
      const wasPlaying = !video.paused;
      if (wasPlaying) {
        video.pause();
      }
      mediaElements.push({
        element: video,
        wasPlaying: wasPlaying
      });
    });
    
    // Handle audio
    document.querySelectorAll('audio').forEach(audio => {
      const wasPlaying = !audio.paused;
      if (wasPlaying) {
        audio.pause();
      }
      mediaElements.push({
        element: audio,
        wasPlaying: wasPlaying
      });
    });
    
    // Add YouTube iframes
    document.querySelectorAll('iframe').forEach(iframe => {
      if (iframe.src && iframe.src.includes('youtube.com')) {
        try {
          // This will only work if the iframe is from the same origin
          // but we'll try anyway
          mediaElements.push({
            element: iframe,
            wasPlaying: true // Assume playing to be safe
          });
        } catch (e) {
          // Ignore cross-origin errors
        }
      }
    });
  }
  
  // First pause attempt
  pauseAllMedia();
  
  // Continue monitoring for new media elements during the delay
  const mediaMonitor = setInterval(pauseAllMedia, 100);
  
  // Set a timeout to remove the overlay after the delay
  setTimeout(() => {
    // Stop the media monitoring
    clearInterval(mediaMonitor);
    
    // Show content again
    document.documentElement.style.display = '';
    
    // Resume media that was playing before
    mediaElements.forEach(item => {
      if (item.wasPlaying) {
        try {
          const element = item.element;
          // If it's a video or audio element
          if (element.play && typeof element.play === 'function') {
            const playPromise = element.play();
            if (playPromise !== undefined) {
              playPromise.catch(error => {
                console.error('Error resuming media playback:', error);
              });
            }
          }
        } catch (e) {
          console.error('Error resuming media:', e);
        }
      }
    });
    
    // Remove the overlay
    const existingOverlay = document.getElementById('slowscroll-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }
    
    window.__slowScrollActive = false;
  }, delay);
}

// Handle SPA (Single Page Application) navigation
function handleSpaNavigation(delay) {
  // For SPA navigation, we can't hide the whole page, so we create an overlay
  if (window.__slowScrollSpaActive) return;
  window.__slowScrollSpaActive = true;
  
  console.log(`SlowScroll: Delaying SPA navigation for ${delay}ms`);
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'slowscroll-spa-overlay';
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
  overlay.style.zIndex = '2147483647';
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
  spinner.style.animation = 'slowscrollspaspin 2s linear infinite';
  
  const message = document.createElement('p');
  message.textContent = 'Loading...';
  message.style.marginTop = '20px';
  message.style.fontFamily = 'Arial, sans-serif';
  message.style.fontSize = '16px';
  
  // Add the style for the spinner animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slowscrollspaspin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  
  // Media handling for SPA navigation
  let mediaElements = [];
  
  // Function to pause all media elements
  function pauseAllMedia() {
    // Clear previous data
    mediaElements = [];
    
    // Handle videos
    document.querySelectorAll('video').forEach(video => {
      const wasPlaying = !video.paused;
      if (wasPlaying) {
        video.pause();
      }
      mediaElements.push({
        element: video,
        wasPlaying: wasPlaying
      });
    });
    
    // Handle audio
    document.querySelectorAll('audio').forEach(audio => {
      const wasPlaying = !audio.paused;
      if (wasPlaying) {
        audio.pause();
      }
      mediaElements.push({
        element: audio,
        wasPlaying: wasPlaying
      });
    });
    
    // YouTube iframes
    document.querySelectorAll('iframe').forEach(iframe => {
      if (iframe.src && iframe.src.includes('youtube.com')) {
        try {
          mediaElements.push({
            element: iframe,
            wasPlaying: true // Assume playing
          });
        } catch (e) {
          // Ignore cross-origin errors
        }
      }
    });
  }
  
  // First pause attempt
  pauseAllMedia();
  
  // Add elements to DOM
  document.head.appendChild(style);
  overlay.appendChild(spinner);
  overlay.appendChild(message);
  document.body.appendChild(overlay);
  
  // Continue monitoring for new media
  const mediaMonitor = setInterval(pauseAllMedia, 100);
  
  // Remove overlay after delay
  setTimeout(() => {
    // Stop monitoring
    clearInterval(mediaMonitor);
    
    // Resume media that was playing
    mediaElements.forEach(item => {
      if (item.wasPlaying) {
        try {
          const element = item.element;
          if (element.play && typeof element.play === 'function') {
            const playPromise = element.play();
            if (playPromise !== undefined) {
              playPromise.catch(error => {
                console.error('Error resuming media playback:', error);
              });
            }
          }
        } catch (e) {
          console.error('Error resuming media:', e);
        }
      }
    });
    
    // Remove overlay
    const existingOverlay = document.getElementById('slowscroll-spa-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }
    
    window.__slowScrollSpaActive = false;
  }, delay);
}