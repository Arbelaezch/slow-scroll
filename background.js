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
        
        // Check if this is YouTube Shorts
        const isYouTubeShorts = tab.url && tab.url.includes('youtube.com/shorts');
        
        // Inject appropriate script based on whether it's YouTube Shorts
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          function: injectEarlyOverlay,
          args: [delay, isYouTubeShorts]
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
      
      // Check if this is YouTube Shorts
      const isYouTubeShorts = details.url && details.url.includes('youtube.com/shorts');
      
      chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        function: handleSpaNavigation,
        args: [delay, isYouTubeShorts]
      });
    });
  }
});

// Handles the initial page load for all sites, with special handling for YouTube Shorts
function injectEarlyOverlay(delay, isYouTubeShorts) {
  // Only run once per real navigation
  if (window.__slowScrollActive) return;
  window.__slowScrollActive = true;
  
  console.log(`SlowScroll: Delaying page for ${delay}ms (YouTube Shorts: ${isYouTubeShorts})`);
  
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
  
  // Different approach depending on if it's YouTube Shorts
  if (!isYouTubeShorts) {
    // Standard site - hide content completely
    document.documentElement.style.display = 'none';
  } else {
    // For YouTube Shorts, we need a special approach to block element access
    // Add a style to disable pointer events on everything except our overlay
    const blockInteractions = document.createElement('style');
    blockInteractions.id = 'slowscroll-block-interactions';
    blockInteractions.textContent = `
      body * {
        pointer-events: none !important;
      }
      #slowscroll-overlay {
        pointer-events: auto !important;
      }
    `;
    document.head.appendChild(blockInteractions);
  }
  
  // Add elements to the DOM
  document.head.appendChild(style);
  overlay.appendChild(spinner);
  overlay.appendChild(message);
  document.body ? document.body.appendChild(overlay) : document.documentElement.appendChild(overlay);
  
  // Immediately pause and mute all audio/video elements (including those in other tabs/players)
  // This tackles the background audio problem
  if (isYouTubeShorts) {
    // First force pause all media on the page
    pauseAllYouTubeMedia();
  }
  
  // Media handling - pause all videos/audio
  const mediaElements = [];
  
  // Function to pause all video and audio elements
  function pauseAllMedia() {
    document.querySelectorAll('video, audio').forEach(media => {
      try {
        if (!media.paused) {
          // Check if we've already handled this media element
          const existingIndex = mediaElements.findIndex(item => item.element === media);
          if (existingIndex === -1) {
            // New media element
            mediaElements.push({
              element: media,
              wasMuted: media.muted,
              wasPlaying: true,
              currentTime: media.currentTime
            });
          }
          
          // Pause the media
          media.pause();
        }
      } catch (e) {
        console.error('Error pausing media:', e);
      }
    });
    
    // For YouTube Shorts specifically - additional handling for their player
    if (isYouTubeShorts) {
      // Try to find and click any pause buttons
      document.querySelectorAll('.ytp-play-button').forEach(button => {
        try {
          if (button.title && button.title.toLowerCase().includes('pause')) {
            button.click();
          }
        } catch (e) {
          console.error('Error clicking pause button:', e);
        }
      });
    }
  }
  
  // More aggressive function specifically for YouTube to handle background audio
  function pauseAllYouTubeMedia() {
    // Stop all hidden videos that might be playing in the background
    document.querySelectorAll('video, audio, iframe').forEach(el => {
      try {
        // For video and audio elements
        if (el.pause) {
          el.pause();
          el.muted = true; // Mute temporarily
        }
        
        // For iframes - try to access contentWindow if possible
        if (el.tagName === 'IFRAME') {
          try {
            // This will only work for same-origin iframes
            const frameDoc = el.contentDocument || el.contentWindow.document;
            frameDoc.querySelectorAll('video, audio').forEach(media => {
              media.pause();
              media.muted = true;
            });
          } catch (frameErr) {
            // Cross-origin iframe - can't access directly
          }
        }
      } catch (e) {
        console.error('Error handling media element:', e);
      }
    });
    
    // Additional YouTube-specific handling
    // Try to find and click any player's pause button
    document.querySelectorAll('.ytp-play-button').forEach(button => {
      try {
        if (button.title && button.title.toLowerCase().includes('pause')) {
          button.click();
        }
      } catch (e) {
        console.error('Error interacting with YouTube player:', e);
      }
    });
    
    // Also try to find any mini player and close it
    document.querySelectorAll('.ytp-miniplayer-close-button').forEach(button => {
      try {
        button.click();
      } catch (e) {
        console.error('Error closing miniplayer:', e);
      }
    });
  }
  
  // Start pausing media
  pauseAllMedia();
  
  // For YouTube Shorts, we need a more aggressive approach to stop background audio
  if (isYouTubeShorts) {
    pauseAllYouTubeMedia();
    
    // Repeat the YouTube-specific pause after a short delay to catch any late-loading players
    setTimeout(pauseAllYouTubeMedia, 200);
  }
  
  // Keep checking for new videos during the delay
  const pauseInterval = setInterval(() => {
    pauseAllMedia();
    
    // For YouTube Shorts, we need more aggressive handling
    if (isYouTubeShorts && (Math.random() < 0.5)) { // Only run about half the time to reduce overhead
      pauseAllYouTubeMedia();
    }
  }, 100);
  
  // Set a timeout to remove the overlay after the delay
  setTimeout(() => {
    // Stop the media monitoring
    clearInterval(pauseInterval);
    
    // Show content again
    if (!isYouTubeShorts) {
      document.documentElement.style.display = '';
    } else {
      // For YouTube Shorts - remove our interaction blocker
      const blockInteractions = document.getElementById('slowscroll-block-interactions');
      if (blockInteractions) {
        blockInteractions.remove();
      }
      
      // Special handling for YouTube Shorts - let's make the player visible
      // and force a layout update
      document.body.style.display = 'none';
      setTimeout(() => {
        document.body.style.display = '';
      }, 50);
    }
    
    // Remove the overlay
    const existingOverlay = document.getElementById('slowscroll-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }
    
    // For YouTube Shorts, unmute all videos
    if (isYouTubeShorts) {
      document.querySelectorAll('video, audio').forEach(media => {
        try {
          if (media.muted) {
            // Only unmute the active/visible players
            const rect = media.getBoundingClientRect();
            // Check if the video is visible in the viewport
            if (rect.width > 0 && rect.height > 0 && 
                rect.top >= 0 && rect.left >= 0 && 
                rect.top <= window.innerHeight && rect.left <= window.innerWidth) {
              media.muted = false;
            }
          }
        } catch (e) {
          console.error('Error unmuting media:', e);
        }
      });
    }
    
    // Special case for YouTube Shorts - we need to reset the player state
    if (isYouTubeShorts) {
      // After a short delay to let YouTube's player initialize
      setTimeout(() => {
        // Force a click on the video container to activate it
        document.querySelectorAll('ytd-shorts, .html5-video-container, .html5-video-player, #shorts-container').forEach(container => {
          try {
            container.click();
          } catch (e) {
            console.error('Error clicking shorts container:', e);
          }
        });
        
        // Also try clicking play buttons
        document.querySelectorAll('.ytp-play-button').forEach(button => {
          try {
            if (button.title && button.title.toLowerCase().includes('play')) {
              button.click();
            }
          } catch (e) {
            console.error('Error clicking play button:', e);
          }
        });
        
        // Force the player to show controls
        document.querySelectorAll('video').forEach(video => {
          try {
            // Create and dispatch a synthetic mouse move event to make controls appear
            ['mouseover', 'mousemove'].forEach(eventType => {
              const event = new MouseEvent(eventType, {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: video.getBoundingClientRect().width / 2,
                clientY: video.getBoundingClientRect().height / 2
              });
              video.dispatchEvent(event);
            });
          } catch (e) {
            console.error('Error dispatching mouse events:', e);
          }
        });
      }, 300);
    }
    
    window.__slowScrollActive = false;
  }, delay);
}

// Handle SPA (Single Page Application) navigation
function handleSpaNavigation(delay, isYouTubeShorts) {
  // For SPA navigation, we can't hide the whole page, so we create an overlay
  if (window.__slowScrollSpaActive) return;
  window.__slowScrollSpaActive = true;
  
  console.log(`SlowScroll: Delaying SPA navigation for ${delay}ms (YouTube Shorts: ${isYouTubeShorts})`);
  
  // Track the current URL to detect shorts navigation
  const currentUrl = window.location.href;
  
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
  
  // For YouTube Shorts, add interaction blocker
  if (isYouTubeShorts) {
    const blockInteractions = document.createElement('style');
    blockInteractions.id = 'slowscroll-spa-block-interactions';
    blockInteractions.textContent = `
      body * {
        pointer-events: none !important;
      }
      #slowscroll-spa-overlay {
        pointer-events: auto !important;
      }
    `;
    document.head.appendChild(blockInteractions);
  }
  
  // Immediately handle any possible background audio for YouTube Shorts
  if (isYouTubeShorts) {
    pauseAllYouTubeMedia();
  }
  
  // Add elements to DOM
  document.head.appendChild(style);
  overlay.appendChild(spinner);
  overlay.appendChild(message);
  document.body.appendChild(overlay);
  
  // Track media elements
  const mediaElements = [];
  
  // Function to pause all media elements
  function pauseAllMedia() {
    document.querySelectorAll('video, audio').forEach(media => {
      try {
        if (!media.paused) {
          // Check if we've already handled this media element
          const existingIndex = mediaElements.findIndex(item => item.element === media);
          if (existingIndex === -1) {
            // New media element
            mediaElements.push({
              element: media,
              wasMuted: media.muted,
              wasPlaying: true,
              currentTime: media.currentTime
            });
          }
          
          // Pause the media
          media.pause();
        }
      } catch (e) {
        console.error('Error pausing media:', e);
      }
    });
    
    // For YouTube Shorts specifically - try to use their player controls
    if (isYouTubeShorts) {
      // Try to find and click pause buttons
      document.querySelectorAll('.ytp-play-button').forEach(button => {
        try {
          if (button.title && button.title.toLowerCase().includes('pause')) {
            button.click();
          }
        } catch (e) {
          console.error('Error clicking pause button:', e);
        }
      });
    }
  }
  
  // More aggressive function specifically for YouTube to handle background audio
  function pauseAllYouTubeMedia() {
    // Stop all hidden videos that might be playing in the background
    document.querySelectorAll('video, audio, iframe').forEach(el => {
      try {
        // For video and audio elements
        if (el.pause) {
          el.pause();
          el.muted = true; // Mute temporarily
        }
        
        // For iframes - try to access contentWindow if possible
        if (el.tagName === 'IFRAME') {
          try {
            // This will only work for same-origin iframes
            const frameDoc = el.contentDocument || el.contentWindow.document;
            frameDoc.querySelectorAll('video, audio').forEach(media => {
              media.pause();
              media.muted = true;
            });
          } catch (frameErr) {
            // Cross-origin iframe - can't access directly
          }
        }
      } catch (e) {
        console.error('Error handling media element:', e);
      }
    });
    
    // Additional YouTube-specific handling
    // Try to find and click any player's pause button
    document.querySelectorAll('.ytp-play-button').forEach(button => {
      try {
        if (button.title && button.title.toLowerCase().includes('pause')) {
          button.click();
        }
      } catch (e) {
        console.error('Error interacting with YouTube player:', e);
      }
    });
    
    // Also try to find any mini player and close it
    document.querySelectorAll('.ytp-miniplayer-close-button').forEach(button => {
      try {
        button.click();
      } catch (e) {
        console.error('Error closing miniplayer:', e);
      }
    });
  }
  
  // Start pausing media
  pauseAllMedia();
  
  // Keep checking for new videos
  const pauseInterval = setInterval(() => {
    pauseAllMedia();
    
    // For YouTube Shorts, we need more aggressive handling
    if (isYouTubeShorts && (Math.random() < 0.5)) { // Only run about half the time to reduce overhead
      pauseAllYouTubeMedia();
    }
  }, 100);
  
  // Remove overlay after delay
  setTimeout(() => {
    // Stop pausing interval
    clearInterval(pauseInterval);
    
    // For YouTube Shorts - remove interaction blocker
    if (isYouTubeShorts) {
      const blockInteractions = document.getElementById('slowscroll-spa-block-interactions');
      if (blockInteractions) {
        blockInteractions.remove();
      }
      
      // Special handling for YouTube Shorts - force a layout update
      document.body.style.display = 'none';
      setTimeout(() => {
        document.body.style.display = '';
      }, 50);
    }
    
    // Remove overlay
    const existingOverlay = document.getElementById('slowscroll-spa-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }
    
    // For YouTube Shorts, unmute all videos
    if (isYouTubeShorts) {
      document.querySelectorAll('video, audio').forEach(media => {
        try {
          if (media.muted) {
            // Only unmute the active/visible players
            const rect = media.getBoundingClientRect();
            // Check if the video is visible in the viewport
            if (rect.width > 0 && rect.height > 0 && 
                rect.top >= 0 && rect.left >= 0 && 
                rect.top <= window.innerHeight && rect.left <= window.innerWidth) {
              media.muted = false;
            }
          }
        } catch (e) {
          console.error('Error unmuting media:', e);
        }
      });
    }
    
    // Special case for YouTube Shorts - we need to make the player active again
    if (isYouTubeShorts) {
      // After a short delay to let YouTube's player initialize fully
      setTimeout(() => {
        // Try to activate the player by clicking on container elements
        document.querySelectorAll('ytd-shorts, .html5-video-container, .html5-video-player, #shorts-container').forEach(container => {
          try {
            container.click();
          } catch (e) {
            console.error('Error clicking shorts container:', e);
          }
        });
        
        // Try clicking play buttons
        document.querySelectorAll('.ytp-play-button').forEach(button => {
          try {
            if (button.title && button.title.toLowerCase().includes('play')) {
              button.click();
            }
          } catch (e) {
            console.error('Error clicking play button:', e);
          }
        });
        
        // Force the player to show controls
        document.querySelectorAll('video').forEach(video => {
          try {
            // Create and dispatch synthetic mouse events to make controls appear
            ['mouseover', 'mousemove'].forEach(eventType => {
              const event = new MouseEvent(eventType, {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: video.getBoundingClientRect().width / 2,
                clientY: video.getBoundingClientRect().height / 2
              });
              video.dispatchEvent(event);
            });
          } catch (e) {
            console.error('Error dispatching mouse events:', e);
          }
        });
      }, 300);
    }
    
    window.__slowScrollSpaActive = false;
  }, delay);
}